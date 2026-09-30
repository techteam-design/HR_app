import { and, asc, eq, gte, inArray, lte, or, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { branches, departments, employees, leaveApplicationDays, leaveApplications, leaveTypes } from "@/db/schema";
import { can, type Role } from "@/lib/auth/rbac";
import { monthRange, type YearMonth } from "@/lib/calendar/month-grid";
import { canCancelAsApproverOrAdmin } from "@/lib/leave-engine/cancellation";
import type { LeaveTypeCode } from "@/lib/leave-engine/constants";
import type { HalfDaySlot } from "@/lib/leave-engine/half-day";
import type { IsoDate } from "@/lib/leave-engine/iso-date";

import { employeesApprovedBy, loadRouteContext } from "./approval-route.service";
import { queryApplications } from "./leave-application.service";

// Team calendar: approved and pending leave by date for one month.
// - Admin and HR viewer: everyone, with department and branch filters.
// - Manager: their direct reports, everyone whose route has them as an
//   approver at any level (branch defaults and overrides), and anyone whose
//   request is (or was) snapshotted to them.

export type CalendarEntry = {
  date: IsoDate;
  portion: number;
  applicationId: string;
  employeeId: string;
  employeeName: string;
  code: LeaveTypeCode;
  status: "pending" | "approved";
  halfDaySlot: HalfDaySlot | null;
};

export type CalendarApplication = {
  id: string;
  employeeName: string;
  branchName: string;
  departmentName: string;
  code: LeaveTypeCode;
  status: "pending" | "approved";
  startDate: IsoDate;
  endDate: IsoDate;
  totalDays: number;
  isHalfDay: boolean;
  halfDaySlot: HalfDaySlot | null;
  reason: string | null;
  progress: string;
  days: { date: IsoDate; portion: number }[];
  canCancel: boolean;
};

export type TeamCalendar = {
  scope: "everyone" | "team";
  entries: CalendarEntry[];
  applications: CalendarApplication[];
  departments: { id: string; name: string }[];
  branches: { id: string; name: string }[];
};

export async function getTeamCalendar(
  viewer: { id: string; role: Role },
  month: YearMonth,
  filter: { departmentId?: string; branchId?: string },
): Promise<TeamCalendar> {
  const db = getDb();
  const everyone = can(viewer.role, "view_all_records");
  const isAdmin = can(viewer.role, "decide_any_leave");
  const { start, end } = monthRange(month);

  const conditions: SQL[] = [
    inArray(leaveApplications.status, ["pending", "approved"]),
    gte(leaveApplicationDays.date, start),
    lte(leaveApplicationDays.date, end),
  ];
  if (everyone) {
    if (filter.departmentId) conditions.push(eq(employees.departmentId, filter.departmentId));
    if (filter.branchId) conditions.push(eq(employees.branchId, filter.branchId));
  } else {
    const context = await loadRouteContext();
    const team = new Set([
      ...context.employees.filter((e) => e.reportingManagerId === viewer.id && e.status !== "inactive").map((e) => e.id),
      ...employeesApprovedBy(context, viewer.id),
    ]);
    team.delete(viewer.id);
    const scope = [eq(leaveApplications.level1ApproverId, viewer.id), eq(leaveApplications.level2ApproverId, viewer.id)];
    if (team.size > 0) scope.push(inArray(leaveApplications.employeeId, [...team]));
    conditions.push(or(...scope)!);
  }

  const [rows, departmentRows, branchRows] = await Promise.all([
    db
      .select({
        date: leaveApplicationDays.date,
        portion: leaveApplicationDays.portion,
        applicationId: leaveApplications.id,
        employeeId: leaveApplications.employeeId,
        employeeName: employees.fullName,
        code: leaveTypes.code,
        status: leaveApplications.status,
        halfDaySlot: leaveApplications.halfDaySlot,
        branchName: branches.name,
        departmentName: departments.name,
      })
      .from(leaveApplicationDays)
      .innerJoin(leaveApplications, eq(leaveApplications.id, leaveApplicationDays.applicationId))
      .innerJoin(employees, eq(employees.id, leaveApplications.employeeId))
      .innerJoin(branches, eq(branches.id, employees.branchId))
      .innerJoin(departments, eq(departments.id, employees.departmentId))
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveApplications.leaveTypeId))
      .where(and(...conditions))
      .orderBy(asc(leaveApplicationDays.date), asc(employees.fullName)),
    everyone
      ? db.select({ id: departments.id, name: departments.name }).from(departments).orderBy(asc(departments.name))
      : Promise.resolve([]),
    everyone
      ? db.select({ id: branches.id, name: branches.name }).from(branches).orderBy(asc(branches.name))
      : Promise.resolve([]),
  ]);

  const entries: CalendarEntry[] = rows.map((row) => ({
    date: row.date,
    portion: Number(row.portion),
    applicationId: row.applicationId,
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    code: row.code,
    status: row.status as "pending" | "approved",
    halfDaySlot: row.halfDaySlot,
  }));

  const ids = [...new Set(rows.map((row) => row.applicationId))];
  const details = ids.length ? await queryApplications(inArray(leaveApplications.id, ids), []) : [];
  const units = new Map(rows.map((row) => [row.applicationId, row]));
  const applications = details.map((item): CalendarApplication => {
    const onRoute = item.approvers.some((approver) => approver.id === viewer.id);
    const unit = units.get(item.id)!;
    return {
      id: item.id,
      employeeName: unit.employeeName,
      branchName: unit.branchName,
      departmentName: unit.departmentName,
      code: item.code,
      status: item.status as "pending" | "approved",
      startDate: item.startDate,
      endDate: item.endDate,
      totalDays: item.totalDays,
      isHalfDay: item.isHalfDay,
      halfDaySlot: item.halfDaySlot,
      reason: item.reason,
      progress: item.progress.summary,
      days: item.days,
      canCancel: (isAdmin || onRoute) && canCancelAsApproverOrAdmin(item.status, isAdmin),
    };
  });

  return {
    scope: everyone ? "everyone" : "team",
    entries,
    applications,
    departments: departmentRows,
    branches: branchRows,
  };
}

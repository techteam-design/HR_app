import { and, asc, eq, gte, inArray, lte, or, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { branches, departments, employees, leaveApplicationDays, leaveApplications, leaveTypes } from "@/db/schema";
import { can, type Role } from "@/lib/auth/rbac";
import {
  detailedEntries,
  publicEntries,
  type CalendarEntry,
  type CalendarRow,
  type CalendarScope,
} from "@/lib/calendar/entries";
import { monthRange, type YearMonth } from "@/lib/calendar/month-grid";
import { canCancelAsApproverOrAdmin } from "@/lib/leave-engine/cancellation";
import type { LeaveTypeCode } from "@/lib/leave-engine/constants";
import type { HalfDaySlot } from "@/lib/leave-engine/half-day";
import type { IsoDate } from "@/lib/leave-engine/iso-date";

import { employeesApprovedBy, loadRouteContext } from "./approval-route.service";
import { withPhotoUrls } from "./employee-photo.service";
import { queryApplications } from "./leave-application.service";

// Team calendar: leave by date for one month.
// - Admin and HR viewer ("everyone"): everyone, approved and pending, with
//   department and branch filters.
// - Manager ("team"): their direct reports, everyone whose route has them as
//   an approver at any level (branch defaults and overrides), and anyone
//   whose request is (or was) snapshotted to them. Approved and pending.
// - Employee ("company"): everyone's APPROVED leave, without the leave type
//   or any other request detail (see publicEntries()), with department and
//   branch filters; the branch defaults to their own.

export type { CalendarEntry } from "@/lib/calendar/entries";

// Request details for the detail dialog (manager, HR viewer, admin only).
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
  scope: CalendarScope;
  entries: CalendarEntry[];
  // Empty in the employee view.
  applications: CalendarApplication[];
  // Filter options (everyone and company views only).
  departments: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  // The filters in effect: a branch id, "all", or undefined (no filter).
  filter: { departmentId?: string; branchId?: string };
};

export function calendarScopeFor(role: Role): CalendarScope {
  if (can(role, "view_all_records")) return "everyone";
  if (can(role, "approve_leave")) return "team";
  return "company";
}

export async function getTeamCalendar(
  viewer: { id: string; role: Role },
  month: YearMonth,
  filter: { departmentId?: string; branchId?: string },
): Promise<TeamCalendar> {
  const db = getDb();
  const scope = calendarScopeFor(viewer.role);
  const isAdmin = can(viewer.role, "decide_any_leave");
  const { start, end } = monthRange(month);

  const conditions: SQL[] = [gte(leaveApplicationDays.date, start), lte(leaveApplicationDays.date, end)];
  const effective: TeamCalendar["filter"] = {};

  if (scope === "team") {
    conditions.push(inArray(leaveApplications.status, ["pending", "approved"]));
    const context = await loadRouteContext();
    const team = new Set([
      ...context.employees.filter((e) => e.reportingManagerId === viewer.id && e.status !== "inactive").map((e) => e.id),
      ...employeesApprovedBy(context, viewer.id),
    ]);
    team.delete(viewer.id);
    const visible = [eq(leaveApplications.level1ApproverId, viewer.id), eq(leaveApplications.level2ApproverId, viewer.id)];
    if (team.size > 0) visible.push(inArray(leaveApplications.employeeId, [...team]));
    conditions.push(or(...visible)!);
  } else {
    // Employees never receive pending requests, not even to filter them out
    // later.
    conditions.push(
      scope === "company"
        ? eq(leaveApplications.status, "approved")
        : inArray(leaveApplications.status, ["pending", "approved"]),
    );
    let branchId = filter.branchId;
    if (scope === "company" && !branchId) {
      const [own] = await db
        .select({ branchId: employees.branchId })
        .from(employees)
        .where(eq(employees.id, viewer.id))
        .limit(1);
      branchId = own?.branchId;
    }
    if (filter.departmentId) {
      effective.departmentId = filter.departmentId;
      conditions.push(eq(employees.departmentId, filter.departmentId));
    }
    if (branchId) effective.branchId = branchId;
    if (branchId && branchId !== "all") conditions.push(eq(employees.branchId, branchId));
  }

  const withFilters = scope !== "team";
  const [rows, departmentRows, branchRows] = await Promise.all([
    db
      .select({
        date: leaveApplicationDays.date,
        portion: leaveApplicationDays.portion,
        halfDaySlot: leaveApplications.halfDaySlot,
        applicationId: leaveApplications.id,
        startDate: leaveApplications.startDate,
        endDate: leaveApplications.endDate,
        employeeId: leaveApplications.employeeId,
        fullName: employees.fullName,
        photoKey: employees.photoKey,
        branchName: branches.name,
        departmentName: departments.name,
        code: leaveTypes.code,
        status: leaveApplications.status,
      })
      .from(leaveApplicationDays)
      .innerJoin(leaveApplications, eq(leaveApplications.id, leaveApplicationDays.applicationId))
      .innerJoin(employees, eq(employees.id, leaveApplications.employeeId))
      .innerJoin(branches, eq(branches.id, employees.branchId))
      .innerJoin(departments, eq(departments.id, employees.departmentId))
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveApplications.leaveTypeId))
      .where(and(...conditions))
      .orderBy(asc(leaveApplicationDays.date), asc(employees.fullName)),
    withFilters
      ? db.select({ id: departments.id, name: departments.name }).from(departments).orderBy(asc(departments.name))
      : Promise.resolve([]),
    withFilters
      ? db.select({ id: branches.id, name: branches.name }).from(branches).orderBy(asc(branches.name))
      : Promise.resolve([]),
  ]);

  // One signed photo URL per person, not per day.
  const people = await withPhotoUrls([...new Map(rows.map((row) => [row.employeeId, row])).values()]);
  const photos = new Map(people.map((row) => [row.employeeId, row.photoUrl]));
  const calendarRows: CalendarRow[] = rows.map((row) => ({
    date: row.date,
    portion: Number(row.portion),
    halfDaySlot: row.halfDaySlot,
    applicationId: row.applicationId,
    startDate: row.startDate,
    endDate: row.endDate,
    employeeId: row.employeeId,
    fullName: row.fullName,
    photoUrl: photos.get(row.employeeId) ?? null,
    departmentName: row.departmentName,
    branchName: row.branchName,
    code: row.code,
    status: row.status as "pending" | "approved",
  }));

  const base = { scope, departments: departmentRows, branches: branchRows, filter: effective };
  if (scope === "company") {
    return { ...base, entries: publicEntries(calendarRows), applications: [] };
  }

  const ids = [...new Set(rows.map((row) => row.applicationId))];
  const details = ids.length ? await queryApplications(inArray(leaveApplications.id, ids), []) : [];
  const units = new Map(rows.map((row) => [row.applicationId, row]));
  const applications = details.map((item): CalendarApplication => {
    const onRoute = item.approvers.some((approver) => approver.id === viewer.id);
    const unit = units.get(item.id)!;
    return {
      id: item.id,
      employeeName: unit.fullName,
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

  return { ...base, entries: detailedEntries(calendarRows), applications };
}

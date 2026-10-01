import { and, asc, desc, eq, gte, inArray, isNotNull, lte, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/db";
import {
  approvalActions,
  approvalOverrides,
  branches,
  employees,
  leaveApplicationDays,
  leaveApplications,
  leaveTypes,
} from "@/db/schema";
import { levelLabel } from "@/lib/approvals/decision";
import type { LeaveTypeCode } from "@/lib/leave-engine/constants";
import { toClock, type HalfDaySlot } from "@/lib/leave-engine/half-day";
import { addDays, type IsoDate } from "@/lib/leave-engine/iso-date";
import { recentActivity, type ActivityEvent } from "@/lib/overview/activity";

import { withPhotoUrls } from "./employee-photo.service";

// Company leave overview for the admin and HR viewer dashboard. Read-only.
// "On leave today" counts APPROVED leave only; the next 7 days also list
// pending requests (labelled). Staff counts leave out admins (they take no
// leave).

export const OVERVIEW_DAYS_AHEAD = 7;
const PENDING_LIMIT = 5;
const ACTIVITY_LIMIT = 10;

export type OverviewPerson = {
  applicationId: string;
  employeeId: string;
  fullName: string;
  photoUrl: string | null;
  branchName: string;
  code: LeaveTypeCode;
  portion: number;
  halfDaySlot: HalfDaySlot | null;
  // The times stored when the half day was booked.
  halfDayStart: string | null;
  halfDayEnd: string | null;
  status: "pending" | "approved";
};

export type LeaveOverview = {
  today: IsoDate;
  onLeaveToday: OverviewPerson[];
  // The next 7 days after today, each with the people on leave.
  upcoming: { date: IsoDate; people: OverviewPerson[] }[];
  pending: {
    count: number;
    oldest: {
      id: string;
      employeeName: string;
      code: LeaveTypeCode;
      startDate: IsoDate;
      endDate: IsoDate;
      totalDays: number;
      submittedAt: Date;
      levelLabel: string;
    }[];
  };
  byBranch: { id: string; name: string; staff: number; onLeaveToday: number; pending: number }[];
  activity: ActivityEvent[];
};

export async function getLeaveOverview(today: IsoDate): Promise<LeaveOverview> {
  const db = getDb();
  const until = addDays(today, OVERVIEW_DAYS_AHEAD);
  const submitter = alias(employees, "submitter");
  const actor = alias(employees, "actor");
  const canceller = alias(employees, "canceller");
  const overrider = alias(employees, "overrider");
  // The request's type and dates, for the activity text.
  const requestColumns = {
    code: leaveTypes.code,
    startDate: leaveApplications.startDate,
    endDate: leaveApplications.endDate,
  };

  const [dayRows, staffRows, branchRows, pendingRows, pendingCount, submissions, decisions, cancellations, overrides] =
    await db.batch([
      db
        .select({
          date: leaveApplicationDays.date,
          portion: leaveApplicationDays.portion,
          applicationId: leaveApplications.id,
          employeeId: employees.id,
          fullName: employees.fullName,
          photoKey: employees.photoKey,
          branchName: branches.name,
          code: leaveTypes.code,
          halfDaySlot: leaveApplications.halfDaySlot,
          halfDayStart: leaveApplications.halfDayStart,
          halfDayEnd: leaveApplications.halfDayEnd,
          status: leaveApplications.status,
        })
        .from(leaveApplicationDays)
        .innerJoin(leaveApplications, eq(leaveApplications.id, leaveApplicationDays.applicationId))
        .innerJoin(employees, eq(employees.id, leaveApplications.employeeId))
        .innerJoin(branches, eq(branches.id, employees.branchId))
        .innerJoin(leaveTypes, eq(leaveTypes.id, leaveApplications.leaveTypeId))
        .where(
          and(
            inArray(leaveApplications.status, ["approved", "pending"]),
            gte(leaveApplicationDays.date, today),
            lte(leaveApplicationDays.date, until),
          ),
        )
        .orderBy(asc(leaveApplicationDays.date), asc(branches.name), asc(employees.fullName)),
      db
        .select({ id: employees.id, branchId: employees.branchId })
        .from(employees)
        .where(and(ne(employees.status, "inactive"), ne(employees.role, "admin"))),
      db.select({ id: branches.id, name: branches.name }).from(branches).where(eq(branches.isActive, true)).orderBy(asc(branches.name)),
      db
        .select({
          id: leaveApplications.id,
          employeeName: employees.fullName,
          branchId: employees.branchId,
          code: leaveTypes.code,
          startDate: leaveApplications.startDate,
          endDate: leaveApplications.endDate,
          totalDays: leaveApplications.totalDays,
          submittedAt: leaveApplications.submittedAt,
          approvalMode: leaveApplications.approvalMode,
          currentLevel: leaveApplications.currentLevel,
        })
        .from(leaveApplications)
        .innerJoin(employees, eq(employees.id, leaveApplications.employeeId))
        .innerJoin(leaveTypes, eq(leaveTypes.id, leaveApplications.leaveTypeId))
        .where(eq(leaveApplications.status, "pending"))
        .orderBy(asc(leaveApplications.submittedAt)),
      db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(leaveApplications)
        .where(eq(leaveApplications.status, "pending")),
      db
        .select({
          applicationId: leaveApplications.id,
          at: leaveApplications.submittedAt,
          employeeName: employees.fullName,
          actorName: submitter.fullName,
          ...requestColumns,
        })
        .from(leaveApplications)
        .innerJoin(employees, eq(employees.id, leaveApplications.employeeId))
        .innerJoin(leaveTypes, eq(leaveTypes.id, leaveApplications.leaveTypeId))
        .leftJoin(submitter, eq(submitter.id, leaveApplications.submittedBy))
        .orderBy(desc(leaveApplications.submittedAt))
        .limit(ACTIVITY_LIMIT),
      db
        .select({
          applicationId: approvalActions.applicationId,
          at: approvalActions.actedAt,
          action: approvalActions.action,
          level: approvalActions.level,
          approvalMode: leaveApplications.approvalMode,
          employeeName: employees.fullName,
          actorName: actor.fullName,
          ...requestColumns,
        })
        .from(approvalActions)
        .innerJoin(leaveApplications, eq(leaveApplications.id, approvalActions.applicationId))
        .innerJoin(employees, eq(employees.id, leaveApplications.employeeId))
        .innerJoin(leaveTypes, eq(leaveTypes.id, leaveApplications.leaveTypeId))
        .innerJoin(actor, eq(actor.id, approvalActions.approverId))
        .orderBy(desc(approvalActions.actedAt))
        .limit(ACTIVITY_LIMIT),
      db
        .select({
          applicationId: leaveApplications.id,
          at: leaveApplications.cancelledAt,
          employeeName: employees.fullName,
          actorName: canceller.fullName,
          ...requestColumns,
        })
        .from(leaveApplications)
        .innerJoin(employees, eq(employees.id, leaveApplications.employeeId))
        .innerJoin(leaveTypes, eq(leaveTypes.id, leaveApplications.leaveTypeId))
        .leftJoin(canceller, eq(canceller.id, leaveApplications.cancelledBy))
        .where(isNotNull(leaveApplications.cancelledAt))
        .orderBy(desc(leaveApplications.cancelledAt))
        .limit(ACTIVITY_LIMIT),
      // An admin's "Revoke approval" and "Approve anyway".
      db
        .select({
          applicationId: approvalOverrides.applicationId,
          at: approvalOverrides.actedAt,
          kind: approvalOverrides.kind,
          employeeName: employees.fullName,
          actorName: overrider.fullName,
          ...requestColumns,
        })
        .from(approvalOverrides)
        .innerJoin(leaveApplications, eq(leaveApplications.id, approvalOverrides.applicationId))
        .innerJoin(employees, eq(employees.id, leaveApplications.employeeId))
        .innerJoin(leaveTypes, eq(leaveTypes.id, leaveApplications.leaveTypeId))
        .innerJoin(overrider, eq(overrider.id, approvalOverrides.adminId))
        .orderBy(desc(approvalOverrides.actedAt))
        .limit(ACTIVITY_LIMIT),
    ]);

  // One signed photo URL per person, not per day.
  const photos = new Map(
    (await withPhotoUrls([...new Map(dayRows.map((row) => [row.employeeId, row])).values()])).map((row) => [
      row.employeeId,
      row.photoUrl,
    ]),
  );
  const withPhotos = dayRows.map((row) => ({ ...row, photoUrl: photos.get(row.employeeId) ?? null }));
  const people = withPhotos.map(
    (row): OverviewPerson & { date: IsoDate } => ({
      date: row.date,
      applicationId: row.applicationId,
      employeeId: row.employeeId,
      fullName: row.fullName,
      photoUrl: row.photoUrl,
      branchName: row.branchName,
      code: row.code,
      portion: Number(row.portion),
      halfDaySlot: row.halfDaySlot,
      halfDayStart: row.halfDayStart ? toClock(row.halfDayStart) : null,
      halfDayEnd: row.halfDayEnd ? toClock(row.halfDayEnd) : null,
      status: row.status as "pending" | "approved",
    }),
  );
  const onLeaveToday = people.filter((p) => p.date === today && p.status === "approved");
  const upcoming = Array.from({ length: OVERVIEW_DAYS_AHEAD }, (_, index) => {
    const date = addDays(today, index + 1);
    return { date, people: people.filter((p) => p.date === date) };
  });

  const onLeaveIds = new Set(onLeaveToday.map((p) => p.employeeId));
  const staffBranch = new Map(staffRows.map((row) => [row.id, row.branchId]));
  const byBranch = branchRows.map((branch) => ({
    id: branch.id,
    name: branch.name,
    staff: staffRows.filter((row) => row.branchId === branch.id).length,
    onLeaveToday: [...onLeaveIds].filter((id) => staffBranch.get(id) === branch.id).length,
    pending: pendingRows.filter((row) => row.branchId === branch.id).length,
  }));

  const events: ActivityEvent[] = [
    ...submissions.map((row) => ({
      kind: "submitted" as const,
      at: row.at,
      applicationId: row.applicationId,
      employeeName: row.employeeName,
      actorName: row.actorName,
      level: null,
      code: row.code,
      startDate: row.startDate,
      endDate: row.endDate,
    })),
    ...decisions.map((row) => ({
      kind: row.action,
      at: row.at,
      applicationId: row.applicationId,
      employeeName: row.employeeName,
      actorName: row.actorName,
      level: row.approvalMode === "two_level" ? row.level : null,
      code: row.code,
      startDate: row.startDate,
      endDate: row.endDate,
    })),
    ...cancellations.flatMap((row) =>
      row.at
        ? [
            {
              kind: "cancelled" as const,
              at: row.at,
              applicationId: row.applicationId,
              employeeName: row.employeeName,
              actorName: row.actorName,
              level: null,
              code: row.code,
              startDate: row.startDate,
              endDate: row.endDate,
            },
          ]
        : [],
    ),
    ...overrides.map((row) => ({
      kind: row.kind,
      at: row.at,
      applicationId: row.applicationId,
      employeeName: row.employeeName,
      actorName: row.actorName,
      level: null,
      code: row.code,
      startDate: row.startDate,
      endDate: row.endDate,
    })),
  ];

  return {
    today,
    onLeaveToday,
    upcoming,
    pending: {
      count: pendingCount[0]?.count ?? 0,
      oldest: pendingRows.slice(0, PENDING_LIMIT).map((row) => ({
        id: row.id,
        employeeName: row.employeeName,
        code: row.code,
        startDate: row.startDate,
        endDate: row.endDate,
        totalDays: Number(row.totalDays),
        submittedAt: row.submittedAt,
        levelLabel: levelLabel(row),
      })),
    },
    byBranch,
    activity: recentActivity(events, ACTIVITY_LIMIT),
  };
}

import { and, asc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/db";
import {
  approvalActions,
  approvalOverrides,
  branches,
  employees,
  leaveApplications,
  leaveTypes,
} from "@/db/schema";
import { monthOf, pageOf, summariseDecisions, type ApproverSummary, type Page } from "@/lib/approvals/decision-summary";
import { overrideFor, type OverrideAction } from "@/lib/approvals/override";
import type { ApplicationStatus } from "@/lib/leave-engine/cancellation";
import type { LeaveTypeCode } from "@/lib/leave-engine/constants";
import { toClock, type HalfDaySlot } from "@/lib/leave-engine/half-day";
import type { IsoDate } from "@/lib/leave-engine/iso-date";
import { BUSINESS_TIME_ZONE } from "@/lib/utils/dates";
import type { DecisionFilterAction, DecisionsFilter } from "@/validations/approval";

// "All decisions" on /approvals (admin only): every decision and override in
// a date range (by the Brunei date it was taken; default this month), a
// summary per approver, filters and paging. Everything is read in one
// db.batch; the company is small, so the range is filtered and paged in
// memory.

export type DecisionRow = {
  key: string;
  applicationId: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  branchName: string;
  code: LeaveTypeCode;
  startDate: IsoDate;
  endDate: IsoDate;
  totalDays: number;
  isHalfDay: boolean;
  halfDaySlot: HalfDaySlot | null;
  halfDayStart: string | null;
  halfDayEnd: string | null;
  decidedById: string;
  decidedByName: string;
  // Level of an approval decision on a two-level route; null on a
  // single-level route and for overrides.
  level: number | null;
  // An admin decided in place of the assigned approver.
  byAdmin: boolean;
  action: DecisionFilterAction;
  // Remarks of a decision, reason of an override.
  remarks: string | null;
  actedAt: Date;
  // The request's status now.
  status: ApplicationStatus;
  // Offered on the newest row of each request only.
  override: OverrideAction | null;
};

export type AllDecisions = {
  range: { from: IsoDate; to: IsoDate };
  summary: ApproverSummary[];
  page: Page<DecisionRow>;
  options: {
    approvers: { id: string; name: string }[];
    branches: { id: string; name: string }[];
    employees: { id: string; name: string }[];
  };
};

const onBusinessDates = (column: unknown, from: IsoDate, to: IsoDate): SQL =>
  sql`(${column} AT TIME ZONE ${BUSINESS_TIME_ZONE})::date BETWEEN ${from}::date AND ${to}::date`;

export async function listAllDecisions(filter: DecisionsFilter, today: IsoDate): Promise<AllDecisions> {
  const month = monthOf(today);
  const [from, to] = [filter.from ?? month.from, filter.to ?? month.to].sort();
  const db = getDb();
  const actor = alias(employees, "actor");
  const applicant = alias(employees, "applicant");
  const waitingFor = alias(employees, "waiting_for");
  const request = {
    applicationId: leaveApplications.id,
    employeeId: applicant.id,
    employeeName: applicant.fullName,
    branchId: branches.id,
    branchName: branches.name,
    code: leaveTypes.code,
    startDate: leaveApplications.startDate,
    endDate: leaveApplications.endDate,
    totalDays: leaveApplications.totalDays,
    isHalfDay: leaveApplications.isHalfDay,
    halfDaySlot: leaveApplications.halfDaySlot,
    halfDayStart: leaveApplications.halfDayStart,
    halfDayEnd: leaveApplications.halfDayEnd,
    status: leaveApplications.status,
    approvalMode: leaveApplications.approvalMode,
    level1ApproverId: leaveApplications.level1ApproverId,
    level2ApproverId: leaveApplications.level2ApproverId,
  };

  const [actionRows, overrideRows, waitingRows, approverRows, branchRows, employeeRows] = await db.batch([
    db
      .select({
        id: approvalActions.id,
        decidedById: approvalActions.approverId,
        decidedByName: actor.fullName,
        level: approvalActions.level,
        action: approvalActions.action,
        remarks: approvalActions.remarks,
        actedAt: approvalActions.actedAt,
        ...request,
      })
      .from(approvalActions)
      .innerJoin(leaveApplications, eq(leaveApplications.id, approvalActions.applicationId))
      .innerJoin(applicant, eq(applicant.id, leaveApplications.employeeId))
      .innerJoin(branches, eq(branches.id, applicant.branchId))
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveApplications.leaveTypeId))
      .innerJoin(actor, eq(actor.id, approvalActions.approverId))
      .where(onBusinessDates(approvalActions.actedAt, from, to)),
    db
      .select({
        id: approvalOverrides.id,
        decidedById: approvalOverrides.adminId,
        decidedByName: actor.fullName,
        kind: approvalOverrides.kind,
        reason: approvalOverrides.reason,
        actedAt: approvalOverrides.actedAt,
        ...request,
      })
      .from(approvalOverrides)
      .innerJoin(leaveApplications, eq(leaveApplications.id, approvalOverrides.applicationId))
      .innerJoin(applicant, eq(applicant.id, leaveApplications.employeeId))
      .innerJoin(branches, eq(branches.id, applicant.branchId))
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveApplications.leaveTypeId))
      .innerJoin(actor, eq(actor.id, approvalOverrides.adminId))
      .where(onBusinessDates(approvalOverrides.actedAt, from, to)),
    // Waiting now: pending requests by the approver of their current level.
    db
      .select({
        approverId: waitingFor.id,
        name: waitingFor.fullName,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(leaveApplications)
      .innerJoin(
        waitingFor,
        sql`${waitingFor.id} = CASE WHEN ${leaveApplications.currentLevel} = 2 AND ${leaveApplications.level2ApproverId} IS NOT NULL THEN ${leaveApplications.level2ApproverId} ELSE ${leaveApplications.level1ApproverId} END`,
      )
      .where(eq(leaveApplications.status, "pending"))
      .groupBy(waitingFor.id, waitingFor.fullName),
    db
      .select({ id: employees.id, name: employees.fullName })
      .from(employees)
      .where(and(inArray(employees.role, ["manager", "admin"]), ne(employees.status, "inactive")))
      .orderBy(asc(employees.fullName)),
    db.select({ id: branches.id, name: branches.name }).from(branches).orderBy(asc(branches.name)),
    db
      .select({ id: employees.id, name: employees.fullName })
      .from(employees)
      .where(ne(employees.role, "admin"))
      .orderBy(asc(employees.fullName)),
  ]);

  const names = new Map<string, string>();
  for (const row of [...actionRows, ...overrideRows]) names.set(row.decidedById, row.decidedByName);
  for (const row of waitingRows) names.set(row.approverId, row.name);
  const summary = summariseDecisions({
    approvers: approverRows,
    names,
    decisions: actionRows.map((row) => ({ approverId: row.decidedById, action: row.action })),
    overrides: overrideRows.map((row) => ({ adminId: row.decidedById })),
    waiting: waitingRows,
  });

  type Base = (typeof actionRows)[number] | (typeof overrideRows)[number];
  const toRow = (row: Base, action: DecisionFilterAction, level: number | null, remarks: string | null): DecisionRow => {
    const assigned = level === 2 ? row.level2ApproverId : row.level1ApproverId;
    return {
      key: row.id,
      applicationId: row.applicationId,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      branchId: row.branchId,
      branchName: row.branchName,
      code: row.code,
      startDate: row.startDate,
      endDate: row.endDate,
      totalDays: Number(row.totalDays),
      isHalfDay: row.isHalfDay,
      halfDaySlot: row.halfDaySlot,
      halfDayStart: row.halfDayStart ? toClock(row.halfDayStart) : null,
      halfDayEnd: row.halfDayEnd ? toClock(row.halfDayEnd) : null,
      decidedById: row.decidedById,
      decidedByName: row.decidedByName,
      level: level !== null && row.approvalMode === "two_level" ? level : null,
      byAdmin: level !== null && assigned !== row.decidedById,
      action,
      remarks,
      actedAt: row.actedAt,
      status: row.status,
      override: null,
    };
  };
  const all = [
    ...actionRows.map((row) => toRow(row, row.action, row.level, row.remarks)),
    ...overrideRows.map((row) => toRow(row, row.kind, null, row.reason)),
  ].sort((a, b) => b.actedAt.getTime() - a.actedAt.getTime());

  // The override is offered once per request, on its newest row.
  const offered = new Set<string>();
  for (const row of all) {
    if (offered.has(row.applicationId)) continue;
    offered.add(row.applicationId);
    row.override = overrideFor(row.status, true);
  }

  const filtered = all.filter(
    (row) =>
      (!filter.approverId || row.decidedById === filter.approverId) &&
      (!filter.action || row.action === filter.action) &&
      (!filter.branchId || row.branchId === filter.branchId) &&
      (!filter.employeeId || row.employeeId === filter.employeeId),
  );

  // Former approvers who decided in the range can still be filtered on.
  const approverOptions = new Map(approverRows.map((row) => [row.id, row.name]));
  for (const row of all) if (!approverOptions.has(row.decidedById)) approverOptions.set(row.decidedById, row.decidedByName);

  return {
    range: { from, to },
    summary,
    page: pageOf(filtered, filter.page),
    options: {
      approvers: [...approverOptions].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
      branches: branchRows,
      employees: employeeRows,
    },
  };
}

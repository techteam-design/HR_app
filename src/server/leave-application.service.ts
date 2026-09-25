import { and, asc, desc, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/db";
import { approvalWorkflows, employees, leaveApplicationDays, leaveApplications, leaveTypes } from "@/db/schema";
import { can, type Role } from "@/lib/auth/rbac";
import { cancelDecision, type ApplicationStatus } from "@/lib/leave-engine/cancellation";
import type { Classification, LeaveTypeCode } from "@/lib/leave-engine/constants";
import { sumDaysInPeriod, totalDays, type SelectedDay } from "@/lib/leave-engine/day-selection";
import type { HalfDaySlot } from "@/lib/leave-engine/half-day";
import { addDays, type IsoDate } from "@/lib/leave-engine/iso-date";
import {
  baseEntitlement,
  nextPeriodFor,
  periodRelation,
  periodsOf,
  projectedPeriodBalance,
  storedPeriodBalance,
  type PeriodBalance,
} from "@/lib/leave-engine/request-period";
import { computeBalance } from "@/lib/leave-engine/balance";
import { issuesByField, validateApplication, type ApplicationRequest } from "@/lib/leave-engine/validation";
import {
  MIN_CANCEL_NOTE_LENGTH,
  type ApplicationInput,
  type CancelApplicationInput,
  type HistoryFilter,
} from "@/validations/leave";

import { databaseEntitlementStore } from "./entitlement.service";
import { getEmployeeBalances } from "./leave-balance.service";
import { loadLeavePolicies } from "./leave-policy.service";
import { fail, UUID, type ServiceResult } from "./service-result";

// Leave applications: submit (own or by an admin on someone's behalf), list,
// cancel. Every rule lives in src/lib/leave-engine/validation.ts; this file
// loads its inputs and writes the result.
//
// Known gap (Sprint 3): submission checks the balance and then inserts, in two
// steps (neon-http has no interactive transactions), so two simultaneous
// submissions could both pass the balance check.

// Booked dates this far back are sent to the form for the overlap check (the
// server always checks the exact range).
const BOOKED_LOOKBACK_DAYS = 60;

export type Approver = { level: 1 | 2; id: string; name: string };

export type ApprovalRoute = { mode: "single" | "two_level"; approvers: Approver[] };

async function findApprovalRoute(employeeId: string): Promise<ApprovalRoute | null> {
  const level1 = alias(employees, "level1_approver");
  const level2 = alias(employees, "level2_approver");
  const [row] = await getDb()
    .select({
      mode: approvalWorkflows.mode,
      level1Id: approvalWorkflows.level1ApproverId,
      level1Name: level1.fullName,
      level2Id: approvalWorkflows.level2ApproverId,
      level2Name: level2.fullName,
    })
    .from(approvalWorkflows)
    .innerJoin(level1, eq(level1.id, approvalWorkflows.level1ApproverId))
    .leftJoin(level2, eq(level2.id, approvalWorkflows.level2ApproverId))
    .where(eq(approvalWorkflows.employeeId, employeeId))
    .limit(1);
  if (!row) return null;
  const approvers: Approver[] = [{ level: 1, id: row.level1Id, name: row.level1Name }];
  if (row.mode === "two_level" && row.level2Id && row.level2Name) {
    approvers.push({ level: 2, id: row.level2Id, name: row.level2Name });
  }
  // A two-level route without its second approver is incomplete.
  if (row.mode === "two_level" && approvers.length < 2) return null;
  return { mode: row.mode, approvers };
}

type BookedDay = { date: IsoDate; portion: number; status: string; leaveTypeId: string };

// The employee's pending and approved dates from `from` onward (any type).
async function findBookedDays(employeeId: string, from: IsoDate): Promise<BookedDay[]> {
  const rows = await getDb()
    .select({
      date: leaveApplicationDays.date,
      portion: leaveApplicationDays.portion,
      status: leaveApplications.status,
      leaveTypeId: leaveApplications.leaveTypeId,
    })
    .from(leaveApplicationDays)
    .innerJoin(leaveApplications, eq(leaveApplications.id, leaveApplicationDays.applicationId))
    .where(
      and(
        eq(leaveApplications.employeeId, employeeId),
        inArray(leaveApplications.status, ["pending", "approved"]),
        gte(leaveApplicationDays.date, from),
      ),
    );
  return rows.map((row) => ({ ...row, portion: Number(row.portion) }));
}

// Portion booked per date, date order.
function bookedByDate(booked: BookedDay[]): { date: IsoDate; portion: number }[] {
  const byDate = new Map<IsoDate, number>();
  for (const day of booked) byDate.set(day.date, (byDate.get(day.date) ?? 0) + day.portion);
  return [...byDate].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, portion]) => ({ date, portion }));
}

// ---------------------------------------------------------------------------
// Context for the form and the server check
// ---------------------------------------------------------------------------

export type ApplyLeaveType = {
  leaveTypeId: string;
  code: LeaveTypeCode;
  name: string;
  policy: { eligibilityMonthsLocal: number; eligibilityMonthsForeign: number; advanceNoticeDaysForeign: number };
  eligibleFrom: IsoDate;
  // The current period's stored balance, and the next period's projected
  // (base entitlement only) balance.
  current: PeriodBalance | null;
  next: PeriodBalance | null;
};

export type ApplyContext = {
  today: IsoDate;
  employee: {
    id: string;
    fullName: string;
    joinDate: IsoDate;
    classification: Classification;
    status: "active" | "inactive" | "probation";
  };
  approvalRoute: ApprovalRoute | null;
  types: ApplyLeaveType[];
  // Own pending/approved dates from BOOKED_LOOKBACK_DAYS ago onward, with
  // the portion booked on each.
  bookedDays: { date: IsoDate; portion: number }[];
};

async function loadContext(
  employeeId: string,
  today: IsoDate,
  bookedFrom: IsoDate,
): Promise<(ApplyContext & { booked: BookedDay[] }) | null> {
  if (!UUID.test(employeeId)) return null;
  const policies = await loadLeavePolicies();
  const [balances, person, approvalRoute, booked] = await Promise.all([
    getEmployeeBalances(employeeId, today, policies),
    getDb()
      .select({ fullName: employees.fullName })
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1),
    findApprovalRoute(employeeId),
    findBookedDays(employeeId, bookedFrom),
  ]);
  if (!balances || !person[0]) return null;

  const types = balances.types.map((type): ApplyLeaveType => {
    const policy = policies.find((p) => p.code === type.code)!;
    const current =
      type.balance && type.periodStart && type.periodEnd
        ? storedPeriodBalance({ start: type.periodStart, end: type.periodEnd }, type.balance)
        : null;
    const nextPeriod = nextPeriodFor(type.code, balances.joinDate, today);
    const next = nextPeriod
      ? projectedPeriodBalance(
          nextPeriod,
          baseEntitlement(policy, balances.joinDate, nextPeriod),
          sumDaysInPeriod(
            booked.filter((day) => day.leaveTypeId === type.leaveTypeId),
            nextPeriod,
          ),
        )
      : null;
    return {
      leaveTypeId: type.leaveTypeId,
      code: type.code,
      name: type.name,
      policy: {
        eligibilityMonthsLocal: policy.eligibilityMonthsLocal,
        eligibilityMonthsForeign: policy.eligibilityMonthsForeign,
        advanceNoticeDaysForeign: policy.advanceNoticeDaysForeign,
      },
      eligibleFrom: type.eligibleFrom,
      current,
      next,
    };
  });

  return {
    today,
    employee: {
      id: balances.employeeId,
      fullName: person[0].fullName,
      joinDate: balances.joinDate,
      classification: balances.classification,
      status: balances.status,
    },
    approvalRoute,
    types,
    bookedDays: bookedByDate(booked),
    booked,
  };
}

// For /leave/apply and the admin "apply on behalf" page.
export async function getApplyContext(employeeId: string, today: IsoDate): Promise<ApplyContext | null> {
  const context = await loadContext(employeeId, today, addDays(today, -BOOKED_LOOKBACK_DAYS));
  if (!context) return null;
  const { today: onDate, employee, approvalRoute, types, bookedDays } = context;
  return { today: onDate, employee, approvalRoute, types, bookedDays };
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

export type SubmitOptions =
  | { onBehalf: false }
  | { onBehalf: true; admin: { id: string }; noticeOverride: boolean; overrideReason: string | null };

export type Submitted = { id: string; status: "pending"; totalDays: number; approvers: Approver[] };

export async function submitApplication(
  employeeId: string,
  input: ApplicationInput,
  today: IsoDate,
  options: SubmitOptions,
): Promise<ServiceResult<Submitted>> {
  const dates = [...input.dates].sort();
  const bookedFrom = [dates[0] ?? input.startDate, addDays(today, -BOOKED_LOOKBACK_DAYS)].sort()[0];
  const context = await loadContext(employeeId, today, bookedFrom);
  if (!context) return fail(404, "Employee not found");
  if (context.employee.status === "inactive") {
    return fail(409, "This employee is inactive. Reactivate them before applying for leave.");
  }

  const type = context.types.find((t) => t.code === input.leaveType);
  if (!type) return fail(400, "Please check the highlighted fields.", { fieldErrors: { leaveType: "Choose a leave type" } });

  const halfDay = input.dayType === "half";
  const days: SelectedDay[] = dates.map((date) => ({ date, portion: halfDay ? 0.5 : 1 }));
  const request: ApplicationRequest = {
    leaveType: input.leaveType,
    startDate: input.startDate,
    endDate: input.endDate,
    halfDay,
    halfDaySlot: halfDay ? input.halfDaySlot : null,
    days,
  };

  const balances = [type.current, type.next].filter((b): b is PeriodBalance => b !== null);
  // Backdated into an earlier period (MC across 1 January, or an admin):
  // that period's stored row.
  const periods = periodsOf(input.leaveType, context.employee.joinDate, dates);
  if (
    periods.length === 1 &&
    periodRelation(input.leaveType, context.employee.joinDate, today, periods[0]) === "past"
  ) {
    const past = await pastPeriodBalance(context.employee.id, type, periods[0]);
    if (past) balances.push(past);
  }

  const noticeApplies = input.leaveType === "annual" && context.employee.classification === "foreign";
  const noticeOverridden = options.onBehalf && options.noticeOverride && noticeApplies;
  const issues = validateApplication(request, {
    today,
    employee: context.employee,
    policy: type.policy,
    balances,
    bookedDays: context.bookedDays,
    hasApprovalRoute: context.approvalRoute !== null,
    onBehalf: options.onBehalf,
    noticeOverridden,
  });
  if (issues.length > 0) {
    return fail(400, issues.length === 1 ? issues[0].message : "Please fix the problems below.", {
      fieldErrors: issuesByField(issues),
    });
  }

  const route = context.approvalRoute!;
  const [level1, level2] = route.approvers;
  const id = crypto.randomUUID();
  const db = getDb();
  const total = totalDays(days);

  // One batch: the application and its dates are saved together or not at all.
  await db.batch([
    db.insert(leaveApplications).values({
      id,
      employeeId: context.employee.id,
      leaveTypeId: type.leaveTypeId,
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      isHalfDay: halfDay,
      halfDaySlot: halfDay ? input.halfDaySlot : null,
      totalDays: String(total),
      reason: input.reason,
      status: "pending",
      currentLevel: 1,
      approvalMode: route.mode,
      level1ApproverId: level1.id,
      level2ApproverId: level2?.id ?? null,
      noticeOverridden,
      overrideBy: noticeOverridden && options.onBehalf ? options.admin.id : null,
      overrideReason: noticeOverridden && options.onBehalf ? options.overrideReason : null,
      submittedBy: options.onBehalf ? options.admin.id : null,
    }),
    db.insert(leaveApplicationDays).values(
      days.map((day) => ({ applicationId: id, date: day.date, portion: day.portion.toFixed(1) })),
    ),
  ]);

  return { ok: true, id, status: "pending", totalDays: total, approvers: route.approvers };
}

async function pastPeriodBalance(
  employeeId: string,
  type: ApplyLeaveType,
  period: { start: IsoDate; end: IsoDate },
): Promise<PeriodBalance | null> {
  const [row] = (await databaseEntitlementStore.findEntitlements([employeeId], [period.start])).filter(
    (r) => r.leaveTypeId === type.leaveTypeId,
  );
  if (!row) return null;
  const usage = (await databaseEntitlementStore.usageFor([row.id])).get(row.id);
  if (!usage) return null;
  return storedPeriodBalance(
    { start: row.periodStart, end: row.periodEnd },
    computeBalance({
      entitled: row.entitledDays,
      carriedForward: row.carriedForwardDays,
      adjustments: usage.adjustments,
      approvedDays: usage.approved,
      pendingDays: usage.pending,
    }),
  );
}

// ---------------------------------------------------------------------------
// History and upcoming leave
// ---------------------------------------------------------------------------

export type ApplicationItem = {
  id: string;
  code: LeaveTypeCode;
  typeName: string;
  startDate: IsoDate;
  endDate: IsoDate;
  isHalfDay: boolean;
  halfDaySlot: HalfDaySlot | null;
  totalDays: number;
  reason: string | null;
  status: ApplicationStatus;
  submittedAt: Date;
  approvers: Approver[];
  // Set when an admin applied on the employee's behalf.
  submittedByName: string | null;
  noticeOverridden: boolean;
  cancelledAt: Date | null;
  cancelledByName: string | null;
  cancellationNote: string | null;
  days: { date: IsoDate; portion: number }[];
};

async function queryApplications(where: SQL | undefined, order: SQL[], limit?: number): Promise<ApplicationItem[]> {
  const level1 = alias(employees, "level1_approver");
  const level2 = alias(employees, "level2_approver");
  const submitter = alias(employees, "submitter");
  const canceller = alias(employees, "canceller");
  const db = getDb();
  const query = db
    .select({
      id: leaveApplications.id,
      code: leaveTypes.code,
      typeName: leaveTypes.name,
      startDate: leaveApplications.startDate,
      endDate: leaveApplications.endDate,
      isHalfDay: leaveApplications.isHalfDay,
      halfDaySlot: leaveApplications.halfDaySlot,
      totalDays: leaveApplications.totalDays,
      reason: leaveApplications.reason,
      status: leaveApplications.status,
      submittedAt: leaveApplications.submittedAt,
      level1Id: leaveApplications.level1ApproverId,
      level1Name: level1.fullName,
      level2Id: leaveApplications.level2ApproverId,
      level2Name: level2.fullName,
      submittedByName: submitter.fullName,
      noticeOverridden: leaveApplications.noticeOverridden,
      cancelledAt: leaveApplications.cancelledAt,
      cancelledByName: canceller.fullName,
      cancellationNote: leaveApplications.cancellationNote,
    })
    .from(leaveApplications)
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveApplications.leaveTypeId))
    .innerJoin(level1, eq(level1.id, leaveApplications.level1ApproverId))
    .leftJoin(level2, eq(level2.id, leaveApplications.level2ApproverId))
    .leftJoin(submitter, eq(submitter.id, leaveApplications.submittedBy))
    .leftJoin(canceller, eq(canceller.id, leaveApplications.cancelledBy))
    .where(where)
    .orderBy(...order);
  const rows = limit ? await query.limit(limit) : await query;
  if (rows.length === 0) return [];

  const dayRows = await db
    .select({
      applicationId: leaveApplicationDays.applicationId,
      date: leaveApplicationDays.date,
      portion: leaveApplicationDays.portion,
    })
    .from(leaveApplicationDays)
    .where(
      inArray(
        leaveApplicationDays.applicationId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(leaveApplicationDays.date));

  return rows.map((row) => {
    const approvers: Approver[] = [{ level: 1, id: row.level1Id, name: row.level1Name }];
    if (row.level2Id && row.level2Name) approvers.push({ level: 2, id: row.level2Id, name: row.level2Name });
    return {
      id: row.id,
      code: row.code,
      typeName: row.typeName,
      startDate: row.startDate,
      endDate: row.endDate,
      isHalfDay: row.isHalfDay,
      halfDaySlot: row.halfDaySlot,
      totalDays: Number(row.totalDays),
      reason: row.reason,
      status: row.status,
      submittedAt: row.submittedAt,
      approvers,
      submittedByName: row.submittedByName,
      noticeOverridden: row.noticeOverridden,
      cancelledAt: row.cancelledAt,
      cancelledByName: row.cancelledByName,
      cancellationNote: row.cancellationNote,
      days: dayRows
        .filter((day) => day.applicationId === row.id)
        .map((day) => ({ date: day.date, portion: Number(day.portion) })),
    };
  });
}

// An employee's requests, newest first, with optional filters.
export async function listApplications(employeeId: string, filter: HistoryFilter = {}): Promise<ApplicationItem[]> {
  if (!UUID.test(employeeId)) return [];
  const conditions: SQL[] = [eq(leaveApplications.employeeId, employeeId)];
  if (filter.type) conditions.push(eq(leaveTypes.code, filter.type));
  if (filter.status) conditions.push(eq(leaveApplications.status, filter.status));
  if (filter.year) conditions.push(sql`extract(year from ${leaveApplications.startDate}) = ${filter.year}`);
  return queryApplications(and(...conditions), [desc(leaveApplications.submittedAt)]);
}

// Years that have requests (for the history filter), newest first.
export async function applicationYears(employeeId: string): Promise<number[]> {
  if (!UUID.test(employeeId)) return [];
  const rows = await getDb()
    .selectDistinct({ year: sql<number>`extract(year from ${leaveApplications.startDate})::int`.mapWith(Number) })
    .from(leaveApplications)
    .where(eq(leaveApplications.employeeId, employeeId));
  return rows.map((row) => row.year).sort((a, b) => b - a);
}

// Pending and approved requests that have not ended yet, soonest first.
export async function listUpcoming(employeeId: string, today: IsoDate, limit = 3): Promise<ApplicationItem[]> {
  if (!UUID.test(employeeId)) return [];
  return queryApplications(
    and(
      eq(leaveApplications.employeeId, employeeId),
      inArray(leaveApplications.status, ["pending", "approved"]),
      gte(leaveApplications.endDate, today),
    ),
    [asc(leaveApplications.startDate)],
    limit,
  );
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

// The employee cancels their own request (pending, or approved before its
// first day); an admin cancels any pending or approved request with a note.
// Someone else's request is "not found" unless the actor is an admin.
export async function cancelApplication(
  actor: { id: string; role: Role },
  applicationId: string,
  input: CancelApplicationInput,
  today: IsoDate,
): Promise<ServiceResult> {
  if (!UUID.test(applicationId)) return fail(404, "Leave request not found");
  const db = getDb();
  const [application] = await db
    .select({
      id: leaveApplications.id,
      employeeId: leaveApplications.employeeId,
      status: leaveApplications.status,
      startDate: leaveApplications.startDate,
    })
    .from(leaveApplications)
    .where(eq(leaveApplications.id, applicationId))
    .limit(1);

  const isOwner = application?.employeeId === actor.id;
  const isAdmin = can(actor.role, "manage_employees");
  if (!application || (!isOwner && !isAdmin)) return fail(404, "Leave request not found");

  const decision = cancelDecision({
    status: application.status,
    firstDate: application.startDate,
    today,
    isOwner,
    isAdmin,
  });
  if (!decision.allowed) return fail(409, decision.reason);

  const note = input.note;
  if (decision.noteRequired && (note?.length ?? 0) < MIN_CANCEL_NOTE_LENGTH) {
    return fail(400, "Please check the highlighted fields.", {
      fieldErrors: {
        note: `A note is required when an admin cancels a request (at least ${MIN_CANCEL_NOTE_LENGTH} characters).`,
      },
    });
  }

  // Conditional update: nothing changes if the status moved on in the
  // meantime, or (for the employee) if an approved request has started.
  const updated = await db
    .update(leaveApplications)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancelledBy: actor.id,
      cancellationNote: decision.asAdmin ? note : null,
    })
    .where(
      and(
        eq(leaveApplications.id, application.id),
        eq(leaveApplications.status, application.status),
        decision.asAdmin || application.status === "pending"
          ? undefined
          : sql`${leaveApplications.startDate} > ${today}`,
      ),
    )
    .returning({ id: leaveApplications.id });
  if (updated.length === 0) {
    return fail(409, "This request has just changed. Please refresh the page and try again.");
  }
  return { ok: true };
}

import { and, eq, gte, inArray, lte, ne, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { leaveAdjustments, leaveApplicationDays, leaveApplications, leaveEntitlements } from "@/db/schema";
import { isLockTimeout, withEmployeeLock, type Reader, type Tx } from "@/db/transaction";
import { computeCarryForward } from "@/lib/leave-engine/carry-forward";
import {
  carryForwardCorrection,
  carryForwardCorrectionNote,
  type CarryForwardEvent,
} from "@/lib/leave-engine/carry-forward-correction";
import { previousPeriodFor } from "@/lib/leave-engine/entitlement-plan";
import type { IsoDate } from "@/lib/leave-engine/iso-date";
import { nextPeriodStart, type LeavePeriod } from "@/lib/leave-engine/leave-year";
import {
  baseEntitlement,
  periodOf,
  periodRelation,
  type PeriodBalance,
  type PeriodRelation,
} from "@/lib/leave-engine/request-period";
import { formatDateRange } from "@/lib/utils/dates";

import type { LeavePolicy } from "./leave-policy.service";
import { fail, type ServiceResult } from "./service-result";

const BUSY = "Another change to this employee's leave is being saved. Please try again.";

// Runs a balance-affecting write inside the employee's locked transaction
// (withEmployeeLock). A result with ok: false is returned as is (nothing
// was written: the work returns before its first write). A lock timeout
// becomes a 409 "try again".
export async function runLocked<T extends object>(
  employeeId: string,
  work: (tx: Tx) => Promise<ServiceResult<T>>,
): Promise<ServiceResult<T>> {
  try {
    return await withEmployeeLock(employeeId, work);
  } catch (error) {
    if (isLockTimeout(error)) return fail(409, BUSY);
    throw error;
  }
}

// Balance reads for ONE leave period, written against a Reader so they run
// either on getDb() or inside the employee's locked transaction
// (withEmployeeLock). Used for the authoritative re-checks of submission,
// final approval and adjustments, and for the approver queue's balances.

const dayTotal = (column: unknown) => sql<number>`coalesce(sum(${column}), 0)`.mapWith(Number);

export type PeriodRow = {
  id: string;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  entitledDays: number;
  carriedForwardDays: number;
};

export async function findPeriodRow(
  reader: Reader,
  employeeId: string,
  leaveTypeId: string,
  periodStart: IsoDate,
): Promise<PeriodRow | null> {
  const [row] = await reader
    .select({
      id: leaveEntitlements.id,
      periodStart: leaveEntitlements.periodStart,
      periodEnd: leaveEntitlements.periodEnd,
      entitledDays: leaveEntitlements.entitledDays,
      carriedForwardDays: leaveEntitlements.carriedForwardDays,
    })
    .from(leaveEntitlements)
    .where(
      and(
        eq(leaveEntitlements.employeeId, employeeId),
        eq(leaveEntitlements.leaveTypeId, leaveTypeId),
        eq(leaveEntitlements.periodStart, periodStart),
      ),
    )
    .limit(1);
  if (!row) return null;
  return { ...row, entitledDays: Number(row.entitledDays), carriedForwardDays: Number(row.carriedForwardDays) };
}

// Approved and pending days of one employee and leave type dated inside the
// period (per date, from leave_application_days).
export async function periodUsage(
  reader: Reader,
  employeeId: string,
  leaveTypeId: string,
  period: LeavePeriod,
  excludeApplicationId?: string,
): Promise<{ approved: number; pending: number }> {
  const conditions: SQL[] = [
    eq(leaveApplications.employeeId, employeeId),
    eq(leaveApplications.leaveTypeId, leaveTypeId),
    inArray(leaveApplications.status, ["approved", "pending"]),
    gte(leaveApplicationDays.date, period.start),
    lte(leaveApplicationDays.date, period.end),
  ];
  if (excludeApplicationId) conditions.push(ne(leaveApplications.id, excludeApplicationId));
  const rows = await reader
    .select({ status: leaveApplications.status, total: dayTotal(leaveApplicationDays.portion) })
    .from(leaveApplicationDays)
    .innerJoin(leaveApplications, eq(leaveApplications.id, leaveApplicationDays.applicationId))
    .where(and(...conditions))
    .groupBy(leaveApplications.status);
  return {
    approved: rows.find((row) => row.status === "approved")?.total ?? 0,
    pending: rows.find((row) => row.status === "pending")?.total ?? 0,
  };
}

// Sum of an entitlement row's adjustments, and the part of it that is
// carry-forward recalculation.
export async function rowAdjustments(reader: Reader, entitlementId: string): Promise<{ total: number; recalculations: number }> {
  const [row] = await reader
    .select({
      total: dayTotal(leaveAdjustments.days),
      recalculations: dayTotal(
        sql`case when ${leaveAdjustments.reason} = 'carry_forward_recalculation' then ${leaveAdjustments.days} end`,
      ),
    })
    .from(leaveAdjustments)
    .where(eq(leaveAdjustments.entitlementId, entitlementId));
  return { total: row?.total ?? 0, recalculations: row?.recalculations ?? 0 };
}

// The balance of the period a request's dates fall in, relative to today:
// current/past = the stored row; next = its base entitlement only (see
// request-period.ts); beyond = none. `pending` excludes excludeApplicationId
// (the request being decided). Null when there is no balance.
export async function periodBalance(
  reader: Reader,
  {
    employee,
    policy,
    period,
    today,
    excludeApplicationId,
  }: {
    employee: { id: string; joinDate: IsoDate };
    policy: LeavePolicy;
    period: LeavePeriod;
    today: IsoDate;
    excludeApplicationId?: string;
  },
): Promise<PeriodBalance | null> {
  const relation = periodRelation(policy.code, employee.joinDate, today, period);
  if (!relation || relation === "beyond") return null;
  const usage = await periodUsage(reader, employee.id, policy.leaveTypeId, period, excludeApplicationId);
  if (relation === "next") return toPeriodBalance({ employee, policy, period, usage, row: null });

  const row = await findPeriodRow(reader, employee.id, policy.leaveTypeId, period.start);
  if (!row) return null;
  const adjustments = await rowAdjustments(reader, row.id);
  return toPeriodBalance({ employee, policy, period, usage, row: { ...row, adjustments: adjustments.total } });
}

// The balance from the reads above. `row` null = the next period (projected
// from its base entitlement; carry-forward and adjustments ignored).
function toPeriodBalance({
  employee,
  policy,
  period,
  usage,
  row,
}: {
  employee: { joinDate: IsoDate };
  policy: LeavePolicy;
  period: LeavePeriod;
  usage: { approved: number; pending: number };
  row: (PeriodRow & { adjustments: number }) | null;
}): PeriodBalance {
  if (!row) {
    const available = baseEntitlement(policy, employee.joinDate, period) - usage.approved;
    return {
      periodStart: period.start,
      periodEnd: period.end,
      source: "projected",
      available,
      pending: usage.pending,
      availableAfterPending: available - usage.pending,
    };
  }
  const available = row.entitledDays + row.carriedForwardDays + row.adjustments - usage.approved;
  return {
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    source: "stored",
    available,
    pending: usage.pending,
    availableAfterPending: available - usage.pending,
  };
}

export type BalanceRequest = {
  // Returned map key (e.g. the application id).
  key: string;
  employee: { id: string; joinDate: IsoDate };
  policy: LeavePolicy;
  period: LeavePeriod;
  excludeApplicationId?: string;
};

// periodBalance() for many requests at once (the approver queue), on getDb():
// the same rules, but the reads for ALL requests go in one db.batch (their
// days, and the stored rows with their adjustment totals), so the number of
// queries does not grow with the queue. Null where there is no balance.
export async function periodBalances(
  requests: readonly BalanceRequest[],
  today: IsoDate,
): Promise<Map<string, PeriodBalance | null>> {
  const result = new Map<string, PeriodBalance | null>();
  const active: (BalanceRequest & { relation: Exclude<PeriodRelation, "beyond"> })[] = [];
  for (const request of requests) {
    const relation = periodRelation(request.policy.code, request.employee.joinDate, today, request.period);
    if (!relation || relation === "beyond") result.set(request.key, null);
    else active.push({ ...request, relation });
  }
  if (active.length === 0) return result;

  const unique = <T,>(values: T[]) => [...new Set(values)];
  const employeeIds = unique(active.map((r) => r.employee.id));
  const leaveTypeIds = unique(active.map((r) => r.policy.leaveTypeId));
  const from = active.map((r) => r.period.start).sort()[0];
  const to = active.map((r) => r.period.end).sort().at(-1)!;
  const storedStarts = unique(active.filter((r) => r.relation !== "next").map((r) => r.period.start));

  const db = getDb();
  const daysQuery = db
    .select({
      applicationId: leaveApplications.id,
      employeeId: leaveApplications.employeeId,
      leaveTypeId: leaveApplications.leaveTypeId,
      status: leaveApplications.status,
      date: leaveApplicationDays.date,
      portion: leaveApplicationDays.portion,
    })
    .from(leaveApplicationDays)
    .innerJoin(leaveApplications, eq(leaveApplications.id, leaveApplicationDays.applicationId))
    .where(
      and(
        inArray(leaveApplications.employeeId, employeeIds),
        inArray(leaveApplications.leaveTypeId, leaveTypeIds),
        inArray(leaveApplications.status, ["approved", "pending"]),
        gte(leaveApplicationDays.date, from),
        lte(leaveApplicationDays.date, to),
      ),
    );
  const rowsQuery = db
    .select({
      id: leaveEntitlements.id,
      employeeId: leaveEntitlements.employeeId,
      leaveTypeId: leaveEntitlements.leaveTypeId,
      periodStart: leaveEntitlements.periodStart,
      periodEnd: leaveEntitlements.periodEnd,
      entitledDays: leaveEntitlements.entitledDays,
      carriedForwardDays: leaveEntitlements.carriedForwardDays,
      adjustments: dayTotal(leaveAdjustments.days),
    })
    .from(leaveEntitlements)
    .leftJoin(leaveAdjustments, eq(leaveAdjustments.entitlementId, leaveEntitlements.id))
    .where(
      and(
        inArray(leaveEntitlements.employeeId, employeeIds),
        inArray(leaveEntitlements.leaveTypeId, leaveTypeIds),
        inArray(leaveEntitlements.periodStart, storedStarts),
      ),
    )
    .groupBy(leaveEntitlements.id);
  const [days, rows] = storedStarts.length > 0 ? await db.batch([daysQuery, rowsQuery]) : [await daysQuery, []];

  for (const request of active) {
    const usage = { approved: 0, pending: 0 };
    for (const day of days) {
      if (
        day.employeeId === request.employee.id &&
        day.leaveTypeId === request.policy.leaveTypeId &&
        day.applicationId !== request.excludeApplicationId &&
        day.date >= request.period.start &&
        day.date <= request.period.end
      ) {
        usage[day.status === "approved" ? "approved" : "pending"] += Number(day.portion);
      }
    }
    if (request.relation === "next") {
      result.set(request.key, toPeriodBalance({ ...request, usage, row: null }));
      continue;
    }
    const row = rows.find(
      (r) =>
        r.employeeId === request.employee.id &&
        r.leaveTypeId === request.policy.leaveTypeId &&
        r.periodStart === request.period.start,
    );
    result.set(
      request.key,
      row
        ? toPeriodBalance({
            ...request,
            usage,
            row: { ...row, entitledDays: Number(row.entitledDays), carriedForwardDays: Number(row.carriedForwardDays) },
          })
        : null,
    );
  }
  return result;
}

// The employee's own pending and approved dates among `dates` (any leave
// type), with the portion booked on each, excluding one request.
export async function bookedOn(
  reader: Reader,
  employeeId: string,
  dates: readonly IsoDate[],
  excludeApplicationId?: string,
): Promise<{ date: IsoDate; portion: number }[]> {
  if (dates.length === 0) return [];
  const conditions: SQL[] = [
    eq(leaveApplications.employeeId, employeeId),
    inArray(leaveApplications.status, ["pending", "approved"]),
    inArray(leaveApplicationDays.date, [...dates]),
  ];
  if (excludeApplicationId) conditions.push(ne(leaveApplications.id, excludeApplicationId));
  const rows = await reader
    .select({ date: leaveApplicationDays.date, portion: dayTotal(leaveApplicationDays.portion) })
    .from(leaveApplicationDays)
    .innerJoin(leaveApplications, eq(leaveApplications.id, leaveApplicationDays.applicationId))
    .where(and(...conditions))
    .groupBy(leaveApplicationDays.date);
  return rows;
}

// ---------------------------------------------------------------------------
// Carry-forward correction (inside the locked transaction)
// ---------------------------------------------------------------------------

// After a late final approval, cancellation or revocation of ANNUAL leave
// (including an admin's "Approve anyway"): when the
// request's leave year already has a next-year row (its carry-forward was
// fixed when that row was created), add a carry_forward_recalculation
// adjustment to the next-year row for the difference. System adjustments
// may take the balance below 0 (it is shown, never hidden). Call AFTER the
// status change, so the previous year's usage includes it.
export async function applyCarryForwardCorrection(
  tx: Tx,
  {
    employee,
    policy,
    dates,
    event,
    actorId,
  }: {
    employee: { id: string; joinDate: IsoDate };
    policy: LeavePolicy;
    // The request's dates (all in one leave year).
    dates: readonly IsoDate[];
    event: CarryForwardEvent;
    actorId: string;
  },
): Promise<number> {
  if (policy.code !== "annual" || dates.length === 0) return 0;
  const sorted = [...dates].sort();
  const period = periodOf("annual", employee.joinDate, sorted[0]);
  if (!period) return 0;

  const nextRow = await findPeriodRow(tx, employee.id, policy.leaveTypeId, nextPeriodStart(period));
  if (!nextRow) return 0;
  const previousRow = await findPeriodRow(tx, employee.id, policy.leaveTypeId, period.start);
  if (!previousRow) return 0;

  const [previousAdjustments, usage, nextAdjustments] = [
    await rowAdjustments(tx, previousRow.id),
    await periodUsage(tx, employee.id, policy.leaveTypeId, period),
    await rowAdjustments(tx, nextRow.id),
  ];
  const correction = carryForwardCorrection({
    previous: {
      entitled: previousRow.entitledDays,
      carriedForward: previousRow.carriedForwardDays,
      adjustments: previousAdjustments.total,
      used: usage.approved,
    },
    policy: {
      carryForwardEnabled: policy.carryForwardEnabled,
      carryForwardCap: policy.carryForwardCap,
      carryForwardExpiryMonths: policy.carryForwardExpiryMonths,
    },
    newPeriodStart: nextRow.periodStart,
    storedCarried: nextRow.carriedForwardDays,
    earlierCorrections: nextAdjustments.recalculations,
  });
  if (correction === 0) return 0;

  await tx.insert(leaveAdjustments).values({
    employeeId: employee.id,
    leaveTypeId: policy.leaveTypeId,
    entitlementId: nextRow.id,
    days: String(correction),
    reason: "carry_forward_recalculation",
    note: carryForwardCorrectionNote(event, formatDateRange(sorted[0], sorted[sorted.length - 1])),
    createdBy: actorId,
  });
  return correction;
}

// Forfeited days of an annual row for display. forfeited_days is fixed when
// the row is created; after a carry-forward correction it is recomputed from
// the previous year's current usage (the stored value is never changed).
export async function displayedForfeited(
  reader: Reader,
  employee: { id: string; joinDate: IsoDate },
  policy: LeavePolicy,
  row: { id: string; periodStart: IsoDate; forfeitedDays: number },
): Promise<number> {
  if (policy.code !== "annual") return row.forfeitedDays;
  const { recalculations } = await rowAdjustments(reader, row.id);
  if (recalculations === 0) return row.forfeitedDays;
  const previous = previousPeriodFor("annual", employee.joinDate, row.periodStart);
  const previousRow = previous ? await findPeriodRow(reader, employee.id, policy.leaveTypeId, previous.start) : null;
  if (!previous || !previousRow) return row.forfeitedDays;
  const [adjustments, usage] = [
    await rowAdjustments(reader, previousRow.id),
    await periodUsage(reader, employee.id, policy.leaveTypeId, previous),
  ];
  return computeCarryForward({
    previous: {
      entitled: previousRow.entitledDays,
      carriedForward: previousRow.carriedForwardDays,
      adjustments: adjustments.total,
      used: usage.approved,
    },
    policy: {
      carryForwardEnabled: policy.carryForwardEnabled,
      carryForwardCap: policy.carryForwardCap,
      carryForwardExpiryMonths: policy.carryForwardExpiryMonths,
    },
    newPeriodStart: row.periodStart,
  }).forfeited;
}

// Which leave period a request falls in, and the balance it is checked
// against. Pure: no database.
//
// A date's period depends on the leave type: annual leave uses the service
// year that contains the date (join-date anniversaries), MC and unpaid the
// calendar year. A request is always checked against the period its
// selected dates fall in, never today's period, and all its dates must be in
// ONE period.
//
// Relative to today's period, the request's period is:
//   current  checked against the stored entitlement row
//   next     the period right after today's: checked against its BASE
//            entitlement only (no row exists yet; carry-forward and
//            adjustments are added when it starts), minus days already
//            requested in it
//   past     only reachable by backdating (MC, or an admin); needs its row
//   beyond   two or more periods ahead: refused

import type { Balance } from "./balance";
import { currentPeriodFor, planEntitlement, type PlanPolicy } from "./entitlement-plan";
import type { IsoDate } from "./iso-date";
import { nextPeriodStart, type LeavePeriod } from "./leave-year";
import type { LeaveTypeCode } from "./constants";

export type PeriodRelation = "past" | "current" | "next" | "beyond";

// The period containing a date, or null before the join date.
export function periodOf(code: LeaveTypeCode, joinDate: IsoDate, date: IsoDate): LeavePeriod | null {
  return currentPeriodFor(code, joinDate, date);
}

// The distinct periods the dates fall in, in date order. Dates before the
// join date are skipped (the eligibility rule reports them).
export function periodsOf(code: LeaveTypeCode, joinDate: IsoDate, dates: readonly IsoDate[]): LeavePeriod[] {
  const byStart = new Map<IsoDate, LeavePeriod>();
  for (const date of [...dates].sort()) {
    const period = periodOf(code, joinDate, date);
    if (period && !byStart.has(period.start)) byStart.set(period.start, period);
  }
  return [...byStart.values()];
}

// Null before the join date (no period exists today yet).
export function periodRelation(
  code: LeaveTypeCode,
  joinDate: IsoDate,
  today: IsoDate,
  period: LeavePeriod,
): PeriodRelation | null {
  const current = periodOf(code, joinDate, today);
  if (!current) return null;
  if (period.start === current.start) return "current";
  if (period.start < current.start) return "past";
  return period.start === nextPeriodStart(current) ? "next" : "beyond";
}

// The next period after today's (for showing next-year balances), or null
// before the join date.
export function nextPeriodFor(code: LeaveTypeCode, joinDate: IsoDate, today: IsoDate): LeavePeriod | null {
  const current = periodOf(code, joinDate, today);
  return current ? periodOf(code, joinDate, nextPeriodStart(current)) : null;
}

// The next period's base entitlement, computed from the policy without any
// entitlement row: annual = that service year's days; MC = the yearly
// amount, prorated only if the employee joins in that year; unpaid = the
// yearly allowance. Carry-forward is deliberately left out.
export function baseEntitlement(policy: PlanPolicy, joinDate: IsoDate, period: LeavePeriod): number {
  return planEntitlement({ policy, joinDate, onDate: period.start, previous: null })?.entitledDays ?? 0;
}

// The balance a request is checked against.
export type PeriodBalance = {
  periodStart: IsoDate;
  periodEnd: IsoDate;
  // "stored": the period's entitlement row. "projected": the next period,
  // base entitlement only.
  source: "stored" | "projected";
  available: number;
  pending: number;
  availableAfterPending: number;
};

export function storedPeriodBalance(period: LeavePeriod, balance: Balance): PeriodBalance {
  return {
    periodStart: period.start,
    periodEnd: period.end,
    source: "stored",
    available: balance.available,
    pending: balance.pending,
    availableAfterPending: balance.availableAfterPending,
  };
}

// base − approved − pending days already requested in that period.
export function projectedPeriodBalance(
  period: LeavePeriod,
  base: number,
  usage: { approved: number; pending: number },
): PeriodBalance {
  const available = base - usage.approved;
  return {
    periodStart: period.start,
    periodEnd: period.end,
    source: "projected",
    available,
    pending: usage.pending,
    availableAfterPending: available - usage.pending,
  };
}

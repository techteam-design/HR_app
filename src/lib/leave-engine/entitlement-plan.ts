// Decides the entitlement row an employee should have for a leave type on a
// given date. Pure: the service loads the inputs and inserts the result.

import { computeCarryForward } from "./carry-forward";
import type { LeaveTypeCode, ProrateRounding } from "./constants";
import { annualEntitlement, type EntitlementTable } from "./entitlement";
import type { IsoDate } from "./iso-date";
import { calendarPeriod, currentAnnualPeriod, previousAnnualPeriod, type LeavePeriod } from "./leave-year";
import { mcEntitlement } from "./mc-prorate";

export type PlanPolicy = {
  code: LeaveTypeCode;
  entitlementTable: EntitlementTable | null;
  fixedDays: number | null;
  carryForwardEnabled: boolean;
  carryForwardCap: number | null;
  carryForwardExpiryMonths: number | null;
  prorateOnJoin: boolean;
  prorateRounding: ProrateRounding | null;
};

// Totals of the previous annual period's row, if one exists.
export type PreviousPeriodUsage = {
  entitled: number;
  carriedForward: number;
  adjustments: number;
  used: number;
};

export type PlannedEntitlement = {
  code: LeaveTypeCode;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  entitledDays: number;
  carriedForwardDays: number;
  forfeitedDays: number;
  carryForwardExpiresOn: IsoDate | null;
};

// The period containing onDate, or null before the join date.
export function currentPeriodFor(code: LeaveTypeCode, joinDate: IsoDate, onDate: IsoDate): LeavePeriod | null {
  if (onDate < joinDate) return null;
  return code === "annual" ? currentAnnualPeriod(joinDate, onDate) : calendarPeriod(onDate);
}

// The previous annual period (the source of carry-forward), or null in
// service year 1 and for calendar-year leave types.
export function previousPeriodFor(code: LeaveTypeCode, joinDate: IsoDate, onDate: IsoDate): LeavePeriod | null {
  if (code !== "annual") return null;
  const current = currentAnnualPeriod(joinDate, onDate);
  return current ? previousAnnualPeriod(joinDate, current) : null;
}

export function planEntitlement({
  policy,
  joinDate,
  onDate,
  previous,
}: {
  policy: PlanPolicy;
  joinDate: IsoDate;
  onDate: IsoDate;
  // No historical backfill: with no previous-period row, nothing carries forward.
  previous: PreviousPeriodUsage | null;
}): PlannedEntitlement | null {
  if (policy.code === "annual") {
    const period = currentAnnualPeriod(joinDate, onDate);
    if (!period) return null;
    if (!policy.entitlementTable) throw new Error("The annual leave policy has no entitlement table");

    const carry = previous
      ? computeCarryForward({
          previous,
          policy: {
            carryForwardEnabled: policy.carryForwardEnabled,
            carryForwardCap: policy.carryForwardCap,
            carryForwardExpiryMonths: policy.carryForwardExpiryMonths,
          },
          newPeriodStart: period.start,
        })
      : { carried: 0, forfeited: 0, expiresOn: null };

    return {
      code: "annual",
      periodStart: period.start,
      periodEnd: period.end,
      entitledDays: annualEntitlement(period.serviceYear, policy.entitlementTable),
      carriedForwardDays: carry.carried,
      forfeitedDays: carry.forfeited,
      carryForwardExpiresOn: carry.expiresOn,
    };
  }

  if (onDate < joinDate) return null;
  if (policy.fixedDays === null) throw new Error(`The ${policy.code} policy has no fixed days`);
  const period = calendarPeriod(onDate);
  const entitledDays =
    policy.code === "mc"
      ? mcEntitlement({
          fullDays: policy.fixedDays,
          joinDate,
          periodStart: period.start,
          prorateOnJoin: policy.prorateOnJoin,
          rounding: policy.prorateRounding,
        }).days
      : // Unpaid leave is never prorated.
        policy.fixedDays;

  return {
    code: policy.code,
    periodStart: period.start,
    periodEnd: period.end,
    entitledDays,
    carriedForwardDays: 0,
    forfeitedDays: 0,
    carryForwardExpiresOn: null,
  };
}

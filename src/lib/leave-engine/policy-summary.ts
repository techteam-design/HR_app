// Plain-English description of a leave policy, for the Leave policies page.
// Pure: no database.

import { formatDays } from "./balance";
import { PROVISIONAL_MC_ROUNDING, type LeaveTypeCode, type ProrateRounding } from "./constants";
import type { EntitlementTable } from "./entitlement";

export type PolicySummaryInput = {
  code: LeaveTypeCode;
  entitlementTable: EntitlementTable | null;
  fixedDays: number | null;
  eligibilityMonthsLocal: number;
  eligibilityMonthsForeign: number;
  advanceNoticeDaysForeign: number;
  carryForwardEnabled: boolean;
  carryForwardCap: number | null;
  carryForwardExpiryMonths: number | null;
  prorateOnJoin: boolean;
  prorateRounding: ProrateRounding | null;
};

const days = (value: number) => `${formatDays(value)} ${value === 1 ? "day" : "days"}`;
const months = (value: number) => `${value} ${value === 1 ? "month" : "months"}`;

const ROUNDING_TEXT: Record<ProrateRounding, string> = {
  up: "rounded up to the next half day",
  down: "rounded down to the half day below",
  nearest: "rounded to the nearest half day",
};

function eligibilityLine(local: number, foreign: number): string {
  const when = (value: number) => (value === 0 ? "from their join date" : `after ${months(value)} of service`);
  if (local === foreign) return `All staff can apply ${when(local)}.`;
  return `Local staff can apply ${when(local)}; foreign staff ${when(foreign)}.`;
}

function tableLine(table: EntitlementTable): string {
  const sorted = [...table].sort((a, b) => a.serviceYear - b.serviceYear);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return "No entitlement table set.";
  if (first.days === last.days) return `${days(first.days)} every leave year.`;
  return `Year ${first.serviceYear}: ${days(first.days)}, rising to ${days(last.days)} from year ${last.serviceYear} onward.`;
}

export function describePolicy(policy: PolicySummaryInput): string[] {
  const lines: string[] = [];

  if (policy.code === "annual") {
    lines.push(policy.entitlementTable ? tableLine(policy.entitlementTable) : "No entitlement table set.");
    lines.push("The leave year runs from each join-date anniversary, for local and foreign staff.");
    lines.push(eligibilityLine(policy.eligibilityMonthsLocal, policy.eligibilityMonthsForeign));
    lines.push(
      policy.advanceNoticeDaysForeign > 0
        ? `Foreign staff must apply at least ${days(policy.advanceNoticeDaysForeign)} in advance (an admin can override this per application).`
        : "No advance notice is required.",
    );
    if (!policy.carryForwardEnabled) {
      lines.push("Unused days do not carry forward.");
    } else {
      lines.push(
        policy.carryForwardCap === null
          ? "All unused days carry forward to the next leave year."
          : `Up to ${days(policy.carryForwardCap)} unused carry forward to the next leave year; any more are forfeited.`,
      );
      lines.push(
        policy.carryForwardExpiryMonths === null
          ? "Carried-forward days do not expire."
          : `Carried-forward days expire ${months(policy.carryForwardExpiryMonths)} into the new leave year.`,
      );
    }
    return lines;
  }

  const fixed = policy.fixedDays ?? 0;
  if (policy.code === "mc") {
    lines.push(`${days(fixed)} per calendar year (1 January to 31 December), resetting on 1 January.`);
    lines.push(eligibilityLine(policy.eligibilityMonthsLocal, policy.eligibilityMonthsForeign));
    if (policy.prorateOnJoin) {
      lines.push(
        `Staff who join during the year get ${formatDays(fixed)} × the months left in the year (counting the join month) ÷ 12, ` +
          (policy.prorateRounding
            ? `${ROUNDING_TEXT[policy.prorateRounding]}.`
            : `${ROUNDING_TEXT[PROVISIONAL_MC_ROUNDING]} for now (provisional: rounding not decided yet).`),
      );
    }
    lines.push("No carry-forward.");
    return lines;
  }

  lines.push(`Up to ${days(fixed)} per calendar year, resetting on 1 January.`);
  lines.push("Tracked separately: never reduces annual or MC balances. Always labelled \"Unpaid\".");
  return lines;
}

// Carry-forward correction after a late change to the previous annual
// period. Pure: no database.
//
// Carry-forward is fixed when the new annual row is created (from the
// previous period's approved days at that moment). When annual leave in the
// previous period is approved, cancelled or revoked AFTER that, the stored figure is
// out of date. Rather than editing the row, a system adjustment
// (carry_forward_recalculation) is added to the new period:
//   correction = carried now − (stored carried + earlier corrections)
// where "carried now" is computeCarryForward() on the previous period's
// current usage. 0 means nothing to add (e.g. unused days stay above the cap).
// Only the next period is corrected (a request is never more than one
// period old by the time it is decided).

import { computeCarryForward, type CarryForwardInput } from "./carry-forward";

export function carryForwardCorrection({
  previous,
  policy,
  newPeriodStart,
  storedCarried,
  earlierCorrections,
}: CarryForwardInput & {
  // carried_forward_days on the new period's row.
  storedCarried: number;
  // Sum of carry_forward_recalculation adjustments already on that row.
  earlierCorrections: number;
}): number {
  const { carried } = computeCarryForward({ previous, policy, newPeriodStart });
  return carried - (storedCarried + earlierCorrections);
}

// "revocation": an admin revoked the approval (approval_overrides).
export type CarryForwardEvent = "approval" | "cancellation" | "revocation";

export function carryForwardCorrectionNote(event: CarryForwardEvent, range: string): string {
  return `Carry-forward recalculated after ${event} of annual leave ${range} in the previous leave year.`;
}

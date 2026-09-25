// Annual leave carry-forward into the next leave year. Pure: no database.
//
// unused    = entitled + carried forward + adjustments − approved days used
//             in the previous period, never below 0
// carried   = min(unused, cap)   (no cap when the policy cap is null)
// forfeited = unused − carried
// With carry-forward disabled, every unused day is forfeited.
//
// Expiry: when the policy sets carry_forward_expiry_months, carried days can
// be used up to and including (new period start + N months − 1 day). The
// seed policy has no expiry (null), so this is normally null.

import { addDays, addMonths, type IsoDate } from "./iso-date";

export type CarryForwardInput = {
  previous: {
    entitled: number;
    carriedForward: number;
    adjustments: number;
    used: number;
  };
  policy: {
    carryForwardEnabled: boolean;
    carryForwardCap: number | null;
    carryForwardExpiryMonths: number | null;
  };
  newPeriodStart: IsoDate;
};

export type CarryForwardResult = {
  unused: number;
  carried: number;
  forfeited: number;
  expiresOn: IsoDate | null;
};

export function computeCarryForward({ previous, policy, newPeriodStart }: CarryForwardInput): CarryForwardResult {
  const unused = Math.max(
    0,
    previous.entitled + previous.carriedForward + previous.adjustments - previous.used,
  );
  const carried = !policy.carryForwardEnabled
    ? 0
    : policy.carryForwardCap === null
      ? unused
      : Math.min(unused, Math.max(0, policy.carryForwardCap));
  const expiresOn =
    carried > 0 && policy.carryForwardExpiryMonths !== null
      ? addDays(addMonths(newPeriodStart, policy.carryForwardExpiryMonths), -1)
      : null;

  return { unused, carried, forfeited: unused - carried, expiresOn };
}

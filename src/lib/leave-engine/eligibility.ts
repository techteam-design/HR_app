// When an employee may start applying for a leave type. Pure: no database.
//
// eligible from = join date + the policy's eligibility months for the
// employee's classification (seed: annual 3 months local / 0 foreign, MC 1
// month, unpaid 0). A missing day of month becomes the month's last day
// (joined 31 Oct + 1 month = 30 Nov).
//
// Eligibility never reduces the entitlement: a local employee in their first
// 3 months still has 7 annual days, they just cannot apply until this date.

import type { Classification } from "./constants";
import { addMonths, type IsoDate } from "./iso-date";

export type EligibilityPolicy = {
  eligibilityMonthsLocal: number;
  eligibilityMonthsForeign: number;
};

export function eligibleFrom(
  joinDate: IsoDate,
  classification: Classification,
  policy: EligibilityPolicy,
): IsoDate {
  const months =
    classification === "foreign" ? policy.eligibilityMonthsForeign : policy.eligibilityMonthsLocal;
  return addMonths(joinDate, months);
}

export function isEligible(eligibleFromDate: IsoDate, onDate: IsoDate): boolean {
  return onDate >= eligibleFromDate;
}

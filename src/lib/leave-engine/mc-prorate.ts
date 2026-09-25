// MC (and other calendar-year) entitlements. Pure: no database.
//
// Joined during this calendar year:
//   prorated = full days × (months from the join month through December,
//              counting the join month in full) ÷ 12
//   rounded to a half day using the policy's prorate_rounding (up / down /
//   nearest). When prorate_rounding is null (client not decided), the
//   PROVISIONAL default "nearest" is used.
// Joined before this calendar year: the full days.
// Unpaid leave is never prorated.

import { PROVISIONAL_MC_ROUNDING, type ProrateRounding } from "./constants";
import { parseIsoDate, type IsoDate } from "./iso-date";

export function roundToHalfDay(days: number, rounding: ProrateRounding): number {
  // Round the half-day count; the small epsilon absorbs floating-point noise
  // such as 7.000000000000001 so exact values never round up.
  const halves = days * 2;
  const epsilon = 1e-9;
  switch (rounding) {
    case "up":
      return Math.ceil(halves - epsilon) / 2;
    case "down":
      return Math.floor(halves + epsilon) / 2;
    case "nearest":
      return Math.round(halves) / 2;
  }
}

export type McProrateResult = {
  days: number;
  prorated: boolean;
  // True when the provisional rounding default was used.
  provisionalRounding: boolean;
};

export function mcEntitlement({
  fullDays,
  joinDate,
  periodStart,
  prorateOnJoin,
  rounding,
}: {
  fullDays: number;
  joinDate: IsoDate;
  // 1 January of the calendar year being calculated.
  periodStart: IsoDate;
  prorateOnJoin: boolean;
  rounding: ProrateRounding | null;
}): McProrateResult {
  const [joinYear, joinMonth] = parseIsoDate(joinDate);
  const [periodYear] = parseIsoDate(periodStart);

  if (!prorateOnJoin || joinYear !== periodYear) {
    return { days: fullDays, prorated: false, provisionalRounding: false };
  }

  const months = 12 - joinMonth + 1;
  const mode = rounding ?? PROVISIONAL_MC_ROUNDING;
  return {
    days: roundToHalfDay((fullDays * months) / 12, mode),
    prorated: months < 12,
    provisionalRounding: rounding === null,
  };
}

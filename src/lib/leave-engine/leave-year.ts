// Leave periods. Pure: no database.
//
// Annual leave is anniversary-based for ALL staff (local and foreign):
// service year N runs from the (N-1)th anniversary of the join date to the day
// before the next anniversary. A 29 February join date has its anniversary on
// 28 February in non-leap years.
// MC and unpaid leave use the calendar year (1 January to 31 December).

import { addDays, addYears, parseIsoDate, type IsoDate } from "./iso-date";

export type LeavePeriod = { start: IsoDate; end: IsoDate };
export type AnnualPeriod = LeavePeriod & { serviceYear: number };

// The nth anniversary of the join date (0 = the join date itself).
export function anniversary(joinDate: IsoDate, n: number): IsoDate {
  return addYears(joinDate, n);
}

// The annual leave period that contains onDate. Returns null before the
// join date (the employee has not started yet).
export function currentAnnualPeriod(joinDate: IsoDate, onDate: IsoDate): AnnualPeriod | null {
  if (onDate < joinDate) return null;
  const [joinYear] = parseIsoDate(joinDate);
  const [year] = parseIsoDate(onDate);

  let completed = year - joinYear;
  if (anniversary(joinDate, completed) > onDate) completed -= 1;

  return annualPeriodForServiceYear(joinDate, completed + 1);
}

// Service year 1 starts on the join date.
export function annualPeriodForServiceYear(joinDate: IsoDate, serviceYear: number): AnnualPeriod {
  return {
    start: anniversary(joinDate, serviceYear - 1),
    end: addDays(anniversary(joinDate, serviceYear), -1),
    serviceYear,
  };
}

// The period before this one, or null in service year 1.
export function previousAnnualPeriod(joinDate: IsoDate, current: AnnualPeriod): AnnualPeriod | null {
  if (current.serviceYear <= 1) return null;
  return annualPeriodForServiceYear(joinDate, current.serviceYear - 1);
}

export function calendarPeriod(onDate: IsoDate): LeavePeriod {
  const [year] = parseIsoDate(onDate);
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

// The day the next period starts (the leave year "renews").
export function nextPeriodStart(period: LeavePeriod): IsoDate {
  return addDays(period.end, 1);
}

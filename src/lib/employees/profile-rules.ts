import { addDays, addYears, format, isValid, parseISO } from "date-fns";

// Pure profile date rules. All dates are DATE column values ("YYYY-MM-DD");
// `today` is today's date in Asia/Singapore.

export const MIN_EMPLOYEE_AGE = 16;
export const MAX_JOIN_DAYS_AHEAD = 90;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = parseISO(value);
  // Rejects impossible dates such as 2026-02-30.
  return isValid(date) && format(date, "yyyy-MM-dd") === value;
}

// True if someone born on `dateOfBirth` is at least `minAge` on `today`.
// A 29 February birthday counts from 28 February in non-leap years.
export function isAtLeastAge(dateOfBirth: string, today: string, minAge = MIN_EMPLOYEE_AGE): boolean {
  const birthdayAtMinAge = format(addYears(parseISO(dateOfBirth), minAge), "yyyy-MM-dd");
  return birthdayAtMinAge <= today;
}

// True if the join date is no more than `maxDaysAhead` days after today.
export function isJoinDateAllowed(
  joinDate: string,
  today: string,
  maxDaysAhead = MAX_JOIN_DAYS_AHEAD,
): boolean {
  const latest = format(addDays(parseISO(today), maxDaysAhead), "yyyy-MM-dd");
  return joinDate <= latest;
}

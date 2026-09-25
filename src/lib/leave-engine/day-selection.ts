// Per-date leave selection. Pure: no database.
//
// Phase 1 day counting (client-approved "option A"): the system has no
// working week and no public holiday list. Staff have rostered off days, so
// the employee sees every date in the chosen range, all ticked by default,
// and unticks their off days (including public holidays they don't work).
// Only ticked dates count: a full day is 1, a half day 0.5.

import { addDays, parseIsoDate, type IsoDate } from "./iso-date";

// The longest date range one request may cover, so the date list stays
// manageable (inclusive of both ends).
export const MAX_REQUEST_RANGE_DAYS = 60;

export type DayPortion = 1 | 0.5;
export type SelectedDay = { date: IsoDate; portion: DayPortion };

export type DayOption = {
  date: IsoDate;
  // "Mon".."Sun", for display ("Mon 14 Oct").
  weekday: string;
  selected: boolean;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function weekdayOf(date: IsoDate): string {
  const [year, month, day] = parseIsoDate(date);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

// Number of dates from start to end, both included (0 when end < start).
export function rangeLength(start: IsoDate, end: IsoDate): number {
  if (end < start) return 0;
  const [sy, sm, sd] = parseIsoDate(start);
  const [ey, em, ed] = parseIsoDate(end);
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000) + 1;
}

// One entry per date in the range, all selected by default. Returns an empty
// list for a reversed range or one longer than MAX_REQUEST_RANGE_DAYS (the
// validation reports why).
export function buildDayOptions({ start, end }: { start: IsoDate; end: IsoDate }): DayOption[] {
  const length = rangeLength(start, end);
  if (length === 0 || length > MAX_REQUEST_RANGE_DAYS) return [];
  return Array.from({ length }, (_, index) => {
    const date = addDays(start, index);
    return { date, weekday: weekdayOf(date), selected: true };
  });
}

// Full day = 1, half day = 0.5.
export function totalDays(days: readonly SelectedDay[]): number {
  return days.reduce((sum, day) => sum + day.portion, 0);
}

// Sums portions per status for the dates inside a period (inclusive). Used
// for "used" (approved) and "pending" from per-date rows.
export function sumDaysInPeriod(
  days: readonly { date: IsoDate; portion: number; status: string }[],
  period: { start: IsoDate; end: IsoDate },
): { approved: number; pending: number } {
  let approved = 0;
  let pending = 0;
  for (const day of days) {
    if (day.date < period.start || day.date > period.end) continue;
    if (day.status === "approved") approved += day.portion;
    else if (day.status === "pending") pending += day.portion;
  }
  return { approved, pending };
}

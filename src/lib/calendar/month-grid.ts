// Month calendar maths for the team calendar. Pure: no database.
// Months are "YYYY-MM"; dates are DATE column values ("YYYY-MM-DD").
// Weeks start on Monday.

import { addDays, daysInMonth, parseIsoDate, toIsoDate, type IsoDate } from "@/lib/leave-engine/iso-date";

export type YearMonth = string;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

// A valid "YYYY-MM", or the month containing `today`.
export function parseMonth(value: string | undefined, today: IsoDate): YearMonth {
  return value && MONTH.test(value) ? value : today.slice(0, 7);
}

export function monthRange(month: YearMonth): { start: IsoDate; end: IsoDate } {
  const [year, m] = month.split("-").map(Number);
  return { start: toIsoDate(year, m, 1), end: toIsoDate(year, m, daysInMonth(year, m)) };
}

export function shiftMonth(month: YearMonth, delta: number): YearMonth {
  const [year, m] = month.split("-").map(Number);
  const index = year * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

// "October 2026"
export function monthLabel(month: YearMonth): string {
  const [year, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${year}`;
}

export type MonthCell = { date: IsoDate; inMonth: boolean };

// Whole weeks (Monday to Sunday) covering the month; days of the previous
// and next month fill the first and last week.
export function monthWeeks(month: YearMonth): MonthCell[][] {
  const { start, end } = monthRange(month);
  const [y, m, d] = parseIsoDate(start);
  // getUTCDay: 0 = Sunday. Days back to Monday.
  const offset = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  let cursor = addDays(start, -offset);
  const weeks: MonthCell[][] = [];
  while (cursor <= end) {
    const week: MonthCell[] = [];
    for (let i = 0; i < 7; i += 1) {
      week.push({ date: cursor, inMonth: cursor >= start && cursor <= end });
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

// Entries grouped by date, in the order given.
export function groupByDate<T extends { date: IsoDate }>(entries: readonly T[]): Map<IsoDate, T[]> {
  const byDate = new Map<IsoDate, T[]>();
  for (const entry of entries) {
    const list = byDate.get(entry.date);
    if (list) list.push(entry);
    else byDate.set(entry.date, [entry]);
  }
  return byDate;
}

// People on leave on each date (each person counted once per date).
export function peopleCountByDate(entries: readonly { date: IsoDate; employeeId: string }[]): Map<IsoDate, number> {
  const people = new Map<IsoDate, Set<string>>();
  for (const entry of entries) {
    const set = people.get(entry.date) ?? new Set<string>();
    set.add(entry.employeeId);
    people.set(entry.date, set);
  }
  return new Map([...people].map(([date, set]) => [date, set.size]));
}

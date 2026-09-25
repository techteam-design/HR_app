// Calendar arithmetic on DATE column values ("YYYY-MM-DD"). Pure: the values
// have no time part or time zone, so all maths is done in UTC and printed back
// as a date string. Callers pass "today" from todayIsoInBrunei().

export type IsoDate = string;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value: IsoDate): [number, number, number] {
  const match = ISO.exec(value);
  if (!match) throw new Error(`Invalid date "${value}", expected YYYY-MM-DD`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function toIsoDate(year: number, month: number, day: number): IsoDate {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(value: IsoDate, days: number): IsoDate {
  const [year, month, day] = parseIsoDate(value);
  return toIsoDate(year, month, day + days);
}

// Adds whole months. A day that does not exist in the target month becomes
// that month's last day (31 Jan + 1 month = 28/29 Feb).
export function addMonths(value: IsoDate, months: number): IsoDate {
  const [year, month, day] = parseIsoDate(value);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  return toIsoDate(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
}

// Adds whole years. 29 February becomes 28 February in a non-leap year.
export function addYears(value: IsoDate, years: number): IsoDate {
  return addMonths(value, years * 12);
}

// Pure length-of-service rule. Dates are DATE column values ("YYYY-MM-DD");
// `today` is today's date in Asia/Singapore (todayIsoInSingapore()).

export type ServiceLength = { years: number; months: number };

function parts(isoDate: string): [number, number, number] {
  const [year, month, day] = isoDate.split("-").map(Number);
  return [year, month, day];
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Completed years and months since the join date. A month is complete on the
// same day of the month, or on the last day of a shorter month (joined
// 31 January → one month on 28/29 February; joined 29 February → one year on
// 28 February in a non-leap year). Returns null if the join date is after today.
export function lengthOfService(joinDate: string, today: string): ServiceLength | null {
  if (joinDate > today) return null;
  const [joinYear, joinMonth, joinDay] = parts(joinDate);
  const [year, month, day] = parts(today);

  let totalMonths = (year - joinYear) * 12 + (month - joinMonth);
  const isLastDayOfMonth = day === daysInMonth(year, month);
  if (day < joinDay && !isLastDayOfMonth) totalMonths -= 1;

  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12 };
}

const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`;

// e.g. "3 years 0 months", "1 year 1 month".
export function formatServiceLength(length: ServiceLength): string {
  return `${plural(length.years, "year")} ${plural(length.months, "month")}`;
}

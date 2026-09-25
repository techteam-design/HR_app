// Pure date helpers. Business dates and greetings always use the business
// time zone below. The client is in Brunei (UTC+8, no daylight saving, the
// same offset as Singapore); change the zone here only.

export const BUSINESS_TIME_ZONE = "Asia/Brunei";

export function bruneiHour(date: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(date);
  return Number(hour);
}

// 05:00–11:59 morning, 12:00–17:59 afternoon, otherwise evening.
export function greetingFor(date: Date = new Date()): string {
  const hour = bruneiHour(date);
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

// Today's calendar date in the business time zone (Brunei) as a DATE column value, e.g. "2026-09-23".
export function todayIsoInBrunei(date: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(date);
}

// Short month and weekday names are spelled out here rather than taken from
// Intl: en-GB shortens September to "Sept", and every month should be three
// letters.
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// A DATE column value as a UTC date (it has no time part, so reading and
// printing in UTC avoids any day shift), or null when invalid.
function parseDateColumn(isoDate: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const date = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Formats a DATE column value ("2026-09-23") as "23 Sep 2026".
export function formatDisplayDate(isoDate: string): string {
  const date = parseDateColumn(isoDate);
  if (!date) return isoDate;
  return `${date.getUTCDate()} ${SHORT_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

// e.g. "Wednesday, 23 September 2026"
export function formatLongDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(date);
}

// Formats a DATE column value as "Mon 14 Oct" (for per-date lists).
export function formatWeekdayDate(isoDate: string): string {
  const date = parseDateColumn(isoDate);
  if (!date) return isoDate;
  return `${SHORT_WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${SHORT_MONTHS[date.getUTCMonth()]}`;
}

// "14 Oct 2026" for one date, "14 – 18 Oct 2026" / "30 Sep – 2 Oct 2026" /
// "30 Dec 2026 – 2 Jan 2027" for a range.
export function formatDateRange(start: string, end: string): string {
  if (start === end) return formatDisplayDate(start);
  const [sy, sm] = start.split("-");
  const [ey, em] = end.split("-");
  const full = formatDisplayDate(start);
  const startPart =
    sy !== ey ? full : sm !== em ? full.replace(/ \d{4}$/, "") : full.replace(/ \S+ \d{4}$/, "");
  return `${startPart} – ${formatDisplayDate(end)}`;
}

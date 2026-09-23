// Pure date helpers. Business dates and greetings always use Asia/Singapore.

export const BUSINESS_TIME_ZONE = "Asia/Singapore";

export function singaporeHour(date: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(date);
  return Number(hour);
}

// 05:00–11:59 morning, 12:00–17:59 afternoon, otherwise evening.
export function greetingFor(date: Date = new Date()): string {
  const hour = singaporeHour(date);
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

// Today's calendar date in Singapore as a DATE column value, e.g. "2026-09-23".
export function todayIsoInSingapore(date: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(date);
}

// Formats a DATE column value ("2026-09-23") as "23 Sep 2026". The value has
// no time part, so it is read and printed in UTC to avoid any day shift.
export function formatDisplayDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
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

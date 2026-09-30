// What each viewer may see on the team calendar, and how entries are shown.
// Pure: no database.
//
// Employees see the whole company's APPROVED leave, but never what kind of
// leave it is: every entry is just "On leave" (no type, status, reason,
// remarks, cancellation note or balance). publicEntries() is the one place
// that strips those fields; the service passes every employee view through it.

import type { LeaveTypeCode } from "@/lib/leave-engine/constants";
import type { HalfDaySlot } from "@/lib/leave-engine/half-day";
import type { IsoDate } from "@/lib/leave-engine/iso-date";

// Who is looking:
//   everyone: admin and HR viewer (everyone, approved + pending, with types)
//   team:     managers (their team, approved + pending, with types)
//   company:  employees (everyone, approved only, no types)
export type CalendarScope = "everyone" | "team" | "company";

// One date of one request, as read from the database (server side only).
export type CalendarRow = {
  date: IsoDate;
  portion: number;
  halfDaySlot: HalfDaySlot | null;
  applicationId: string;
  startDate: IsoDate;
  endDate: IsoDate;
  employeeId: string;
  fullName: string;
  photoUrl: string | null;
  departmentName: string;
  branchName: string;
  code: LeaveTypeCode;
  status: "pending" | "approved";
};

// What the browser receives. `leave` and `applicationId` are null in the
// employee view.
export type CalendarEntry = {
  key: string;
  applicationId: string | null;
  date: IsoDate;
  portion: number;
  halfDaySlot: HalfDaySlot | null;
  startDate: IsoDate;
  endDate: IsoDate;
  employeeId: string;
  fullName: string;
  photoUrl: string | null;
  departmentName: string;
  branchName: string;
  leave: { code: LeaveTypeCode; status: "pending" | "approved" } | null;
};

function person(row: CalendarRow) {
  return {
    date: row.date,
    portion: row.portion,
    halfDaySlot: row.halfDaySlot,
    startDate: row.startDate,
    endDate: row.endDate,
    employeeId: row.employeeId,
    fullName: row.fullName,
    photoUrl: row.photoUrl,
    departmentName: row.departmentName,
    branchName: row.branchName,
  };
}

// Employee view: approved leave only, with the type, status and request id
// removed. Built field by field (never by spreading the row), so nothing new
// on CalendarRow can leak through.
export function publicEntries(rows: readonly CalendarRow[]): CalendarEntry[] {
  return rows
    .filter((row) => row.status === "approved")
    .map((row) => ({
      // Unique per person and date: nobody has two requests on one date.
      key: `${row.employeeId}:${row.date}`,
      applicationId: null,
      ...person(row),
      leave: null,
    }));
}

// Manager, HR viewer and admin view: approved and pending, with the type.
export function detailedEntries(rows: readonly CalendarRow[]): CalendarEntry[] {
  return rows.map((row) => ({
    key: `${row.applicationId}:${row.date}`,
    applicationId: row.applicationId,
    ...person(row),
    leave: { code: row.code, status: row.status },
  }));
}

// Short codes for the calendar chips.
export const LEAVE_CODES: Record<LeaveTypeCode, string> = {
  annual: "AL",
  mc: "MC",
  unpaid: "UL",
};

export const ON_LEAVE_LABEL = "On leave";

// The chip text: "AL", "MC", "UL", or "On leave" in the employee view.
export function entryLabel(entry: Pick<CalendarEntry, "leave">): string {
  return entry.leave ? LEAVE_CODES[entry.leave.code] : ON_LEAVE_LABEL;
}

// "½ AM" / "½ PM" for a half day, "" for a full day.
export function halfDayText(portion: number, slot: HalfDaySlot | null): string {
  if (portion !== 0.5) return "";
  if (slot === "afternoon") return "½ PM";
  if (slot === "morning") return "½ AM";
  return "½";
}

// "Maria S." (first name and surname initial) for tight spaces. One-word
// names are kept whole; names are never cut mid-word.
export function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export const MAX_CELL_ENTRIES = 3;

// A month cell shows at most `max` entries, then "+N more" (N = the rest).
export function cellEntries<T>(list: readonly T[], max = MAX_CELL_ENTRIES): { shown: T[]; more: number } {
  if (list.length <= max) return { shown: [...list], more: 0 };
  return { shown: list.slice(0, max), more: list.length - max };
}

export type CalendarLayout = "month" | "list";

// The remembered choice for this session, else List on narrow screens
// (under 640px) and Month otherwise.
export function defaultLayout(stored: string | null, narrow: boolean): CalendarLayout {
  if (stored === "month" || stored === "list") return stored;
  return narrow ? "list" : "month";
}

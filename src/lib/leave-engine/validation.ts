// Leave application rules. Pure: the service (and the form, for live
// feedback) loads the context; this returns every failing rule with a
// message the employee can act on. The server always re-validates.

import { formatDisplayDate } from "../utils/dates";

import { formatDays } from "./balance";
import { LEAVE_TYPE_NAMES, MC_BACKDATE_DAYS, type Classification, type LeaveTypeCode } from "./constants";
import { MAX_REQUEST_RANGE_DAYS, rangeLength, totalDays, type SelectedDay } from "./day-selection";
import { eligibleFrom, type EligibilityPolicy } from "./eligibility";
import type { HalfDaySlot } from "./half-day";
import { addDays, type IsoDate } from "./iso-date";
import { periodRelation, periodsOf, type PeriodBalance } from "./request-period";

export type ApplicationRequest = {
  leaveType: LeaveTypeCode;
  // The range the employee chose; the ticked dates must lie inside it.
  startDate: IsoDate;
  endDate: IsoDate;
  halfDay: boolean;
  halfDaySlot: HalfDaySlot | null;
  // The ticked dates only.
  days: SelectedDay[];
};

export type ValidationContext = {
  today: IsoDate;
  employee: { joinDate: IsoDate; classification: Classification };
  policy: EligibilityPolicy & { advanceNoticeDaysForeign: number };
  // Balances known for this leave type, by period (current, and the
  // projected next period). A request in a period not listed here fails,
  // unless partialBalances is set (the form, which leaves it to the server).
  balances: PeriodBalance[];
  partialBalances?: boolean;
  // The employee's own pending and approved dates, any leave type, with the
  // portion already booked on each (0.5 for a half day).
  bookedDays: readonly { date: IsoDate; portion: number }[];
  hasApprovalRoute: boolean;
  // An admin applying on the employee's behalf: any leave type may be backdated.
  onBehalf?: boolean;
  // An admin override of the foreign advance-notice rule.
  noticeOverridden?: boolean;
};

export type IssueField = "form" | "leaveType" | "startDate" | "endDate" | "halfDaySlot" | "days";

export type ValidationRule =
  | "approval-route"
  | "date-order"
  | "max-range"
  | "half-day-single-date"
  | "half-day-slot"
  | "days-in-range"
  | "min-days"
  | "not-started"
  | "eligibility"
  | "backdating"
  | "advance-notice"
  | "one-period"
  | "beyond-next-period"
  | "no-balance"
  | "balance"
  | "overlap";

export type ValidationIssue = { field: IssueField; rule: ValidationRule; message: string };

export const APPROVAL_ROUTE_MISSING = "Your approval route hasn't been set up yet. Please contact HR.";

const day = (date: IsoDate) => formatDisplayDate(date);
const days = (count: number) => `${formatDays(count)} ${count === 1 ? "day" : "days"}`;
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function validateApplication(request: ApplicationRequest, context: ValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (field: IssueField, rule: ValidationRule, message: string) => issues.push({ field, rule, message });
  const typeName = LEAVE_TYPE_NAMES[request.leaveType];
  const { today, employee } = context;

  if (!context.hasApprovalRoute) add("form", "approval-route", APPROVAL_ROUTE_MISSING);

  // --- Shape of the request -------------------------------------------------
  const reversed = request.endDate < request.startDate;
  if (reversed) add("endDate", "date-order", "The end date can't be before the start date.");
  const tooLong = !reversed && rangeLength(request.startDate, request.endDate) > MAX_REQUEST_RANGE_DAYS;
  if (tooLong) {
    add(
      "endDate",
      "max-range",
      `A request can cover at most ${MAX_REQUEST_RANGE_DAYS} days. Please split it into shorter requests.`,
    );
  }

  if (request.halfDay) {
    if (request.startDate !== request.endDate) {
      add("halfDaySlot", "half-day-single-date", "A half day must be a single date. Choose the same start and end date.");
    }
    if (!request.halfDaySlot) add("halfDaySlot", "half-day-slot", "Choose morning or afternoon.");
  }

  const dates = request.days.map((d) => d.date);
  const outside = dates.filter((date) => date < request.startDate || date > request.endDate);
  const duplicated = new Set(dates).size !== dates.length;
  const wrongPortion = request.days.some((d) => d.portion !== (request.halfDay ? 0.5 : 1));
  if (outside.length > 0 || duplicated || (request.halfDay && request.days.length > 1) || wrongPortion) {
    add("days", "days-in-range", "The selected dates don't match the chosen range. Please pick the dates again.");
  }

  const requested = totalDays(request.days);
  if (requested < 0.5) add("days", "min-days", "Select at least one day.");

  // The remaining rules need a valid list of dates.
  if (reversed || tooLong || request.days.length === 0 || outside.length > 0 || duplicated) return issues;
  const sorted = [...dates].sort();
  const first = sorted[0];

  if (today < employee.joinDate) {
    add("form", "not-started", `You can apply for leave from your join date, ${day(employee.joinDate)}.`);
    return issues;
  }

  // --- Eligibility, backdating and notice (the first selected date) ---------
  const from = eligibleFrom(employee.joinDate, employee.classification, context.policy);
  if (first < from) {
    add("startDate", "eligibility", `You can take ${typeName} from ${day(from)}.`);
  }

  if (!context.onBehalf) {
    if (request.leaveType === "mc") {
      const earliest = addDays(today, -MC_BACKDATE_DAYS);
      if (first < earliest) {
        add("startDate", "backdating", `MC can start at most ${MC_BACKDATE_DAYS} days ago (${day(earliest)} or later).`);
      }
    } else if (first < today) {
      add("startDate", "backdating", `${capitalise(typeName)} can't start in the past.`);
    }
  }

  const notice = context.policy.advanceNoticeDaysForeign;
  if (
    request.leaveType === "annual" &&
    employee.classification === "foreign" &&
    notice > 0 &&
    !context.noticeOverridden
  ) {
    const earliest = addDays(today, notice);
    if (first < earliest) {
      add(
        "startDate",
        "advance-notice",
        `Foreign staff must apply for annual leave at least ${notice} days ahead. The earliest start date is ${day(earliest)}.`,
      );
    }
  }

  // --- One period, balance and overlap ---------------------------------------
  const periods = periodsOf(request.leaveType, employee.joinDate, sorted);
  if (periods.length > 1) {
    const yearWord = request.leaveType === "annual" ? "leave year" : "calendar year";
    add(
      "days",
      "one-period",
      `These dates cross into a new ${yearWord} on ${day(periods[1].start)}. ` +
        `Please split this into two requests: one up to ${day(periods[0].end)} and one from ${day(periods[1].start)}.`,
    );
  } else if (periods.length === 1) {
    const period = periods[0];
    const relation = periodRelation(request.leaveType, employee.joinDate, today, period);
    const balance = context.balances.find((b) => b.periodStart === period.start);
    if (relation === "beyond") {
      add(
        "days",
        "beyond-next-period",
        request.leaveType === "annual"
          ? "You can only request leave up to the end of your next leave year."
          : `You can only request ${typeName} up to the end of next year.`,
      );
    } else if (!balance) {
      if (!context.partialBalances) {
        add("days", "no-balance", `There is no ${typeName} balance for ${day(period.start)} – ${day(period.end)}.`);
      }
    } else if (requested > balance.availableAfterPending) {
      const left = Math.max(balance.availableAfterPending, 0);
      const pendingNote = balance.pending > 0 ? " (after your pending requests)" : "";
      add(
        "days",
        "balance",
        request.leaveType === "unpaid"
          ? `Your unpaid leave allowance has ${days(left)} left${pendingNote}; you selected ${days(requested)}.`
          : `You have ${days(left)} of ${typeName} available${pendingNote}; you selected ${days(requested)}.`,
      );
    }
  }

  const booked = new Map(context.bookedDays.map((b) => [b.date, b.portion]));
  const clashes = sorted.filter((date) => booked.has(date));
  if (request.halfDay && clashes.length === 1 && booked.get(clashes[0]) === 0.5) {
    // Strict per-date rule: a second half day on the same date is refused too.
    add(
      "days",
      "overlap",
      `You already have a half day on ${day(clashes[0])}. To take the whole day, cancel that request and apply for a full day.`,
    );
  } else if (clashes.length > 0) {
    add(
      "days",
      "overlap",
      `You already have leave on ${clashes.map(day).join(", ")}. Untick ${clashes.length === 1 ? "that date" : "those dates"} or cancel the other request.`,
    );
  }

  return issues;
}

// One message per field (joined), for inline display and API fieldErrors.
export function issuesByField(issues: readonly ValidationIssue[]): Partial<Record<IssueField, string>> {
  const result: Partial<Record<IssueField, string>> = {};
  for (const issue of issues) {
    result[issue.field] = result[issue.field] ? `${result[issue.field]} ${issue.message}` : issue.message;
  }
  return result;
}

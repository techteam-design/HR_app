// The leave emails: what each one says. Pure: the service loads the facts,
// renderEmail() (layout.ts) turns the content into HTML and text.
//
// Only what the recipient needs: never a balance (the employee's own or
// anyone else's). Dates use the shared helpers (DATE columns, so no time
// zone shift); half days show the times stored on the request.

import { formatDays } from "@/lib/leave-engine/balance";
import { LEAVE_TYPE_NAMES, type LeaveTypeCode } from "@/lib/leave-engine/constants";
import { formatSlotTimes, type HalfDaySlot } from "@/lib/leave-engine/half-day";
import type { IsoDate } from "@/lib/leave-engine/iso-date";
import { formatDateRange, formatShortDateRange, formatWeekdayDate } from "@/lib/utils/dates";

import type { EmailContent } from "./layout";

export type LeaveFacts = {
  employeeName: string;
  code: LeaveTypeCode;
  startDate: IsoDate;
  endDate: IsoDate;
  totalDays: number;
  isHalfDay: boolean;
  halfDaySlot: HalfDaySlot | null;
  // The times stored when the half day was booked ("HH:MM").
  halfDayStart: string | null;
  halfDayEnd: string | null;
  reason: string | null;
};

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// "Annual leave", "MC", "Unpaid leave".
export function leaveTypeLabel(code: LeaveTypeCode): string {
  return capitalise(LEAVE_TYPE_NAMES[code]);
}

export function daysText(days: number): string {
  return `${formatDays(days)} ${days === 1 ? "day" : "days"}`;
}

// "12 – 16 Oct 2026", or for a half day "Mon 12 Oct, morning, 8:30 AM – 12:30 PM".
export function datesText(facts: LeaveFacts): string {
  if (facts.isHalfDay && facts.halfDaySlot) {
    const times = facts.halfDayStart && facts.halfDayEnd ? `, ${formatSlotTimes(facts.halfDayStart, facts.halfDayEnd)}` : "";
    return `${formatWeekdayDate(facts.startDate)} ${facts.startDate.slice(0, 4)}, ${facts.halfDaySlot}${times}`;
  }
  return formatDateRange(facts.startDate, facts.endDate);
}

// "12–16 Oct" for subjects.
const shortDates = (facts: LeaveFacts) => formatShortDateRange(facts.startDate, facts.endDate);

function details(facts: LeaveFacts, withEmployee: boolean, withReason: boolean): EmailContent["details"] {
  return [
    ...(withEmployee ? [{ label: "Employee", value: facts.employeeName }] : []),
    { label: "Leave type", value: leaveTypeLabel(facts.code) },
    { label: "Dates", value: datesText(facts) },
    { label: "Days", value: daysText(facts.totalDays) },
    ...(withReason && facts.reason ? [{ label: "Reason", value: facts.reason }] : []),
  ];
}

const remarksQuote = (who: string, remarks: string | null) =>
  remarks ? { label: `Remarks from ${who}`, text: remarks } : null;

// ---------------------------------------------------------------------------
// To approvers
// ---------------------------------------------------------------------------

// 1. A new request (own or on behalf) for its current-level approver.
export function requestSubmittedEmail(
  facts: LeaveFacts,
  { levelText, submittedByName, url }: { levelText: string | null; submittedByName: string | null; url: string },
): EmailContent {
  const by = submittedByName ? ` (submitted by ${submittedByName} on their behalf)` : "";
  return {
    subject: `Leave request from ${facts.employeeName}: ${shortDates(facts)}`,
    heading: "A leave request needs your decision",
    intro: [
      `${facts.employeeName} has asked for ${LEAVE_TYPE_NAMES[facts.code]}${by}.${levelText ? ` You are the ${levelText} approver.` : ""}`,
    ],
    details: details(facts, true, true),
    button: { label: "Review request", url },
  };
}

// 2. Level 1 approved on a two-level route: now for the level 2 approver.
export function level2PendingEmail(
  facts: LeaveFacts,
  { level1ApproverName, remarks, url }: { level1ApproverName: string; remarks: string | null; url: string },
): EmailContent {
  return {
    subject: `Leave request for your approval: ${facts.employeeName}, ${shortDates(facts)}`,
    heading: "A leave request is waiting for you",
    intro: [`${level1ApproverName} approved level 1. The final decision (level 2) is yours.`],
    details: details(facts, true, true),
    quote: remarksQuote(level1ApproverName, remarks),
    button: { label: "Review request", url },
  };
}

// 3. A pending request moved to a new approver after a route change.
export function reassignedEmail(facts: LeaveFacts, { url }: { url: string }): EmailContent {
  return {
    subject: `Leave request moved to you: ${facts.employeeName}, ${shortDates(facts)}`,
    heading: "A leave request has moved to you",
    intro: ["The approval route changed, so this request now waits for your decision."],
    details: details(facts, true, true),
    button: { label: "Review request", url },
  };
}

// 4. Daily digest: everything waiting at least N days for this approver.
export function reminderEmail(
  requests: (LeaveFacts & { waitingDays: number })[],
  { url }: { url: string },
): EmailContent {
  const count = requests.length;
  return {
    subject: `${count} leave ${count === 1 ? "request" : "requests"} waiting for you`,
    heading: count === 1 ? "A leave request is waiting for you" : `${count} leave requests are waiting for you`,
    intro: ["Please approve or reject these when you can."],
    items: requests.map((request) => ({
      title: `${request.employeeName} · ${leaveTypeLabel(request.code)}`,
      lines: [
        `${datesText(request)} (${daysText(request.totalDays)})`,
        `Waiting ${request.waitingDays} ${request.waitingDays === 1 ? "day" : "days"}`,
      ],
    })),
    button: { label: "Open approvals", url },
  };
}

// ---------------------------------------------------------------------------
// To the employee
// ---------------------------------------------------------------------------

// 5. Level 1 approved, waiting for level 2.
export function level1ApprovedEmail(
  facts: LeaveFacts,
  { approverName, remarks, nextApproverName, url }: { approverName: string; remarks: string | null; nextApproverName: string; url: string },
): EmailContent {
  return {
    subject: "Your leave request: approved at level 1",
    heading: "Your request is halfway there",
    intro: [`${approverName} approved level 1. It now waits for ${nextApproverName} to make the final decision.`],
    details: details(facts, false, false),
    quote: remarksQuote(approverName, remarks),
    button: { label: "View my leave", url },
  };
}

// 6. Final approval, including the admin's "Approve anyway".
export function approvedEmail(
  facts: LeaveFacts,
  {
    approverName,
    remarks,
    override,
    url,
  }: { approverName: string; remarks: string | null; override: { adminName: string; reason: string } | null; url: string },
): EmailContent {
  return {
    subject: `Your leave is approved: ${shortDates(facts)}`,
    heading: "Your leave is approved",
    intro: override
      ? [`${override.adminName} reviewed your request and approved it.`]
      : [`${approverName} approved your request.`],
    details: details(facts, false, false),
    quote: override ? { label: `Reason from ${override.adminName}`, text: override.reason } : remarksQuote(approverName, remarks),
    button: { label: "View my leave", url },
  };
}

// 7. Rejected.
export function rejectedEmail(
  facts: LeaveFacts,
  { approverName, remarks, url }: { approverName: string; remarks: string | null; url: string },
): EmailContent {
  return {
    subject: `Your leave request was rejected: ${shortDates(facts)}`,
    heading: "Your leave request was rejected",
    intro: [`${approverName} rejected your request.`],
    details: details(facts, false, false),
    quote: remarksQuote(approverName, remarks),
    button: { label: "View my leave", url },
  };
}

// 8. Cancelled by an approver or the admin (approved leave, or a pending
// request cancelled by the admin).
export function cancelledEmail(
  facts: LeaveFacts,
  {
    cancelledByName,
    note,
    wasApproved,
    url,
  }: { cancelledByName: string; note: string | null; wasApproved: boolean; url: string },
): EmailContent {
  return {
    subject: wasApproved
      ? `Your leave was cancelled: ${shortDates(facts)}`
      : `Your leave request was cancelled: ${shortDates(facts)}`,
    heading: wasApproved ? "Your leave was cancelled" : "Your leave request was cancelled",
    intro: [
      `${cancelledByName} cancelled ${wasApproved ? "your approved leave" : "your request"}.` +
        (wasApproved ? " The days are back in your balance." : ""),
    ],
    details: details(facts, false, false),
    quote: note ? { label: `Note from ${cancelledByName}`, text: note } : null,
    button: { label: "View my leave", url },
  };
}

// 9. Approval revoked by the admin.
export function revokedEmail(
  facts: LeaveFacts,
  { adminName, reason, url }: { adminName: string; reason: string; url: string },
): EmailContent {
  return {
    subject: `Approval revoked: your leave on ${shortDates(facts)}`,
    heading: "The approval of your leave was revoked",
    intro: [
      `${adminName} revoked the approval. The days are back in your balance.`,
      "If you still need this leave, please apply again.",
    ],
    details: details(facts, false, false),
    quote: { label: `Reason from ${adminName}`, text: reason },
    button: { label: "View my leave", url },
  };
}

// 10. Submitted on the employee's behalf by the admin.
export function submittedOnBehalfEmail(
  facts: LeaveFacts,
  { adminName, approverName, url }: { adminName: string; approverName: string; url: string },
): EmailContent {
  return {
    subject: `Leave request submitted for you: ${shortDates(facts)}`,
    heading: "A leave request was submitted for you",
    intro: [`${adminName} submitted this request on your behalf. It now waits for ${approverName}.`],
    details: details(facts, false, true),
    button: { label: "View my leave", url },
  };
}

// The admin's "Send test email".
export function testEmail({ name, url }: { name: string; url: string }): EmailContent {
  return {
    subject: "Test email from SBC HR",
    heading: "Email is working",
    intro: [`Hello ${name}, this is a test email from the SBC HR app. If you can read this, delivery works.`],
    details: [{ label: "Sent from", value: url }],
    button: { label: "Open SBC HR", url },
    footnote: "Sent from the Approval setup page.",
  };
}

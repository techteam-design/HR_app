// Re-check at final approval. Pure: the service loads the inputs inside the
// employee's locked transaction.
//
// Only the final approval uses the balance, so it must still fit:
// - balance: the period the dates fall in must have at least the requested
//   days AVAILABLE (entitled + carried forward + adjustments − approved; for
//   the next period its base entitlement − approved; for unpaid the
//   allowance − approved). Other PENDING requests do not count: the first
//   one approved wins.
// - overlap: no other pending or approved request of the employee on any
//   of the same dates.
// Backdating, notice and eligibility were checked at submission and are not
// re-applied (an approval may come after the leave has started).
// An admin's "Approve anyway" of a rejected request runs the same check
// (override: true only changes the advice in the messages).

import { formatDisplayDate } from "@/lib/utils/dates";

import { formatDays } from "./balance";
import { LEAVE_TYPE_NAMES, type LeaveTypeCode } from "./constants";
import type { IsoDate } from "./iso-date";

export type FinalApprovalInput = {
  leaveType: LeaveTypeCode;
  employeeName: string;
  requestedDays: number;
  // Null when the period has no balance (no entitlement row).
  available: number | null;
  // Dates of the employee's OTHER pending or approved requests that fall on
  // this request's dates.
  clashingDates: readonly IsoDate[];
  // "Approve anyway" of a rejected request.
  override?: boolean;
};

const days = (count: number) => `${formatDays(count)} ${count === 1 ? "day" : "days"}`;

export function finalApprovalIssues(input: FinalApprovalInput): string[] {
  const issues: string[] = [];
  const typeName = LEAVE_TYPE_NAMES[input.leaveType];

  if (input.available === null) {
    issues.push(`There is no ${typeName} balance for these dates, so this request can't be approved.`);
  } else if (input.requestedDays > input.available) {
    issues.push(
      `Not enough balance: ${input.employeeName} has ${days(Math.max(input.available, 0))} of ${typeName} ` +
        `available for these dates and this request needs ${days(input.requestedDays)}. ` +
        (input.override ? "Adjust the balance first, or leave it rejected." : "Reject it, or adjust the balance first."),
    );
  }

  if (input.clashingDates.length > 0) {
    const dates = [...new Set(input.clashingDates)].sort().map(formatDisplayDate).join(", ");
    issues.push(
      input.override
        ? `${input.employeeName} already has other leave on ${dates}. Cancel the other request first, or leave this one rejected.`
        : `${input.employeeName} already has other leave on ${dates}. Reject this request or cancel the other one.`,
    );
  }

  return issues;
}

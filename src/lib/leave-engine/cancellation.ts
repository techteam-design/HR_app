// Who may cancel a leave request, and when. Pure: no database.
//
// - The employee: their own pending request at any time; their own approved
//   request only before its first selected date (start_date).
// - An admin: any pending or approved request, with a required note.
// - Rejected and cancelled requests are final.
// Balances restore automatically: they are calculated from pending and
// approved requests only.

import type { IsoDate } from "./iso-date";

export type ApplicationStatus = "pending" | "approved" | "rejected" | "cancelled";

export type CancelDecision =
  | { allowed: true; asAdmin: boolean; noteRequired: boolean }
  | { allowed: false; reason: string };

export function cancelDecision({
  status,
  firstDate,
  today,
  isOwner,
  isAdmin,
}: {
  status: ApplicationStatus;
  firstDate: IsoDate;
  today: IsoDate;
  isOwner: boolean;
  isAdmin: boolean;
}): CancelDecision {
  if (status === "rejected" || status === "cancelled") {
    return { allowed: false, reason: `This request is already ${status}.` };
  }
  if (isOwner && (status === "pending" || firstDate > today)) {
    return { allowed: true, asAdmin: false, noteRequired: false };
  }
  if (isAdmin) return { allowed: true, asAdmin: true, noteRequired: true };
  if (!isOwner) return { allowed: false, reason: "You can only cancel your own requests." };
  return {
    allowed: false,
    reason: "Approved leave can only be cancelled before its first day. Please contact HR.",
  };
}

// For showing the Cancel button to the employee on their own history.
export function canEmployeeCancel(status: ApplicationStatus, firstDate: IsoDate, today: IsoDate): boolean {
  return status === "pending" || (status === "approved" && firstDate > today);
}

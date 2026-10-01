// Who may cancel a leave request, and when. Pure: no database.
//
// - The employee: their own request only while it is PENDING (including
//   after level 1 approval on a two-level route, until the final approval).
//   Approved leave cannot be cancelled by the employee.
// - An approver on the request's route (level 1 or level 2): APPROVED leave,
//   at any time, with a required note. Pending requests are rejected, not
//   cancelled.
// - An admin: any pending or approved request, with a required note.
// - Rejected, cancelled and revoked requests are final. (An admin may still
//   "Approve anyway" a rejected request: src/lib/approvals/override.ts.)
// Balances restore automatically: they are calculated from pending and
// approved requests only.

export type ApplicationStatus = "pending" | "approved" | "rejected" | "cancelled" | "revoked";

export type CancelDecision =
  | { allowed: true; as: "owner" | "approver" | "admin"; noteRequired: boolean }
  | { allowed: false; reason: string };

export const APPROVED_OWNER_REFUSAL =
  "Approved leave can't be cancelled by you. Please ask your approver or HR to cancel it.";

export function cancelDecision({
  status,
  isOwner,
  isApprover,
  isAdmin,
}: {
  status: ApplicationStatus;
  isOwner: boolean;
  // The actor is the level 1 or level 2 approver of this request.
  isApprover: boolean;
  isAdmin: boolean;
}): CancelDecision {
  if (status === "rejected" || status === "cancelled") {
    return { allowed: false, reason: `This request is already ${status}.` };
  }
  if (status === "revoked") return { allowed: false, reason: "This request's approval was revoked." };
  if (isOwner && status === "pending") return { allowed: true, as: "owner", noteRequired: false };
  if (isAdmin) return { allowed: true, as: "admin", noteRequired: true };
  if (isApprover && status === "approved") return { allowed: true, as: "approver", noteRequired: true };
  if (isApprover) {
    return { allowed: false, reason: "A pending request is rejected, not cancelled. Use Reject in Approvals." };
  }
  if (isOwner) return { allowed: false, reason: APPROVED_OWNER_REFUSAL };
  return { allowed: false, reason: "You can only cancel your own requests." };
}

// For showing the Cancel button to the employee on their own history.
export function canEmployeeCancel(status: ApplicationStatus): boolean {
  return status === "pending";
}

// For showing Cancel to an approver (queue, team calendar) or an admin.
export function canCancelAsApproverOrAdmin(status: ApplicationStatus, isAdmin: boolean): boolean {
  return status === "approved" || (isAdmin && status === "pending");
}

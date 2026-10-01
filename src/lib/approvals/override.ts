// An admin overriding a decision after the fact. Pure: no database.
//
// - "Revoke approval": an APPROVED request (decided by anyone) becomes
//   "revoked" ("Approval revoked"). Final, like cancelled: the balance
//   restores (only pending and approved days count) and it can never be
//   approved again; the employee re-applies or the admin applies on their
//   behalf.
// - "Approve anyway": a REJECTED request becomes approved. It is a final
//   approval: balance and overlap are re-checked (final-approval.ts), and a
//   request rejected at level 1 of a two-level route skips level 2.
// Both need a reason and are recorded in approval_overrides; the original
// decision in approval_actions is never changed.

import type { ApplicationStatus } from "@/lib/leave-engine/cancellation";

export type OverrideAction = "revoke" | "approve";
export type OverrideKind = "approval_revoked" | "rejection_overridden";

export const OVERRIDE_ACTIONS = ["revoke", "approve"] as const;

export const OVERRIDE_KINDS: Record<OverrideAction, OverrideKind> = {
  revoke: "approval_revoked",
  approve: "rejection_overridden",
};

// The status each override starts from, and the status it ends in.
export const OVERRIDE_STATES: Record<OverrideAction, { from: ApplicationStatus; to: ApplicationStatus }> = {
  revoke: { from: "approved", to: "revoked" },
  approve: { from: "rejected", to: "approved" },
};

// Button labels.
export const OVERRIDE_ACTION_LABELS: Record<OverrideAction, string> = {
  revoke: "Revoke approval",
  approve: "Approve anyway",
};

// History lines: "Approval revoked by Vaidik Dubey".
export const OVERRIDE_LINE: Record<OverrideKind, string> = {
  approval_revoked: "Approval revoked by",
  rejection_overridden: "Rejection overridden by",
};

export const MIN_OVERRIDE_REASON_LENGTH = 3;

export type OverrideDecision =
  | { allowed: true; kind: OverrideKind; from: ApplicationStatus; to: ApplicationStatus }
  | { allowed: false; reason: string };

const REFUSALS: Record<OverrideAction, Partial<Record<ApplicationStatus, string>>> = {
  revoke: {
    pending: "This request is still pending. Approve or reject it in Approvals.",
    rejected: "Only approved leave can be revoked.",
    cancelled: "This request is already cancelled.",
    revoked: "This request's approval was already revoked.",
  },
  approve: {
    pending: "This request is still pending. Approve it in Approvals.",
    approved: "This request is already approved.",
    cancelled: "This request is already cancelled.",
    revoked: "A revoked request is final. The employee can apply again, or you can apply on their behalf.",
  },
};

export function overrideDecision({
  status,
  action,
  isAdmin,
}: {
  status: ApplicationStatus;
  action: OverrideAction;
  isAdmin: boolean;
}): OverrideDecision {
  if (!isAdmin) return { allowed: false, reason: "Only an admin can override a decision." };
  const { from, to } = OVERRIDE_STATES[action];
  if (status !== from) return { allowed: false, reason: REFUSALS[action][status] ?? "This request can't be changed." };
  return { allowed: true, kind: OVERRIDE_KINDS[action], from, to };
}

// Which override, if any, an admin is offered for a request.
export function overrideFor(status: ApplicationStatus, isAdmin: boolean): OverrideAction | null {
  if (!isAdmin) return null;
  if (status === "approved") return "revoke";
  if (status === "rejected") return "approve";
  return null;
}

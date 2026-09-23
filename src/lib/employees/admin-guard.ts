// Pure rules that protect admin access. No database: callers pass the ids of
// the current active (non-inactive) admins.

export type AdminCheckInput = {
  // The admin making the change.
  actorId: string;
  // The employee being changed.
  targetId: string;
  // Ids of all employees who are currently admins and not inactive.
  activeAdminIds: readonly string[];
  // The target's role and status after the change.
  next: {
    role: "employee" | "manager" | "admin" | "hr_viewer";
    status: "active" | "inactive" | "probation";
  };
};

// Returns an error message if the change is not allowed, otherwise null.
export function checkAdminChange({
  actorId,
  targetId,
  activeAdminIds,
  next,
}: AdminCheckInput): string | null {
  const staysActiveAdmin = next.role === "admin" && next.status !== "inactive";

  if (actorId === targetId) {
    if (next.status === "inactive") return "You cannot deactivate your own account.";
    if (next.role !== "admin") return "You cannot remove your own admin role.";
  }

  const remaining = activeAdminIds.filter((id) => id !== targetId).length + (staysActiveAdmin ? 1 : 0);
  if (remaining === 0) {
    return "At least one active admin is required. Make someone else an admin first.";
  }

  return null;
}

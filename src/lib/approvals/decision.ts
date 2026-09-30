// Approving and rejecting leave requests. Pure: no database.
//
// - The approver snapshotted for the CURRENT level decides; an admin may
//   decide any pending request at its current level (recorded as the admin).
// - Nobody decides their own request.
// - Level 1 approval on a two-level route moves the request to level 2.
//   Any rejection ends the request (a level 1 rejection never reaches
//   level 2). Approval at the last level is the final approval: only then
//   do the days count against the balance.

export type DecisionAction = "approve" | "reject";

export type DecisionApplication = {
  employeeId: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  approvalMode: "single" | "two_level";
  currentLevel: number;
  level1ApproverId: string;
  level2ApproverId: string | null;
};

export type DecisionActor = { id: string; isAdmin: boolean };

export function currentApproverId(application: DecisionApplication): string {
  return application.currentLevel === 2 && application.level2ApproverId
    ? application.level2ApproverId
    : application.level1ApproverId;
}

export function totalLevels(application: Pick<DecisionApplication, "approvalMode">): 1 | 2 {
  return application.approvalMode === "two_level" ? 2 : 1;
}

// "Level 1 of 2", "Level 1 of 1".
export function levelLabel(application: Pick<DecisionApplication, "approvalMode" | "currentLevel">): string {
  return `Level ${application.currentLevel} of ${totalLevels(application)}`;
}

// How the actor may decide: as the assigned approver, as an admin in the
// approver's place, or not at all.
export function decisionRole(actor: DecisionActor, application: DecisionApplication): "assigned" | "admin" | null {
  if (application.status !== "pending" || actor.id === application.employeeId) return null;
  if (currentApproverId(application) === actor.id) return "assigned";
  return actor.isAdmin ? "admin" : null;
}

export type NextState = {
  status: "pending" | "approved" | "rejected";
  currentLevel: 1 | 2;
  // True only for the final approval, which uses the balance.
  finalApproval: boolean;
};

export function nextState(application: DecisionApplication, action: DecisionAction): NextState {
  const level = application.currentLevel === 2 ? 2 : 1;
  if (action === "reject") return { status: "rejected", currentLevel: level, finalApproval: false };
  if (level < totalLevels(application)) return { status: "pending", currentLevel: 2, finalApproval: false };
  return { status: "approved", currentLevel: level, finalApproval: true };
}

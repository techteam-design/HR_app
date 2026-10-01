// Moving pending requests to new approvers after a route change. Pure.
//
// Only levels not yet decided move; decided levels keep their approver and
// history:
// - At level 1 (nothing decided): the request takes the new route as a
//   whole (mode, level 1 and level 2).
// - At level 2 (level 1 approved): level 1's decision stands and level 2
//   goes to the new route's final approver (its level 2, or its only
//   approver for a single-level route), even if that person approved level 1.
// A new route that is not valid ("No route", "Own approver"...) moves
// nothing: the request stays with its current approvers.

import type { ApplicationStatus } from "@/lib/leave-engine/cancellation";

import type { ResolvedRoute, RouteMode } from "./route-resolution";

export type ReassignableApplication = {
  id: string;
  status: ApplicationStatus;
  currentLevel: number;
  approvalMode: RouteMode;
  level1ApproverId: string;
  level2ApproverId: string | null;
};

export type ReassignmentPlan = {
  applicationId: string;
  // The state the conditional update checks (unchanged since it was read).
  expected: { currentLevel: number; level1ApproverId: string; level2ApproverId: string | null };
  next: { approvalMode: RouteMode; level1ApproverId: string; level2ApproverId: string | null };
  // One record per level whose approver changed (null = level added/removed).
  records: { level: 1 | 2; fromApproverId: string | null; toApproverId: string | null }[];
};

export function planReassignment(
  application: ReassignableApplication,
  route: ResolvedRoute,
): ReassignmentPlan | null {
  if (application.status !== "pending" || route.status !== "ok") return null;

  const next =
    application.currentLevel === 2
      ? {
          approvalMode: "two_level" as const,
          level1ApproverId: application.level1ApproverId,
          level2ApproverId: route.level2ApproverId ?? route.level1ApproverId,
        }
      : {
          approvalMode: route.mode,
          level1ApproverId: route.level1ApproverId,
          level2ApproverId: route.level2ApproverId,
        };

  const records: ReassignmentPlan["records"] = [];
  if (next.level1ApproverId !== application.level1ApproverId) {
    records.push({ level: 1, fromApproverId: application.level1ApproverId, toApproverId: next.level1ApproverId });
  }
  if (next.level2ApproverId !== application.level2ApproverId) {
    records.push({ level: 2, fromApproverId: application.level2ApproverId, toApproverId: next.level2ApproverId });
  }
  if (records.length === 0 && next.approvalMode === application.approvalMode) return null;

  return {
    applicationId: application.id,
    expected: {
      currentLevel: application.currentLevel,
      level1ApproverId: application.level1ApproverId,
      level2ApproverId: application.level2ApproverId,
    },
    next,
    records,
  };
}

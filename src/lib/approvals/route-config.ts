// Checks a route an admin is saving (a branch default or a per-employee
// override). Pure: the service loads the approvers' roles and statuses.
// Returns field errors keyed like the form (mode, level1ApproverId,
// level2ApproverId); empty when the route can be saved.
//
// A branch default may still make one person of that branch their own
// approver: that person then shows an "Own approver" warning until an
// override is set. An override can never name its own employee.

import { canApprove, type ApproverInfo, type RouteConfig } from "./route-resolution";

export type RouteFieldErrors = Partial<Record<"mode" | "level1ApproverId" | "level2ApproverId", string>>;

const NOT_AN_APPROVER = "Choose an active manager or admin";

export function checkRouteConfig({
  route,
  ownerId,
  approvers,
}: {
  route: RouteConfig;
  // The employee an override is for; null for a branch default.
  ownerId: string | null;
  approvers: ReadonlyMap<string, ApproverInfo>;
}): RouteFieldErrors {
  const errors: RouteFieldErrors = {};

  if (!canApprove(approvers.get(route.level1ApproverId))) errors.level1ApproverId = NOT_AN_APPROVER;
  else if (ownerId && route.level1ApproverId === ownerId) errors.level1ApproverId = "Nobody can approve their own leave";

  if (route.mode === "two_level") {
    if (!route.level2ApproverId) errors.level2ApproverId = "Choose the level 2 approver";
    else if (route.level2ApproverId === route.level1ApproverId) {
      errors.level2ApproverId = "Level 1 and level 2 must be different people";
    } else if (!canApprove(approvers.get(route.level2ApproverId))) errors.level2ApproverId = NOT_AN_APPROVER;
    else if (ownerId && route.level2ApproverId === ownerId) errors.level2ApproverId = "Nobody can approve their own leave";
  } else if (route.level2ApproverId) {
    errors.level2ApproverId = "A single-level route has no level 2 approver";
  }

  return errors;
}

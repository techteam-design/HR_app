// Which approval route applies to an employee. Pure: no database.
//
// Resolution order, used everywhere (submission, the approval setup page,
// warnings):
//   per-employee override > managers' rule > branch default > no route
// - Admins take no leave: they need no route ("not_required").
// - Managers (team heads included): single level, approved by the managers'
//   leave approver (the approval setting, or the only active admin when the
//   setting is empty). The branch default never applies to managers.
// - Employees and HR viewers: their branch default.
// The first source that applies is used and then validated. An invalid
// route does NOT fall through to the next source: the person shows a
// problem ("Own approver", "No route", ...) until an admin fixes it.

export type RouteMode = "single" | "two_level";
export type RouteRole = "employee" | "manager" | "admin" | "hr_viewer";
export type RouteStatus = "active" | "inactive" | "probation";

export type RouteConfig = {
  mode: RouteMode;
  level1ApproverId: string;
  level2ApproverId: string | null;
};

export type ApproverInfo = { role: RouteRole; status: RouteStatus };

export type RouteSource = "override" | "manager_rule" | "branch_default";
export type RouteProblem = "no_route" | "own_approver" | "invalid_approver";

export type ResolvedRoute =
  | { status: "not_required" }
  | {
      status: "ok";
      source: RouteSource;
      mode: RouteMode;
      level1ApproverId: string;
      level2ApproverId: string | null;
    }
  | { status: "problem"; source: RouteSource | null; problem: RouteProblem; message: string };

export type RouteInputs = {
  override: RouteConfig | null;
  branchDefault: RouteConfig | null;
  // Result of resolveManagersApprover(): null when there is none.
  managersApproverId: string | null;
  // Every possible approver's role and status, by employee id.
  approvers: ReadonlyMap<string, ApproverInfo>;
};

export const ROUTE_SOURCE_LABELS: Record<RouteSource, string> = {
  override: "Override",
  manager_rule: "Manager rule",
  branch_default: "Branch default",
};

export const ROUTE_PROBLEM_LABELS: Record<RouteProblem, string> = {
  no_route: "No route",
  own_approver: "Own approver",
  invalid_approver: "Invalid approver",
};

// Only active (or probation) managers and admins can approve leave.
export function canApprove(info: ApproverInfo | undefined): boolean {
  return !!info && info.status !== "inactive" && (info.role === "manager" || info.role === "admin");
}

// The managers' leave approver: the setting when it names an active admin;
// when the setting is empty, the only active admin. Otherwise none (a
// setting that no longer names an active admin never falls back).
export function resolveManagersApprover(
  settingApproverId: string | null,
  activeAdminIds: readonly string[],
): { id: string; fromSetting: boolean } | null {
  if (settingApproverId) {
    return activeAdminIds.includes(settingApproverId) ? { id: settingApproverId, fromSetting: true } : null;
  }
  return activeAdminIds.length === 1 ? { id: activeAdminIds[0], fromSetting: false } : null;
}

// Why a route cannot be used for this employee, or null when it is fine.
export function routeProblem(
  employeeId: string,
  route: RouteConfig,
  approvers: ReadonlyMap<string, ApproverInfo>,
): { problem: RouteProblem; message: string } | null {
  const ids = route.mode === "two_level" ? [route.level1ApproverId, route.level2ApproverId] : [route.level1ApproverId];
  if (route.mode === "two_level" && (!route.level2ApproverId || route.level2ApproverId === route.level1ApproverId)) {
    return { problem: "invalid_approver", message: "A two-level route needs two different approvers." };
  }
  if (ids.includes(employeeId)) {
    return { problem: "own_approver", message: "This route makes them their own approver. Set an override." };
  }
  if (!ids.every((id) => id && canApprove(approvers.get(id)))) {
    return { problem: "invalid_approver", message: "An approver is inactive or cannot approve leave." };
  }
  return null;
}

export function resolveApprovalRoute(
  employee: { id: string; role: RouteRole },
  inputs: RouteInputs,
): ResolvedRoute {
  if (employee.role === "admin") return { status: "not_required" };

  let source: RouteSource;
  let route: RouteConfig;
  if (inputs.override) {
    source = "override";
    route = inputs.override;
  } else if (employee.role === "manager") {
    if (!inputs.managersApproverId) {
      return {
        status: "problem",
        source: "manager_rule",
        problem: "no_route",
        message: "No managers' leave approver is set. Choose one in Approval setup.",
      };
    }
    source = "manager_rule";
    route = { mode: "single", level1ApproverId: inputs.managersApproverId, level2ApproverId: null };
  } else if (inputs.branchDefault) {
    source = "branch_default";
    route = inputs.branchDefault;
  } else {
    return { status: "problem", source: null, problem: "no_route", message: "Their branch has no default route." };
  }

  const issue = routeProblem(employee.id, route, inputs.approvers);
  if (issue) return { status: "problem", source, ...issue };
  return {
    status: "ok",
    source,
    mode: route.mode,
    level1ApproverId: route.level1ApproverId,
    level2ApproverId: route.mode === "two_level" ? route.level2ApproverId : null,
  };
}

// Approver ids of a resolved route, level 1 first.
export function routeApproverIds(route: ResolvedRoute): string[] {
  if (route.status !== "ok") return [];
  return route.level2ApproverId ? [route.level1ApproverId, route.level2ApproverId] : [route.level1ApproverId];
}

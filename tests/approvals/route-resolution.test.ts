import { describe, expect, it } from "vitest";

import {
  canApprove,
  resolveApprovalRoute,
  resolveManagersApprover,
  routeApproverIds,
  routeProblem,
  type ApproverInfo,
  type RouteConfig,
  type RouteInputs,
} from "@/lib/approvals/route-resolution";

// Dev team: admin (Vaidik), manager Daniel, second manager Chua, employee
// Priya, HR viewer Grace, an inactive manager and an employee-role person.
const ADMIN = "admin";
const DANIEL = "daniel";
const CHUA = "chua";
const PRIYA = "priya";
const GRACE = "grace";
const OLD_MANAGER = "old-manager";
const CLERK = "clerk";

const approvers = new Map<string, ApproverInfo>([
  [ADMIN, { role: "admin", status: "active" }],
  [DANIEL, { role: "manager", status: "active" }],
  [CHUA, { role: "manager", status: "probation" }],
  [PRIYA, { role: "employee", status: "active" }],
  [GRACE, { role: "hr_viewer", status: "active" }],
  [OLD_MANAGER, { role: "manager", status: "inactive" }],
  [CLERK, { role: "employee", status: "active" }],
]);

const single = (level1: string): RouteConfig => ({ mode: "single", level1ApproverId: level1, level2ApproverId: null });
const twoLevel = (level1: string, level2: string | null): RouteConfig => ({
  mode: "two_level",
  level1ApproverId: level1,
  level2ApproverId: level2,
});

const inputs = (overrides: Partial<RouteInputs> = {}): RouteInputs => ({
  override: null,
  branchDefault: single(DANIEL),
  managersApproverId: ADMIN,
  approvers,
  ...overrides,
});

const employee = { id: PRIYA, role: "employee" as const };
const manager = { id: CHUA, role: "manager" as const };

describe("resolveApprovalRoute(): resolution order", () => {
  it("admins need no route, whatever is configured", () => {
    expect(resolveApprovalRoute({ id: ADMIN, role: "admin" }, inputs({ override: single(DANIEL) }))).toEqual({
      status: "not_required",
    });
  });

  it("employee: the branch default (single level)", () => {
    expect(resolveApprovalRoute(employee, inputs())).toEqual({
      status: "ok",
      source: "branch_default",
      mode: "single",
      level1ApproverId: DANIEL,
      level2ApproverId: null,
    });
  });

  it("employee: the branch default (two levels)", () => {
    expect(resolveApprovalRoute(employee, inputs({ branchDefault: twoLevel(DANIEL, ADMIN) }))).toMatchObject({
      status: "ok",
      source: "branch_default",
      mode: "two_level",
      level1ApproverId: DANIEL,
      level2ApproverId: ADMIN,
    });
  });

  it("an override beats the branch default", () => {
    expect(resolveApprovalRoute(employee, inputs({ override: single(CHUA) }))).toMatchObject({
      status: "ok",
      source: "override",
      level1ApproverId: CHUA,
    });
  });

  it("an override beats the manager rule", () => {
    expect(resolveApprovalRoute(manager, inputs({ override: single(DANIEL) }))).toMatchObject({
      status: "ok",
      source: "override",
      level1ApproverId: DANIEL,
    });
  });

  it("manager: single level to the managers' approver, ignoring the branch default", () => {
    expect(resolveApprovalRoute(manager, inputs({ branchDefault: twoLevel(DANIEL, ADMIN) }))).toEqual({
      status: "ok",
      source: "manager_rule",
      mode: "single",
      level1ApproverId: ADMIN,
      level2ApproverId: null,
    });
  });

  it("manager with no managers' approver: No route (never falls back to the branch default)", () => {
    expect(resolveApprovalRoute(manager, inputs({ managersApproverId: null }))).toMatchObject({
      status: "problem",
      source: "manager_rule",
      problem: "no_route",
    });
  });

  it("HR viewer: the branch default", () => {
    expect(resolveApprovalRoute({ id: GRACE, role: "hr_viewer" }, inputs())).toMatchObject({
      status: "ok",
      source: "branch_default",
    });
  });

  it("no override and no branch default: No route", () => {
    expect(resolveApprovalRoute(employee, inputs({ branchDefault: null }))).toMatchObject({
      status: "problem",
      source: null,
      problem: "no_route",
    });
  });

  it("a role change switches the source with the same inputs", () => {
    const same = inputs({ branchDefault: single(DANIEL) });
    expect(resolveApprovalRoute({ id: CHUA, role: "employee" }, same)).toMatchObject({ source: "branch_default" });
    expect(resolveApprovalRoute({ id: CHUA, role: "manager" }, same)).toMatchObject({ source: "manager_rule" });
  });
});

describe("resolveApprovalRoute(): invalid routes never fall through", () => {
  it("a branch default that makes the person their own approver: Own approver", () => {
    expect(resolveApprovalRoute({ id: DANIEL, role: "employee" }, inputs())).toMatchObject({
      status: "problem",
      source: "branch_default",
      problem: "own_approver",
    });
    expect(
      resolveApprovalRoute({ id: DANIEL, role: "hr_viewer" }, inputs({ branchDefault: twoLevel(CHUA, DANIEL) })),
    ).toMatchObject({ problem: "own_approver" });
  });

  it("an inactive approver, or one who is not a manager or admin: Invalid approver", () => {
    expect(resolveApprovalRoute(employee, inputs({ override: single(OLD_MANAGER) }))).toMatchObject({
      status: "problem",
      source: "override",
      problem: "invalid_approver",
    });
    expect(resolveApprovalRoute(employee, inputs({ branchDefault: single(CLERK) }))).toMatchObject({
      problem: "invalid_approver",
    });
    expect(resolveApprovalRoute(employee, inputs({ branchDefault: twoLevel(DANIEL, GRACE) }))).toMatchObject({
      problem: "invalid_approver",
    });
  });

  it("two levels need two different approvers (defensive: the database also checks)", () => {
    expect(resolveApprovalRoute(employee, inputs({ branchDefault: twoLevel(DANIEL, null) }))).toMatchObject({
      problem: "invalid_approver",
    });
    expect(resolveApprovalRoute(employee, inputs({ branchDefault: twoLevel(DANIEL, DANIEL) }))).toMatchObject({
      problem: "invalid_approver",
    });
  });

  it("an invalid override does not fall back to a valid branch default", () => {
    expect(resolveApprovalRoute(employee, inputs({ override: single(OLD_MANAGER), branchDefault: single(DANIEL) }))).toMatchObject({
      status: "problem",
      source: "override",
    });
  });
});

describe("resolveManagersApprover()", () => {
  it("uses the setting when it names an active admin", () => {
    expect(resolveManagersApprover(ADMIN, [ADMIN, "admin-2"])).toEqual({ id: ADMIN, fromSetting: true });
  });

  it("falls back to the only active admin when the setting is empty", () => {
    expect(resolveManagersApprover(null, [ADMIN])).toEqual({ id: ADMIN, fromSetting: false });
  });

  it("has none with no admin, or more than one and no setting", () => {
    expect(resolveManagersApprover(null, [])).toBeNull();
    expect(resolveManagersApprover(null, [ADMIN, "admin-2"])).toBeNull();
  });

  it("never falls back when the setting no longer names an active admin", () => {
    expect(resolveManagersApprover("former-admin", [ADMIN])).toBeNull();
  });
});

describe("helpers", () => {
  it("canApprove: active or probation managers and admins only", () => {
    expect(canApprove(approvers.get(ADMIN))).toBe(true);
    expect(canApprove(approvers.get(CHUA))).toBe(true);
    expect(canApprove(approvers.get(OLD_MANAGER))).toBe(false);
    expect(canApprove(approvers.get(PRIYA))).toBe(false);
    expect(canApprove(approvers.get(GRACE))).toBe(false);
    expect(canApprove(undefined)).toBe(false);
  });

  it("routeProblem: null for a valid route", () => {
    expect(routeProblem(PRIYA, twoLevel(DANIEL, ADMIN), approvers)).toBeNull();
  });

  it("routeApproverIds: level 1 first; none for a problem", () => {
    expect(routeApproverIds(resolveApprovalRoute(employee, inputs({ branchDefault: twoLevel(DANIEL, ADMIN) })))).toEqual([
      DANIEL,
      ADMIN,
    ]);
    expect(routeApproverIds(resolveApprovalRoute(employee, inputs({ branchDefault: null })))).toEqual([]);
  });
});

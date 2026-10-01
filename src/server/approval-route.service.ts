import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { getDb } from "@/db";
import {
  approvalRouteOverrides,
  approvalSettings,
  branchApprovalRoutes,
  branches,
  departments,
  employees,
  leaveApplications,
} from "@/db/schema";
import { checkRouteConfig } from "@/lib/approvals/route-config";
import { planReassignment, type ReassignmentPlan } from "@/lib/approvals/reassignment";
import {
  canApprove,
  resolveApprovalRoute,
  resolveManagersApprover,
  routeApproverIds,
  type ApproverInfo,
  type ResolvedRoute,
  type RouteConfig,
  type RouteRole,
  type RouteStatus,
} from "@/lib/approvals/route-resolution";
import type { RouteInput } from "@/validations/approval";

import { notifyAfterCommit, reassignmentWindowStart } from "./notification.service";
import { fail, UUID, type ServiceResult } from "./service-result";

// Approval routes: loading the resolver's inputs, saving branch defaults,
// per-employee overrides and the managers' leave approver, and moving
// pending requests when a route changes. The rules themselves live in
// src/lib/approvals (route-resolution, route-config, reassignment).
//
// A route change and the reassignment of the pending requests it affects
// are written in ONE db.batch (one transaction). Each reassignment is a
// single conditional statement: it only moves a request still pending at
// the level (and with the approvers) it was planned from, and it records
// every moved level in approval_reassignments.

type Statement = BatchItem<"pg">;

export type RouteEmployee = {
  id: string;
  employeeCode: string;
  fullName: string;
  role: RouteRole;
  status: RouteStatus;
  branchId: string;
  departmentId: string;
  reportingManagerId: string | null;
  photoKey: string | null;
};

export type RouteContext = {
  employees: RouteEmployee[];
  byId: Map<string, RouteEmployee>;
  branchNames: Map<string, string>;
  overrides: Map<string, RouteConfig>;
  branchDefaults: Map<string, RouteConfig>;
  settingApproverId: string | null;
  activeAdminIds: string[];
  approvers: Map<string, ApproverInfo>;
  managersApprover: { id: string; fromSetting: boolean } | null;
};

export type Approver = { level: 1 | 2; id: string; name: string };

const toConfig = (row: { mode: "single" | "two_level"; level1ApproverId: string; level2ApproverId: string | null }): RouteConfig => ({
  mode: row.mode,
  level1ApproverId: row.level1ApproverId,
  level2ApproverId: row.mode === "two_level" ? row.level2ApproverId : null,
});

function buildContext(
  list: RouteEmployee[],
  branchRows: { id: string; name: string }[],
  overrideRows: ({ employeeId: string } & RouteConfig)[],
  defaultRows: ({ branchId: string } & RouteConfig)[],
  settingApproverId: string | null,
): RouteContext {
  const activeAdminIds = list.filter((e) => e.role === "admin" && e.status !== "inactive").map((e) => e.id);
  return {
    employees: list,
    byId: new Map(list.map((e) => [e.id, e])),
    branchNames: new Map(branchRows.map((b) => [b.id, b.name])),
    overrides: new Map(overrideRows.map((row) => [row.employeeId, toConfig(row)])),
    branchDefaults: new Map(defaultRows.map((row) => [row.branchId, toConfig(row)])),
    settingApproverId,
    activeAdminIds,
    approvers: new Map(list.map((e) => [e.id, { role: e.role, status: e.status }])),
    managersApprover: resolveManagersApprover(settingApproverId, activeAdminIds),
  };
}

// Everything the resolver needs, for every employee (about 50 rows).
export async function loadRouteContext(): Promise<RouteContext> {
  const db = getDb();
  const [list, branchRows, overrideRows, defaultRows, settingRows] = await db.batch([
    db
      .select({
        id: employees.id,
        employeeCode: employees.employeeCode,
        fullName: employees.fullName,
        role: employees.role,
        status: employees.status,
        branchId: employees.branchId,
        departmentId: employees.departmentId,
        reportingManagerId: employees.reportingManagerId,
        photoKey: employees.photoKey,
      })
      .from(employees)
      .orderBy(asc(employees.fullName)),
    db.select({ id: branches.id, name: branches.name }).from(branches),
    db
      .select({
        employeeId: approvalRouteOverrides.employeeId,
        mode: approvalRouteOverrides.mode,
        level1ApproverId: approvalRouteOverrides.level1ApproverId,
        level2ApproverId: approvalRouteOverrides.level2ApproverId,
      })
      .from(approvalRouteOverrides),
    db
      .select({
        branchId: branchApprovalRoutes.branchId,
        mode: branchApprovalRoutes.mode,
        level1ApproverId: branchApprovalRoutes.level1ApproverId,
        level2ApproverId: branchApprovalRoutes.level2ApproverId,
      })
      .from(branchApprovalRoutes),
    db.select({ managersApproverId: approvalSettings.managersApproverId }).from(approvalSettings).limit(1),
  ]);
  return buildContext(list, branchRows, overrideRows, defaultRows, settingRows[0]?.managersApproverId ?? null);
}

// The context as it will be after a change (for planning reassignments
// before anything is written).
export type RouteChange =
  | { kind: "managers_approver"; approverId: string | null }
  | { kind: "branch_default"; branchId: string; route: RouteConfig | null }
  | { kind: "override"; employeeIds: string[]; route: RouteConfig | null }
  | { kind: "employee"; id: string; role: RouteRole; status: RouteStatus; branchId: string };

export function withChange(context: RouteContext, change: RouteChange): RouteContext {
  const list = context.employees.map((e) =>
    change.kind === "employee" && e.id === change.id
      ? { ...e, role: change.role, status: change.status, branchId: change.branchId }
      : e,
  );
  const overrides = new Map(context.overrides);
  const defaults = new Map(context.branchDefaults);
  let setting = context.settingApproverId;
  if (change.kind === "managers_approver") setting = change.approverId;
  if (change.kind === "branch_default") {
    if (change.route) defaults.set(change.branchId, change.route);
    else defaults.delete(change.branchId);
  }
  if (change.kind === "override") {
    for (const id of change.employeeIds) {
      if (change.route) overrides.set(id, change.route);
      else overrides.delete(id);
    }
  }
  return buildContext(
    list,
    [...context.branchNames].map(([id, name]) => ({ id, name })),
    [...overrides].map(([employeeId, route]) => ({ employeeId, ...route })),
    [...defaults].map(([branchId, route]) => ({ branchId, ...route })),
    setting,
  );
}

export function resolveIn(context: RouteContext, employeeId: string): ResolvedRoute {
  const employee = context.byId.get(employeeId);
  if (!employee) return { status: "problem", source: null, problem: "no_route", message: "Employee not found." };
  return resolveApprovalRoute(employee, {
    override: context.overrides.get(employee.id) ?? null,
    branchDefault: context.branchDefaults.get(employee.branchId) ?? null,
    managersApproverId: context.managersApprover?.id ?? null,
    approvers: context.approvers,
  });
}

export function approversOf(context: RouteContext, route: ResolvedRoute): Approver[] {
  return routeApproverIds(route).map((id, index) => ({
    level: (index + 1) as 1 | 2,
    id,
    name: context.byId.get(id)?.fullName ?? "Unknown",
  }));
}

// The route used when this employee submits leave, with approver names.
export async function approvalRouteFor(
  employeeId: string,
): Promise<{ resolved: ResolvedRoute; approvers: Approver[] }> {
  const context = await loadRouteContext();
  const resolved = resolveIn(context, employeeId);
  return { resolved, approvers: approversOf(context, resolved) };
}

// Employees (not inactive) whose resolved route includes this approver at
// any level. For the team calendar.
export function employeesApprovedBy(context: RouteContext, approverId: string): string[] {
  return context.employees
    .filter((e) => e.status !== "inactive" && routeApproverIds(resolveIn(context, e.id)).includes(approverId))
    .map((e) => e.id);
}

// Why this person cannot stop being an approver right now: every branch
// default, override and managers' approval that names them.
export function approverBlockers(context: RouteContext, id: string): string[] {
  const details: string[] = [];
  const levelOf = (route: RouteConfig) => (route.level1ApproverId === id ? 1 : 2);
  const names = (items: string[]) => items.join(", ");

  const branchesFor = [...context.branchDefaults]
    .filter(([, route]) => routeUses(route, id))
    .map(([branchId, route]) => `${context.branchNames.get(branchId) ?? "Unknown branch"} (level ${levelOf(route)})`);
  if (branchesFor.length > 0) details.push(`Branch default approver for: ${names(branchesFor)}`);

  const overridesFor = [...context.overrides]
    .filter(([, route]) => routeUses(route, id))
    .map(([employeeId, route]) => {
      const person = context.byId.get(employeeId);
      return `${person?.fullName ?? "Unknown"} (${person?.employeeCode ?? "?"}, level ${levelOf(route)})`;
    });
  if (overridesFor.length > 0) details.push(`Override approver for: ${names(overridesFor)}`);

  if (context.managersApprover?.id === id) {
    const managers = context.employees
      .filter((e) => e.role === "manager" && e.status !== "inactive" && !context.overrides.has(e.id))
      .map((e) => e.fullName);
    details.push(
      `Managers' leave approver${context.managersApprover.fromSetting ? "" : " (as the only active admin)"}` +
        (managers.length > 0 ? ` for: ${names(managers)}` : ""),
    );
  }
  return details;
}

function routeUses(route: RouteConfig, id: string): boolean {
  return route.level1ApproverId === id || route.level2ApproverId === id;
}

// ---------------------------------------------------------------------------
// Reassigning pending requests
// ---------------------------------------------------------------------------

export type ReassignmentCause = "branch_default" | "override" | "override_reset" | "employee_change" | "manager_approver";

function reassignStatement(plan: ReassignmentPlan, cause: ReassignmentCause, actorId: string): Statement {
  const update = sql`UPDATE leave_applications
    SET approval_mode = ${plan.next.approvalMode}::approval_mode,
        level1_approver_id = ${plan.next.level1ApproverId}::uuid,
        level2_approver_id = ${plan.next.level2ApproverId}::uuid,
        updated_at = now()
    WHERE id = ${plan.applicationId}::uuid
      AND status = 'pending'
      AND current_level = ${plan.expected.currentLevel}::int
      AND level1_approver_id = ${plan.expected.level1ApproverId}::uuid
      AND level2_approver_id IS NOT DISTINCT FROM ${plan.expected.level2ApproverId}::uuid
    RETURNING id`;
  const values = sql.join(
    plan.records.map((r) => sql`(${r.level}::int, ${r.fromApproverId}::uuid, ${r.toApproverId}::uuid)`),
    sql`, `,
  );
  return getDb().execute(sql`WITH moved AS (${update})
    INSERT INTO approval_reassignments (application_id, level, from_approver_id, to_approver_id, cause, changed_by)
    SELECT moved.id, r.level, r.from_id, r.to_id, ${cause}::approval_reassignment_cause, ${actorId}::uuid
    FROM moved CROSS JOIN (VALUES ${values}) AS r(level, from_id, to_id)`);
}

// Statements that move the pending requests of these employees to the
// routes they resolve to in `after`. Requests whose new route is not valid
// stay where they are.
export async function reassignmentStatements(
  after: RouteContext,
  employeeIds: string[],
  cause: ReassignmentCause,
  actorId: string,
): Promise<Statement[]> {
  if (employeeIds.length === 0) return [];
  const pending = await getDb()
    .select({
      id: leaveApplications.id,
      employeeId: leaveApplications.employeeId,
      status: leaveApplications.status,
      currentLevel: leaveApplications.currentLevel,
      approvalMode: leaveApplications.approvalMode,
      level1ApproverId: leaveApplications.level1ApproverId,
      level2ApproverId: leaveApplications.level2ApproverId,
    })
    .from(leaveApplications)
    .where(and(inArray(leaveApplications.employeeId, employeeIds), eq(leaveApplications.status, "pending")));

  return pending.flatMap((application) => {
    const plan = planReassignment(application, resolveIn(after, application.employeeId));
    return plan && plan.records.length > 0 ? [reassignStatement(plan, cause, actorId)] : [];
  });
}

async function runBatch(statements: Statement[]): Promise<void> {
  if (statements.length === 0) return;
  await getDb().batch(statements as [Statement, ...Statement[]]);
}

// Runs the change and its reassignments in one batch, then (after the
// commit, after the response) emails the new approvers of moved requests.
async function runBatchAndNotify(actorId: string, change: Statement[], moves: Statement[]): Promise<void> {
  const since = reassignmentWindowStart();
  await runBatch([...change, ...moves]);
  if (moves.length > 0) notifyAfterCommit({ kind: "reassigned", actorId, since });
}

// ---------------------------------------------------------------------------
// Saving routes (admin only; checked by the API routes)
// ---------------------------------------------------------------------------

const CHECK_FIELDS = "Please check the highlighted fields.";

function configOf(input: RouteInput): RouteConfig {
  return {
    mode: input.mode,
    level1ApproverId: input.level1ApproverId,
    level2ApproverId: input.mode === "two_level" ? input.level2ApproverId : null,
  };
}

// Employees whose route may come from this branch's default.
function branchMembers(context: RouteContext, branchId: string): string[] {
  return context.employees.filter((e) => e.branchId === branchId && e.status !== "inactive").map((e) => e.id);
}

function managers(context: RouteContext): string[] {
  return context.employees.filter((e) => e.role === "manager" && e.status !== "inactive").map((e) => e.id);
}

export async function saveManagersApprover(
  actor: { id: string },
  approverId: string | null,
): Promise<ServiceResult> {
  const context = await loadRouteContext();
  if (approverId && !context.activeAdminIds.includes(approverId)) {
    return fail(400, CHECK_FIELDS, { fieldErrors: { managersApproverId: "Choose an active admin" } });
  }
  const after = withChange(context, { kind: "managers_approver", approverId });
  const db = getDb();
  await runBatchAndNotify(
    actor.id,
    [
      db
        .insert(approvalSettings)
        .values({ id: 1, managersApproverId: approverId, updatedBy: actor.id })
        .onConflictDoUpdate({
          target: approvalSettings.id,
          set: { managersApproverId: approverId, updatedBy: actor.id, updatedAt: new Date() },
        }),
    ],
    await reassignmentStatements(after, managers(context), "manager_approver", actor.id),
  );
  return { ok: true };
}

export async function saveBranchDefault(
  actor: { id: string },
  branchId: string,
  input: RouteInput,
): Promise<ServiceResult> {
  if (!UUID.test(branchId)) return fail(404, "Branch not found");
  const context = await loadRouteContext();
  if (!context.branchNames.has(branchId)) return fail(404, "Branch not found");

  const route = configOf(input);
  const fieldErrors = checkRouteConfig({ route, ownerId: null, approvers: context.approvers });
  if (Object.keys(fieldErrors).length > 0) return fail(400, CHECK_FIELDS, { fieldErrors });

  const after = withChange(context, { kind: "branch_default", branchId, route });
  const db = getDb();
  await runBatchAndNotify(
    actor.id,
    [
      db
        .insert(branchApprovalRoutes)
        .values({ branchId, ...route, updatedBy: actor.id })
        .onConflictDoUpdate({
          target: branchApprovalRoutes.branchId,
          set: { ...route, updatedBy: actor.id, updatedAt: new Date() },
        }),
    ],
    await reassignmentStatements(after, branchMembers(context, branchId), "branch_default", actor.id),
  );
  return { ok: true };
}

export async function removeBranchDefault(actor: { id: string }, branchId: string): Promise<ServiceResult> {
  if (!UUID.test(branchId)) return fail(404, "Branch not found");
  const context = await loadRouteContext();
  if (!context.branchDefaults.has(branchId)) return fail(404, "This branch has no default route");
  // Removing a default leaves its staff with "No route": nothing is moved.
  await getDb().delete(branchApprovalRoutes).where(eq(branchApprovalRoutes.branchId, branchId));
  return { ok: true };
}

// Sets the same override for one or more employees (bulk from the setup page).
export async function saveOverrides(
  actor: { id: string },
  employeeIds: string[],
  input: RouteInput,
): Promise<ServiceResult<{ updated: number }>> {
  const context = await loadRouteContext();
  const route = configOf(input);
  const shared = checkRouteConfig({ route, ownerId: null, approvers: context.approvers });
  if (Object.keys(shared).length > 0) return fail(400, CHECK_FIELDS, { fieldErrors: shared });

  const problems: string[] = [];
  for (const id of employeeIds) {
    const employee = context.byId.get(id);
    if (!employee) problems.push("An employee was not found. Refresh the page and try again.");
    else if (employee.role === "admin") problems.push(`${employee.fullName} is an admin and takes no leave.`);
    else if (employee.status === "inactive") problems.push(`${employee.fullName} is inactive.`);
    else if (routeApproverIds({ status: "ok", source: "override", ...route }).includes(id)) {
      problems.push(`${employee.fullName} would approve their own leave.`);
    }
  }
  if (problems.length > 0) return fail(409, "This route can't be set for everyone selected:", { details: problems });

  const after = withChange(context, { kind: "override", employeeIds, route });
  const db = getDb();
  await runBatchAndNotify(
    actor.id,
    employeeIds.map((employeeId) =>
      db
        .insert(approvalRouteOverrides)
        .values({ employeeId, ...route, updatedBy: actor.id })
        .onConflictDoUpdate({
          target: approvalRouteOverrides.employeeId,
          set: { ...route, updatedBy: actor.id, updatedAt: new Date() },
        }),
    ),
    await reassignmentStatements(after, employeeIds, "override", actor.id),
  );
  return { ok: true, updated: employeeIds.length };
}

// Back to the default (manager rule or branch default).
export async function resetOverrides(
  actor: { id: string },
  employeeIds: string[],
): Promise<ServiceResult<{ updated: number }>> {
  const context = await loadRouteContext();
  const withOverride = employeeIds.filter((id) => context.overrides.has(id));
  if (withOverride.length === 0) return { ok: true, updated: 0 };

  const after = withChange(context, { kind: "override", employeeIds: withOverride, route: null });
  const db = getDb();
  await runBatchAndNotify(
    actor.id,
    [db.delete(approvalRouteOverrides).where(inArray(approvalRouteOverrides.employeeId, withOverride))],
    await reassignmentStatements(after, withOverride, "override_reset", actor.id),
  );
  return { ok: true, updated: withOverride.length };
}

// ---------------------------------------------------------------------------
// The approval setup page
// ---------------------------------------------------------------------------

export type RouteView = {
  mode: "single" | "two_level";
  approvers: { level: 1 | 2; id: string; name: string }[];
};

export type SetupEmployeeRow = {
  id: string;
  employeeCode: string;
  fullName: string;
  role: RouteRole;
  departmentId: string;
  departmentName: string;
  branchId: string;
  branchName: string;
  override: RouteConfig | null;
  resolved: ResolvedRoute;
  approvers: Approver[];
};

export type ApprovalSetup = {
  managersApprover: {
    settingId: string | null;
    resolved: { id: string; name: string; fromSetting: boolean } | null;
  };
  adminOptions: { id: string; name: string }[];
  approverOptions: { id: string; name: string; role: RouteRole }[];
  branches: { id: string; name: string; route: RouteView | null }[];
  departments: { id: string; name: string }[];
  employees: SetupEmployeeRow[];
};

export type SetupFilter = { departmentId?: string; branchId?: string; problemsOnly?: boolean };

export async function getApprovalSetup(filter: SetupFilter = {}): Promise<ApprovalSetup> {
  const db = getDb();
  const [context, branchRows, departmentRows] = await Promise.all([
    loadRouteContext(),
    db.select({ id: branches.id, name: branches.name }).from(branches).where(eq(branches.isActive, true)).orderBy(asc(branches.name)),
    db.select({ id: departments.id, name: departments.name }).from(departments).orderBy(asc(departments.name)),
  ]);
  const name = (id: string) => context.byId.get(id)?.fullName ?? "Unknown";
  const view = (route: RouteConfig): RouteView => ({
    mode: route.mode,
    approvers: [
      { level: 1, id: route.level1ApproverId, name: name(route.level1ApproverId) },
      ...(route.level2ApproverId ? [{ level: 2 as const, id: route.level2ApproverId, name: name(route.level2ApproverId) }] : []),
    ],
  });
  const departmentNames = new Map(departmentRows.map((d) => [d.id, d.name]));

  const conditions: ((e: RouteEmployee) => boolean)[] = [(e) => e.role !== "admin" && e.status !== "inactive"];
  if (filter.departmentId) conditions.push((e) => e.departmentId === filter.departmentId);
  if (filter.branchId) conditions.push((e) => e.branchId === filter.branchId);

  const rows = context.employees
    .filter((e) => conditions.every((test) => test(e)))
    .map((e): SetupEmployeeRow => {
      const resolved = resolveIn(context, e.id);
      return {
        id: e.id,
        employeeCode: e.employeeCode,
        fullName: e.fullName,
        role: e.role,
        departmentId: e.departmentId,
        departmentName: departmentNames.get(e.departmentId) ?? "",
        branchId: e.branchId,
        branchName: context.branchNames.get(e.branchId) ?? "",
        override: context.overrides.get(e.id) ?? null,
        resolved,
        approvers: approversOf(context, resolved),
      };
    })
    .filter((row) => !filter.problemsOnly || row.resolved.status === "problem");

  const activeAdmins = context.employees.filter((e) => context.activeAdminIds.includes(e.id));
  return {
    managersApprover: {
      settingId: context.settingApproverId,
      resolved: context.managersApprover
        ? { ...context.managersApprover, name: name(context.managersApprover.id) }
        : null,
    },
    adminOptions: activeAdmins.map((e) => ({ id: e.id, name: e.fullName })),
    approverOptions: context.employees
      .filter((e) => canApprove({ role: e.role, status: e.status }))
      .map((e) => ({ id: e.id, name: e.fullName, role: e.role })),
    branches: branchRows.map((b) => {
      const route = context.branchDefaults.get(b.id);
      return { id: b.id, name: b.name, route: route ? view(route) : null };
    }),
    departments: departmentRows,
    employees: rows,
  };
}

// Requests currently waiting for this person's decision (for the
// deactivation and role-change checks).
export async function pendingWaitingFor(id: string): Promise<number> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(leaveApplications)
    .where(waitingForCondition(id));
  return row?.count ?? 0;
}

// Pending and at a level whose approver is this person.
export function waitingForCondition(id: string): SQL {
  return and(
    eq(leaveApplications.status, "pending"),
    sql`((${leaveApplications.currentLevel} = 1 AND ${leaveApplications.level1ApproverId} = ${id}) OR (${leaveApplications.currentLevel} = 2 AND ${leaveApplications.level2ApproverId} = ${id}))`,
  )!;
}

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { approvalActions, branches, employees, leaveApplicationDays, leaveApplications } from "@/db/schema";
import { decisionRole, levelLabel, nextState, type DecisionApplication } from "@/lib/approvals/decision";
import { can, type Role } from "@/lib/auth/rbac";
import { canCancelAsApproverOrAdmin } from "@/lib/leave-engine/cancellation";
import { finalApprovalIssues } from "@/lib/leave-engine/final-approval";
import type { IsoDate } from "@/lib/leave-engine/iso-date";
import { periodsOf } from "@/lib/leave-engine/request-period";
import type { DecisionInput, QueueView } from "@/validations/approval";

import { waitingForCondition } from "./approval-route.service";
import { withPhotoUrls } from "./employee-photo.service";
import { ensureEntitlements } from "./entitlement.service";
import { queryApplications, type ApplicationItem } from "./leave-application.service";
import { applyCarryForwardCorrection, bookedOn, periodBalance, runLocked } from "./leave-period.service";
import { loadLeavePolicies, type LeavePolicy } from "./leave-policy.service";
import { fail, UUID, type ServiceResult } from "./service-result";

// The approver queue and decisions. Rules live in src/lib/approvals/decision.ts
// and src/lib/leave-engine/final-approval.ts.
//
// - Level 1 approval on a two-level route and any rejection do not touch the
//   balance: one conditional statement (neon-http) moves the request on and
//   records the decision, only if it is still pending at the level the
//   approver saw. The unique (application, level) index blocks a second
//   decision at the same level.
// - The final approval uses the balance: it runs in the employee's locked
//   transaction, re-checks balance and overlap there, and corrects the
//   carry-forward of a later leave year if needed.

type Actor = { id: string; role: Role };

const isAdmin = (actor: Actor) => can(actor.role, "decide_any_leave");

// For the nav badge: an admin sees every pending request, an approver the
// requests waiting for them.
export async function pendingApprovalCount(actor: Actor): Promise<number> {
  if (!can(actor.role, "approve_leave")) return 0;
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(leaveApplications)
    .where(isAdmin(actor) ? eq(leaveApplications.status, "pending") : waitingForCondition(actor.id));
  return row?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export type QueueItem = ApplicationItem & {
  employee: { id: string; fullName: string; photoUrl: string | null; branchName: string };
  levelLabel: string;
  // The balance of the period the dates fall in (approved days only), and
  // after this request. Null when decided, or when there is no balance.
  balance: { available: number; after: number } | null;
  // How the viewer may decide it (pending only).
  decideAs: "assigned" | "admin" | null;
  canCancel: boolean;
  // "Decided by me": the viewer's own decision.
  myDecision: { action: "approved" | "rejected"; level: number; actedAt: Date } | null;
};

const DECIDED_LIMIT = 30;

export async function listQueue(actor: Actor, view: QueueView, today: IsoDate): Promise<QueueItem[]> {
  const admin = isAdmin(actor);
  let items: ApplicationItem[];
  let decisions = new Map<string, QueueItem["myDecision"]>();

  if (view === "decided") {
    const mine = await getDb()
      .select({
        applicationId: approvalActions.applicationId,
        action: approvalActions.action,
        level: approvalActions.level,
        actedAt: approvalActions.actedAt,
      })
      .from(approvalActions)
      .where(eq(approvalActions.approverId, actor.id))
      .orderBy(desc(approvalActions.actedAt))
      .limit(DECIDED_LIMIT);
    // Latest decision per request (an admin may have decided both levels).
    for (const row of mine) if (!decisions.has(row.applicationId)) decisions.set(row.applicationId, row);
    const ids = [...decisions.keys()];
    const order = new Map(ids.map((id, index) => [id, index]));
    items = ids.length
      ? (await queryApplications(inArray(leaveApplications.id, ids), [])).sort(
          (a, b) => order.get(a.id)! - order.get(b.id)!,
        )
      : [];
  } else {
    const where =
      view === "all" && admin ? eq(leaveApplications.status, "pending") : waitingForCondition(actor.id);
    items = await queryApplications(where, [asc(leaveApplications.submittedAt)]);
    decisions = new Map();
  }
  if (items.length === 0) return [];

  const employeeIds = [...new Set(items.map((item) => item.employeeId))];
  const people = await withPhotoUrls(
    await getDb()
      .select({
        id: employees.id,
        fullName: employees.fullName,
        joinDate: employees.joinDate,
        photoKey: employees.photoKey,
        branchName: branches.name,
      })
      .from(employees)
      .innerJoin(branches, eq(branches.id, employees.branchId))
      .where(inArray(employees.id, employeeIds)),
  );
  const byId = new Map(people.map((p) => [p.id, p]));

  const policies = await loadLeavePolicies();
  const pending = items.filter((item) => item.status === "pending");
  // Current-period rows may not exist yet (e.g. a new leave year started).
  await Promise.all(
    [...new Set(pending.map((item) => item.employeeId))].map((id) => ensureEntitlements(id, today, policies)),
  );
  const balances = new Map(
    await Promise.all(
      pending.map(async (item) => [item.id, await queueBalance(item, byId.get(item.employeeId)!, policies, today)] as const),
    ),
  );

  return items.map((item) => {
    const person = byId.get(item.employeeId)!;
    const onRoute = item.approvers.some((approver) => approver.id === actor.id);
    return {
      ...item,
      employee: { id: person.id, fullName: person.fullName, photoUrl: person.photoUrl, branchName: person.branchName },
      levelLabel: levelLabel(item),
      balance: balances.get(item.id) ?? null,
      decideAs: decisionRole({ id: actor.id, isAdmin: admin }, decisionApplication(item)),
      canCancel: (admin || onRoute) && canCancelAsApproverOrAdmin(item.status, admin),
      myDecision: decisions.get(item.id) ?? null,
    };
  });
}

function decisionApplication(item: ApplicationItem): DecisionApplication {
  return {
    employeeId: item.employeeId,
    status: item.status,
    approvalMode: item.approvalMode,
    currentLevel: item.currentLevel,
    level1ApproverId: item.approvers.find((a) => a.level === 1)!.id,
    level2ApproverId: item.approvers.find((a) => a.level === 2)?.id ?? null,
  };
}

async function queueBalance(
  item: ApplicationItem,
  person: { id: string; joinDate: IsoDate },
  policies: LeavePolicy[],
  today: IsoDate,
): Promise<QueueItem["balance"]> {
  const policy = policies.find((p) => p.code === item.code);
  const periods = periodsOf(item.code, person.joinDate, item.days.map((d) => d.date));
  if (!policy || periods.length !== 1) return null;
  const balance = await periodBalance(getDb(), {
    employee: person,
    policy,
    period: periods[0],
    today,
    excludeApplicationId: item.id,
  });
  return balance ? { available: balance.available, after: balance.available - item.totalDays } : null;
}

// ---------------------------------------------------------------------------
// Decide
// ---------------------------------------------------------------------------

export type Decided = { status: "pending" | "approved" | "rejected"; currentLevel: number };

const MOVED_ON = "This request has just changed. Please refresh the page and try again.";

export async function decideApplication(
  actor: Actor,
  applicationId: string,
  input: DecisionInput,
  today: IsoDate,
): Promise<ServiceResult<Decided>> {
  if (!UUID.test(applicationId)) return fail(404, "Leave request not found");
  const db = getDb();
  const [application] = await db
    .select({
      id: leaveApplications.id,
      employeeId: leaveApplications.employeeId,
      leaveTypeId: leaveApplications.leaveTypeId,
      status: leaveApplications.status,
      approvalMode: leaveApplications.approvalMode,
      currentLevel: leaveApplications.currentLevel,
      level1ApproverId: leaveApplications.level1ApproverId,
      level2ApproverId: leaveApplications.level2ApproverId,
      totalDays: leaveApplications.totalDays,
      employeeName: employees.fullName,
      joinDate: employees.joinDate,
    })
    .from(leaveApplications)
    .innerJoin(employees, eq(employees.id, leaveApplications.employeeId))
    .where(eq(leaveApplications.id, applicationId))
    .limit(1);
  if (!application) return fail(404, "Leave request not found");

  const admin = isAdmin(actor);
  const onRoute = application.level1ApproverId === actor.id || application.level2ApproverId === actor.id;
  const role = decisionRole({ id: actor.id, isAdmin: admin }, application);
  if (!role) {
    if (!admin && !onRoute) return fail(404, "Leave request not found");
    if (application.status !== "pending") return fail(409, `This request is already ${application.status}.`);
    if (application.employeeId === actor.id) return fail(409, "You can't decide your own leave request.");
    return fail(409, "This request is waiting for another approver.");
  }
  if (application.currentLevel !== input.expectedLevel) return fail(409, MOVED_ON);

  const next = nextState(application, input.action);
  const action = input.action === "approve" ? "approved" : "rejected";

  if (!next.finalApproval) {
    // Level 1 approval of a two-level route, or a rejection: one statement.
    const result = await db.execute(sql`WITH moved AS (
        UPDATE leave_applications
        SET status = ${next.status}::leave_application_status,
            current_level = ${next.currentLevel}::int,
            decided_at = CASE WHEN ${next.status} = 'pending' THEN decided_at ELSE now() END,
            updated_at = now()
        WHERE id = ${application.id}::uuid AND status = 'pending' AND current_level = ${input.expectedLevel}::int
        RETURNING id
      )
      INSERT INTO approval_actions (application_id, approver_id, level, action, remarks)
      SELECT moved.id, ${actor.id}::uuid, ${input.expectedLevel}::int, ${action}::approval_action, ${input.remarks}
      FROM moved
      RETURNING application_id`);
    if (result.rows.length === 0) return fail(409, MOVED_ON);
    return { ok: true, status: next.status, currentLevel: next.currentLevel };
  }

  // Final approval: the balance is used now.
  const policies = await loadLeavePolicies();
  const policy = policies.find((p) => p.leaveTypeId === application.leaveTypeId);
  if (!policy) return fail(409, "This leave type has no policy.");
  await ensureEntitlements(application.employeeId, today, policies);
  const employee = { id: application.employeeId, joinDate: application.joinDate };

  return runLocked(application.employeeId, async (tx) => {
    const dates = (
      await tx
        .select({ date: leaveApplicationDays.date })
        .from(leaveApplicationDays)
        .where(eq(leaveApplicationDays.applicationId, application.id))
    ).map((row) => row.date);
    const periods = periodsOf(policy.code, employee.joinDate, dates);
    const balance =
      periods.length === 1
        ? await periodBalance(tx, { employee, policy, period: periods[0], today, excludeApplicationId: application.id })
        : null;
    const clashes = await bookedOn(tx, employee.id, dates, application.id);
    const issues = finalApprovalIssues({
      leaveType: policy.code,
      employeeName: application.employeeName,
      requestedDays: Number(application.totalDays),
      available: balance?.available ?? null,
      clashingDates: clashes.map((day) => day.date),
    });
    if (issues.length > 0) return fail(409, issues.join(" "));

    const updated = await tx
      .update(leaveApplications)
      .set({ status: "approved", decidedAt: new Date() })
      .where(
        and(
          eq(leaveApplications.id, application.id),
          eq(leaveApplications.status, "pending"),
          eq(leaveApplications.currentLevel, input.expectedLevel),
        ),
      )
      .returning({ id: leaveApplications.id });
    if (updated.length === 0) return fail(409, MOVED_ON);

    await tx.insert(approvalActions).values({
      applicationId: application.id,
      approverId: actor.id,
      level: input.expectedLevel,
      action: "approved",
      remarks: input.remarks,
    });
    await applyCarryForwardCorrection(tx, { employee, policy, dates, event: "approval", actorId: actor.id });
    return { ok: true, status: "approved", currentLevel: next.currentLevel };
  });
}

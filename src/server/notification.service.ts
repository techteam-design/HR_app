import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { after } from "next/server";

import { getDb } from "@/db";
import {
  approvalActions,
  approvalOverrides,
  approvalReassignments,
  emailLog,
  employees,
  leaveApplications,
  leaveTypes,
} from "@/db/schema";
import { appUrl, emailConfig, resolveDelivery, type EmailEnv } from "@/lib/email/config";
import { sendViaResend } from "@/lib/email/resend";
import { renderEmail, type EmailContent } from "@/lib/email/templates/layout";
import {
  approvedEmail,
  cancelledEmail,
  level1ApprovedEmail,
  level2PendingEmail,
  reassignedEmail,
  rejectedEmail,
  requestSubmittedEmail,
  revokedEmail,
  submittedOnBehalfEmail,
  testEmail,
  type LeaveFacts,
} from "@/lib/email/templates/leave";
import { toClock } from "@/lib/leave-engine/half-day";

// Email notifications (Resend over plain fetch). Rules:
// - Services call notifyAfterCommit() only AFTER their write has committed
//   (never inside withEmployeeLock or a batch). It runs after the response
//   (Next after(), which OpenNext maps to the Worker's ctx.waitUntil).
// - An email problem never fails the user's action: everything is caught
//   and logged ("event":"email").
// - Idempotent: each email claims its email_log row (unique dedupe_key)
//   before sending, so the same event is never emailed twice.
// - Recipients who are inactive, have no email, or can't be reached under
//   the current settings are logged as skipped.
// - Who gets what: recipientsFor... in notify() below; the admin is not
//   copied on requests (add a recipient there to change that).

export type EmailEvent = (typeof emailLog.event.enumValues)[number];

export type Person = { id: string; name: string; email: string; status: "active" | "inactive" | "probation" };

export type DeliverOutcome = {
  status: "sent" | "failed" | "skipped" | "duplicate";
  reason?: string;
  deliveredTo?: string;
};

function logEmail(details: Record<string, unknown>): void {
  console.log(JSON.stringify({ event: "email", ...details }));
}

// Runs `task` after the response. Outside a request (scripts, tests) it
// just runs in the background. Errors are logged, never thrown.
export function afterCommit(task: () => Promise<unknown>): void {
  const run = async () => {
    try {
      await task();
    } catch (error) {
      logEmail({ status: "error", error: error instanceof Error ? error.message : String(error) });
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
}

// Sends one email to one person through the full path: checks, claim,
// send, record.
export async function deliver({
  event,
  dedupeKey,
  applicationId,
  recipient,
  content,
}: {
  event: EmailEvent;
  dedupeKey: string;
  applicationId: string | null;
  recipient: Person;
  content: EmailContent;
}): Promise<DeliverOutcome> {
  const db = getDb();
  const base = {
    event,
    dedupeKey,
    applicationId,
    recipientId: recipient.id,
    intendedEmail: recipient.email || null,
    subject: content.subject,
  };
  const skip = async (reason: string): Promise<DeliverOutcome> => {
    await db
      .insert(emailLog)
      .values({ ...base, status: "skipped", error: reason })
      .onConflictDoNothing({ target: emailLog.dedupeKey });
    logEmail({ type: event, status: "skipped", dedupeKey, reason });
    return { status: "skipped", reason };
  };

  if (recipient.status === "inactive") return skip("The recipient is inactive.");
  if (!recipient.email) return skip("The recipient has no email address.");
  const config = emailConfig(emailEnv());
  if (!config.ok) return skip(config.reason);
  const delivery = resolveDelivery({ name: recipient.name, email: recipient.email }, config);
  if (!delivery.ok) return skip(delivery.reason);
  const rendered = renderEmail(content, delivery);

  const [claimed] = await db
    .insert(emailLog)
    .values({ ...base, subject: rendered.subject, deliveredTo: delivery.to, status: "pending" })
    .onConflictDoNothing({ target: emailLog.dedupeKey })
    .returning({ id: emailLog.id });
  if (!claimed) return { status: "duplicate" };

  const result = await sendViaResend({
    apiKey: config.apiKey,
    from: config.from,
    to: delivery.to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    idempotencyKey: dedupeKey,
  });
  await db
    .update(emailLog)
    .set(
      result.ok
        ? { status: "sent", providerMessageId: result.id, sentAt: new Date() }
        : { status: "failed", error: result.error },
    )
    .where(eq(emailLog.id, claimed.id));
  logEmail({ type: event, status: result.ok ? "sent" : "failed", dedupeKey, ...(result.ok ? {} : { error: result.error }) });
  return result.ok ? { status: "sent", deliveredTo: delivery.to } : { status: "failed", reason: result.error };
}

// The email variables (Worker secrets on Cloudflare, .env.local locally).
function emailEnv(): EmailEnv {
  const env = process.env;
  return {
    APP_ENV: env.APP_ENV,
    EMAIL_ENABLED: env.EMAIL_ENABLED,
    EMAIL_DEV_REDIRECT: env.EMAIL_DEV_REDIRECT,
    EMAIL_FROM: env.EMAIL_FROM,
    RESEND_API_KEY: env.RESEND_API_KEY,
    BETTER_AUTH_URL: env.BETTER_AUTH_URL,
  };
}

// Links in emails.
export function linkTo(path: string): string {
  const origin = process.env.BETTER_AUTH_URL ?? "";
  return appUrl(origin, path);
}

const APPROVALS = "/approvals";
const HISTORY = "/leave/history";

// ---------------------------------------------------------------------------
// What one request's emails need
// ---------------------------------------------------------------------------

type ApplicationContext = {
  id: string;
  status: string;
  currentLevel: number;
  approvalMode: "single" | "two_level";
  facts: LeaveFacts;
  employee: Person;
  level1: Person;
  level2: Person | null;
  submittedByName: string | null;
  cancelledByName: string | null;
  cancellationNote: string | null;
  actions: { level: number; action: "approved" | "rejected"; remarks: string | null; approverName: string }[];
  overrides: { kind: "approval_revoked" | "rejection_overridden"; reason: string; adminName: string }[];
};

async function loadApplication(applicationId: string): Promise<ApplicationContext | null> {
  const db = getDb();
  const applicant = alias(employees, "applicant");
  const level1 = alias(employees, "level1_approver");
  const level2 = alias(employees, "level2_approver");
  const submitter = alias(employees, "submitter");
  const canceller = alias(employees, "canceller");
  const actor = alias(employees, "actor");
  const admin = alias(employees, "override_admin");
  const [rows, actionRows, overrideRows] = await db.batch([
    db
      .select({
        id: leaveApplications.id,
        status: leaveApplications.status,
        currentLevel: leaveApplications.currentLevel,
        approvalMode: leaveApplications.approvalMode,
        code: leaveTypes.code,
        startDate: leaveApplications.startDate,
        endDate: leaveApplications.endDate,
        totalDays: leaveApplications.totalDays,
        isHalfDay: leaveApplications.isHalfDay,
        halfDaySlot: leaveApplications.halfDaySlot,
        halfDayStart: leaveApplications.halfDayStart,
        halfDayEnd: leaveApplications.halfDayEnd,
        reason: leaveApplications.reason,
        cancellationNote: leaveApplications.cancellationNote,
        employeeId: applicant.id,
        employeeName: applicant.fullName,
        employeeEmail: applicant.email,
        employeeStatus: applicant.status,
        level1Id: level1.id,
        level1Name: level1.fullName,
        level1Email: level1.email,
        level1Status: level1.status,
        level2Id: level2.id,
        level2Name: level2.fullName,
        level2Email: level2.email,
        level2Status: level2.status,
        submittedByName: submitter.fullName,
        cancelledByName: canceller.fullName,
      })
      .from(leaveApplications)
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveApplications.leaveTypeId))
      .innerJoin(applicant, eq(applicant.id, leaveApplications.employeeId))
      .innerJoin(level1, eq(level1.id, leaveApplications.level1ApproverId))
      .leftJoin(level2, eq(level2.id, leaveApplications.level2ApproverId))
      .leftJoin(submitter, eq(submitter.id, leaveApplications.submittedBy))
      .leftJoin(canceller, eq(canceller.id, leaveApplications.cancelledBy))
      .where(eq(leaveApplications.id, applicationId))
      .limit(1),
    db
      .select({
        level: approvalActions.level,
        action: approvalActions.action,
        remarks: approvalActions.remarks,
        approverName: actor.fullName,
      })
      .from(approvalActions)
      .innerJoin(actor, eq(actor.id, approvalActions.approverId))
      .where(eq(approvalActions.applicationId, applicationId))
      .orderBy(asc(approvalActions.actedAt)),
    db
      .select({ kind: approvalOverrides.kind, reason: approvalOverrides.reason, adminName: admin.fullName })
      .from(approvalOverrides)
      .innerJoin(admin, eq(admin.id, approvalOverrides.adminId))
      .where(eq(approvalOverrides.applicationId, applicationId))
      .orderBy(desc(approvalOverrides.actedAt)),
  ]);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    currentLevel: row.currentLevel,
    approvalMode: row.approvalMode,
    facts: {
      employeeName: row.employeeName,
      code: row.code,
      startDate: row.startDate,
      endDate: row.endDate,
      totalDays: Number(row.totalDays),
      isHalfDay: row.isHalfDay,
      halfDaySlot: row.halfDaySlot,
      halfDayStart: row.halfDayStart ? toClock(row.halfDayStart) : null,
      halfDayEnd: row.halfDayEnd ? toClock(row.halfDayEnd) : null,
      reason: row.reason,
    },
    employee: { id: row.employeeId, name: row.employeeName, email: row.employeeEmail, status: row.employeeStatus },
    level1: { id: row.level1Id, name: row.level1Name, email: row.level1Email, status: row.level1Status },
    level2:
      row.level2Id && row.level2Name && row.level2Email && row.level2Status
        ? { id: row.level2Id, name: row.level2Name, email: row.level2Email, status: row.level2Status }
        : null,
    submittedByName: row.submittedByName,
    cancelledByName: row.cancelledByName,
    cancellationNote: row.cancellationNote,
    actions: actionRows,
    overrides: overrideRows,
  };
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type NotifyEvent =
  // 1 (+10 on behalf): a new request.
  | { kind: "submitted"; applicationId: string; onBehalf: boolean }
  // 2 + 5: level 1 approved on a two-level route.
  | { kind: "level1_approved"; applicationId: string }
  // 7
  | { kind: "rejected"; applicationId: string }
  // 6: final approval by the approver (or an admin in their place).
  | { kind: "approved"; applicationId: string }
  // 6: the admin's "Approve anyway".
  | { kind: "approved_anyway"; applicationId: string }
  // 9
  | { kind: "revoked"; applicationId: string }
  // 8: approved leave cancelled by an approver or the admin, or a pending
  // request cancelled by the admin. Never when staff cancel their own.
  | { kind: "cancelled"; applicationId: string; wasApproved: boolean }
  // 3: requests moved by a route change made by `actorId` since `since`.
  | { kind: "reassigned"; actorId: string; since: Date };

// Queues the emails for an event, after the response. Call only once the
// change has committed.
export function notifyAfterCommit(event: NotifyEvent): void {
  afterCommit(() => notify(event));
}

const key = (event: EmailEvent, applicationId: string, recipientId: string) => `${event}:${applicationId}:${recipientId}`;

export async function notify(event: NotifyEvent): Promise<DeliverOutcome[]> {
  if (event.kind === "reassigned") return notifyReassigned(event.actorId, event.since);

  const app = await loadApplication(event.applicationId);
  if (!app) return [];
  const { facts, employee } = app;
  const approvals = linkTo(APPROVALS);
  const history = linkTo(HISTORY);
  const outcomes: DeliverOutcome[] = [];
  const send = async (emailEvent: EmailEvent, recipient: Person, content: EmailContent) => {
    outcomes.push(
      await deliver({ event: emailEvent, dedupeKey: key(emailEvent, app.id, recipient.id), applicationId: app.id, recipient, content }),
    );
  };
  const lastAction = (action: "approved" | "rejected") => app.actions.filter((a) => a.action === action).at(-1) ?? null;

  switch (event.kind) {
    case "submitted": {
      const twoLevel = app.approvalMode === "two_level";
      await send(
        "request_submitted",
        app.level1,
        requestSubmittedEmail(facts, {
          levelText: twoLevel ? "level 1" : null,
          submittedByName: event.onBehalf ? app.submittedByName : null,
          url: approvals,
        }),
      );
      if (event.onBehalf) {
        await send(
          "request_submitted_on_behalf",
          employee,
          submittedOnBehalfEmail(facts, { adminName: app.submittedByName ?? "HR", approverName: app.level1.name, url: history }),
        );
      }
      break;
    }
    case "level1_approved": {
      const action = app.actions.find((a) => a.level === 1 && a.action === "approved");
      if (!action || !app.level2) break;
      await send(
        "level2_pending",
        app.level2,
        level2PendingEmail(facts, { level1ApproverName: action.approverName, remarks: action.remarks, url: approvals }),
      );
      await send(
        "level1_approved",
        employee,
        level1ApprovedEmail(facts, {
          approverName: action.approverName,
          remarks: action.remarks,
          nextApproverName: app.level2.name,
          url: history,
        }),
      );
      break;
    }
    case "rejected": {
      const action = lastAction("rejected");
      if (!action) break;
      await send(
        "request_rejected",
        employee,
        rejectedEmail(facts, { approverName: action.approverName, remarks: action.remarks, url: history }),
      );
      break;
    }
    case "approved": {
      const action = lastAction("approved");
      if (!action) break;
      await send(
        "request_approved",
        employee,
        approvedEmail(facts, { approverName: action.approverName, remarks: action.remarks, override: null, url: history }),
      );
      break;
    }
    case "approved_anyway": {
      const override = app.overrides.find((o) => o.kind === "rejection_overridden");
      if (!override) break;
      await send(
        "request_approved",
        employee,
        approvedEmail(facts, {
          approverName: override.adminName,
          remarks: null,
          override: { adminName: override.adminName, reason: override.reason },
          url: history,
        }),
      );
      break;
    }
    case "revoked": {
      const override = app.overrides.find((o) => o.kind === "approval_revoked");
      if (!override) break;
      await send(
        "approval_revoked",
        employee,
        revokedEmail(facts, { adminName: override.adminName, reason: override.reason, url: history }),
      );
      break;
    }
    case "cancelled": {
      await send(
        "leave_cancelled",
        employee,
        cancelledEmail(facts, {
          cancelledByName: app.cancelledByName ?? "HR",
          note: app.cancellationNote,
          wasApproved: event.wasApproved,
          url: history,
        }),
      );
      break;
    }
  }
  return outcomes;
}

// Reassignments written by this actor's change (rows since `since`): the
// new approver of each request's CURRENT level is told, once per
// reassignment row. Levels removed (no new approver) send nothing.
async function notifyReassigned(actorId: string, since: Date): Promise<DeliverOutcome[]> {
  const rows = await getDb()
    .select({
      id: approvalReassignments.id,
      applicationId: approvalReassignments.applicationId,
      level: approvalReassignments.level,
      toApproverId: approvalReassignments.toApproverId,
    })
    .from(approvalReassignments)
    .where(and(eq(approvalReassignments.changedBy, actorId), gte(approvalReassignments.createdAt, since)))
    .orderBy(asc(approvalReassignments.createdAt));
  const outcomes: DeliverOutcome[] = [];
  const ids = [...new Set(rows.map((row) => row.applicationId))];
  for (const applicationId of ids) {
    const app = await loadApplication(applicationId);
    if (!app || app.status !== "pending") continue;
    const current = app.currentLevel === 2 && app.level2 ? app.level2 : app.level1;
    // The latest move at the current level, if it went to today's approver.
    const row = rows.filter((r) => r.applicationId === applicationId && r.level === app.currentLevel).at(-1);
    if (!row || row.toApproverId !== current.id) continue;
    outcomes.push(
      await deliver({
        event: "request_reassigned",
        dedupeKey: `request_reassigned:${row.id}`,
        applicationId,
        recipient: current,
        content: reassignedEmail(app.facts, { url: linkTo(APPROVALS) }),
      }),
    );
  }
  return outcomes;
}

// Reassignment rows are stamped by the database clock; start the window a
// little earlier so clock differences never miss a row (the dedupe key
// stops anything being sent twice).
export function reassignmentWindowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - 60_000);
}

// For the reminder job and the test email.
export async function loadPeople(ids: string[]): Promise<Map<string, Person>> {
  if (ids.length === 0) return new Map();
  const rows = await getDb()
    .select({ id: employees.id, name: employees.fullName, email: employees.email, status: employees.status })
    .from(employees)
    .where(inArray(employees.id, ids));
  return new Map(rows.map((row) => [row.id, row]));
}

// The admin's "Send test email" (Approval setup): one sample email to the
// admin through the full path (settings, dev redirect, log, provider).
// Awaited, so the page can show what happened.
export async function sendTestEmail(actor: { id: string }): Promise<DeliverOutcome> {
  const person = (await loadPeople([actor.id])).get(actor.id);
  if (!person) return { status: "skipped", reason: "Your employee record was not found." };
  return deliver({
    event: "test_email",
    dedupeKey: `test_email:${actor.id}:${Date.now()}`,
    applicationId: null,
    recipient: person,
    content: testEmail({ name: person.name, url: linkTo("/dashboard") }),
  });
}

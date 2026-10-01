import { eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/db";
import { approvalSettings, employees, leaveApplications, leaveTypes } from "@/db/schema";
import { dueReminders, reminderThreshold } from "@/lib/approvals/reminders";
import { reminderEmail } from "@/lib/email/templates/leave";
import { toClock } from "@/lib/leave-engine/half-day";
import type { IsoDate } from "@/lib/leave-engine/iso-date";
import { todayIsoInBrunei } from "@/lib/utils/dates";

import { deliver, linkTo, loadPeople, type DeliverOutcome } from "./notification.service";

// Daily approver reminders (cron, 09:00 Brunei; /api/cron/reminders). One
// digest per approver per day listing every request that has waited at
// least N days at its current level (approval_settings.reminder_after_days;
// 0 = off). Rules: src/lib/approvals/reminders.ts. Idempotent: the digest's
// dedupe key is "approval_reminder:{approverId}:{today}", so a second run on
// the same day sends nothing.

export const DEFAULT_REMINDER_AFTER_DAYS = 2;

export async function reminderAfterDays(): Promise<number> {
  const [row] = await getDb()
    .select({ days: approvalSettings.reminderAfterDays })
    .from(approvalSettings)
    .where(eq(approvalSettings.id, 1))
    .limit(1);
  return row?.days ?? DEFAULT_REMINDER_AFTER_DAYS;
}

// Approval setup page (admin). Upserts the single settings row.
export async function saveReminderAfterDays(actor: { id: string }, days: number): Promise<void> {
  await getDb()
    .insert(approvalSettings)
    .values({ id: 1, reminderAfterDays: days, updatedBy: actor.id })
    .onConflictDoUpdate({
      target: approvalSettings.id,
      set: { reminderAfterDays: days, updatedBy: actor.id, updatedAt: new Date() },
    });
}

export type ReminderRun = {
  // The setting (0 = off).
  afterDays: number;
  // The testing override (?minDays=, non-production only), or null.
  minDays: number | null;
  approvers: number;
  requests: number;
} & Record<DeliverOutcome["status"], number>;

// `minDaysOverride` (testing only; the route refuses it in production)
// replaces the setting for this run and uses its own dedupe key, so a test
// run never uses up the real 09:00 digest.
export async function sendApprovalReminders(today: IsoDate, minDaysOverride: number | null = null): Promise<ReminderRun> {
  const afterDays = await reminderAfterDays();
  const run: ReminderRun = {
    afterDays,
    minDays: minDaysOverride,
    approvers: 0,
    requests: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    duplicate: 0,
  };
  const threshold = reminderThreshold(afterDays, minDaysOverride);
  if (threshold === null) return run;

  const applicant = alias(employees, "applicant");
  const rows = await getDb()
    .select({
      id: leaveApplications.id,
      currentLevel: leaveApplications.currentLevel,
      level1ApproverId: leaveApplications.level1ApproverId,
      level2ApproverId: leaveApplications.level2ApproverId,
      submittedAt: leaveApplications.submittedAt,
      level1ApprovedAt: sql<Date | null>`(SELECT max(aa.acted_at) FROM approval_actions aa
        WHERE aa.application_id = ${leaveApplications.id} AND aa.level = 1 AND aa.action = 'approved')`.mapWith(
        (value) => (value ? new Date(value) : null),
      ),
      reassignedAt: sql<Date | null>`(SELECT max(r.created_at) FROM approval_reassignments r
        WHERE r.application_id = ${leaveApplications.id} AND r.level = ${leaveApplications.currentLevel})`.mapWith(
        (value) => (value ? new Date(value) : null),
      ),
      employeeName: applicant.fullName,
      code: leaveTypes.code,
      startDate: leaveApplications.startDate,
      endDate: leaveApplications.endDate,
      totalDays: leaveApplications.totalDays,
      isHalfDay: leaveApplications.isHalfDay,
      halfDaySlot: leaveApplications.halfDaySlot,
      halfDayStart: leaveApplications.halfDayStart,
      halfDayEnd: leaveApplications.halfDayEnd,
    })
    .from(leaveApplications)
    .innerJoin(applicant, eq(applicant.id, leaveApplications.employeeId))
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveApplications.leaveTypeId))
    .where(eq(leaveApplications.status, "pending"));

  const waiting = rows.map((row) => ({
    ...row,
    approverId: row.currentLevel === 2 && row.level2ApproverId ? row.level2ApproverId : row.level1ApproverId,
  }));
  const due = dueReminders(waiting, today, threshold, (time) => todayIsoInBrunei(time));
  const keySuffix = minDaysOverride === null ? "" : `:min${minDaysOverride}`;
  const people = await loadPeople([...due.keys()]);
  const url = linkTo("/approvals");

  for (const [approverId, requests] of due) {
    const approver = people.get(approverId);
    if (!approver) continue;
    run.approvers += 1;
    run.requests += requests.length;
    const outcome = await deliver({
      event: "approval_reminder",
      dedupeKey: `approval_reminder:${approverId}:${today}${keySuffix}`,
      applicationId: null,
      recipient: approver,
      content: reminderEmail(
        requests.map((request) => ({
          employeeName: request.employeeName,
          code: request.code,
          startDate: request.startDate,
          endDate: request.endDate,
          totalDays: Number(request.totalDays),
          isHalfDay: request.isHalfDay,
          halfDaySlot: request.halfDaySlot,
          halfDayStart: request.halfDayStart ? toClock(request.halfDayStart) : null,
          halfDayEnd: request.halfDayEnd ? toClock(request.halfDayEnd) : null,
          reason: null,
          waitingDays: request.waitingDays,
        })),
        { url },
      ),
    });
    run[outcome.status] += 1;
    if (outcome.status === "sent") {
      await getDb()
        .update(leaveApplications)
        .set({ lastReminderSentAt: new Date() })
        .where(
          inArray(
            leaveApplications.id,
            requests.map((request) => request.id),
          ),
        );
    }
  }
  return run;
}

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { employees, halfDaySettings } from "@/db/schema";
import type { Reader } from "@/db/transaction";
import { DEFAULT_HALF_DAY_TIMINGS, halfDayTimingIssues, toClock, type HalfDayTimings } from "@/lib/leave-engine/half-day";
import { timingField, timingsFromInput, type HalfDayTimingsInput } from "@/validations/leave";

import { fail, type ServiceResult } from "./service-result";

// Half-day slot times (half_day_settings, one row). Admin edits them on the
// Leave policies page; hr_viewer sees them read-only. Submissions copy the
// slot's times onto the application, so changes never rewrite history.

export type HalfDayTimingSettings = {
  timings: HalfDayTimings;
  // Only edits made in the app record who made them (null: the defaults).
  updatedAt: Date | null;
  updatedByName: string | null;
};

// The configured timings. The row is inserted by migration 0004 and the
// config seed; without it the defaults apply.
export async function loadHalfDayTimings(reader: Reader = getDb()): Promise<HalfDayTimingSettings> {
  const [row] = await reader
    .select({
      localMorningStart: halfDaySettings.localMorningStart,
      localMorningEnd: halfDaySettings.localMorningEnd,
      localAfternoonStart: halfDaySettings.localAfternoonStart,
      localAfternoonEnd: halfDaySettings.localAfternoonEnd,
      foreignMorningStart: halfDaySettings.foreignMorningStart,
      foreignMorningEnd: halfDaySettings.foreignMorningEnd,
      foreignAfternoonStart: halfDaySettings.foreignAfternoonStart,
      foreignAfternoonEnd: halfDaySettings.foreignAfternoonEnd,
      updatedAt: halfDaySettings.updatedAt,
      updatedBy: halfDaySettings.updatedBy,
      updatedByName: employees.fullName,
    })
    .from(halfDaySettings)
    .leftJoin(employees, eq(employees.id, halfDaySettings.updatedBy))
    .where(eq(halfDaySettings.id, 1))
    .limit(1);
  if (!row) return { timings: DEFAULT_HALF_DAY_TIMINGS, updatedAt: null, updatedByName: null };
  return {
    timings: timingsFromInput({
      localMorningStart: toClock(row.localMorningStart),
      localMorningEnd: toClock(row.localMorningEnd),
      localAfternoonStart: toClock(row.localAfternoonStart),
      localAfternoonEnd: toClock(row.localAfternoonEnd),
      foreignMorningStart: toClock(row.foreignMorningStart),
      foreignMorningEnd: toClock(row.foreignMorningEnd),
      foreignAfternoonStart: toClock(row.foreignAfternoonStart),
      foreignAfternoonEnd: toClock(row.foreignAfternoonEnd),
    }),
    updatedAt: row.updatedBy ? row.updatedAt : null,
    updatedByName: row.updatedByName,
  };
}

// Saves all four slots. Existing applications keep the times they were
// booked with.
export async function updateHalfDayTimings(actor: { id: string }, input: HalfDayTimingsInput): Promise<ServiceResult> {
  const issues = halfDayTimingIssues(timingsFromInput(input));
  if (issues.length > 0) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) fieldErrors[timingField(issue.path)] ??= issue.message;
    return fail(400, "Please check the highlighted fields.", { fieldErrors });
  }
  await getDb()
    .insert(halfDaySettings)
    .values({ id: 1, ...input, updatedBy: actor.id })
    .onConflictDoUpdate({ target: halfDaySettings.id, set: { ...input, updatedBy: actor.id, updatedAt: new Date() } });
  return { ok: true };
}

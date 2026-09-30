// DEV ONLY: checks the concurrency fix against the real dev database.
// Refuses to run unless ALLOW_DEV_SEED is exactly "true". Run it after
// npm run db:reset:dev (it uses the seeded Priya Nair and Daniel Tan).
//
// 1. Submission race: two annual leave requests for Priya, sent at the same
//    time, each fitting her balance alone but not together. Expect exactly
//    one to be accepted (the locked re-check refuses the other).
// 2. Double approval: Daniel approves the accepted request twice at the
//    same time. Expect exactly one success and one "already approved /
//    changed" refusal.
// Afterwards the approved request is cancelled by the admin, so the dev
// balances are unchanged (the rows stay as history).
//
// Run: npm run db:race-check

import { config } from "dotenv";
import { eq } from "drizzle-orm";

import { addDays } from "../lib/leave-engine/iso-date";
import { todayIsoInBrunei } from "../lib/utils/dates";
import { decideApplication } from "../server/approval.service";
import { cancelApplication, submitApplication } from "../server/leave-application.service";
import { getEmployeeBalances } from "../server/leave-balance.service";

import { getDb } from "./index";
import { employees } from "./schema";
import { printTarget, requireEnv, runSeed } from "./seed-helpers";

config({ path: ".env.local", quiet: true });

const SCRIPT = "race-check";

async function employeeByCode(code: string) {
  const [row] = await getDb()
    .select({ id: employees.id, role: employees.role })
    .from(employees)
    .where(eq(employees.employeeCode, code));
  if (!row) throw new Error(`Employee ${code} not found. Run npm run db:reset:dev first.`);
  return row;
}

function datesFrom(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}

async function main() {
  if (process.env.ALLOW_DEV_SEED !== "true") {
    throw new Error('Refusing to run: ALLOW_DEV_SEED is not "true". Dev database only.');
  }
  printTarget(SCRIPT);
  requireEnv("DATABASE_URL");

  const today = todayIsoInBrunei();
  const priya = await employeeByCode("DEV-004");
  const daniel = await employeeByCode("DEV-003");
  const [admin] = await getDb().select({ id: employees.id }).from(employees).where(eq(employees.role, "admin"));

  const balances = await getEmployeeBalances(priya.id, today);
  const available = balances?.types.find((t) => t.code === "annual")?.balance?.availableAfterPending ?? 0;
  const days = Math.floor(available / 2) + 1;
  if (days < 1 || days > available) throw new Error(`Priya's annual balance (${available}) is too low for this check.`);
  console.log(`[${SCRIPT}] Priya has ${available} annual days; sending two requests of ${days} days each.`);

  const request = (start: string) => {
    const dates = datesFrom(start, days);
    return submitApplication(
      priya.id,
      {
        leaveType: "annual",
        startDate: dates[0],
        endDate: dates[dates.length - 1],
        dayType: "full",
        halfDaySlot: null,
        dates,
        reason: "race-check",
      },
      today,
      { onBehalf: false },
    );
  };
  const submissions = await Promise.all([request(addDays(today, 20)), request(addDays(today, 60))]);
  const accepted = submissions.filter((result) => result.ok);
  console.log(`[${SCRIPT}] Submissions:`, submissions.map((r) => (r.ok ? "accepted" : `refused: ${r.error}`)));
  if (accepted.length !== 1) throw new Error(`Expected exactly 1 accepted submission, got ${accepted.length}.`);
  const id = (accepted[0] as { id: string }).id;

  const decide = () =>
    decideApplication({ id: daniel.id, role: daniel.role }, id, { action: "approve", remarks: null, expectedLevel: 1 }, today);
  const decisions = await Promise.all([decide(), decide()]);
  console.log(`[${SCRIPT}] Decisions:`, decisions.map((r) => (r.ok ? `ok (${r.status})` : `refused: ${r.error}`)));
  if (decisions.filter((result) => result.ok).length !== 1) throw new Error("Expected exactly 1 successful approval.");

  const cleanup = await cancelApplication({ id: admin.id, role: "admin" }, id, { note: "race-check cleanup" });
  if (!cleanup.ok) throw new Error(`Cleanup failed: ${cleanup.error}`);
  console.log(`[${SCRIPT}] PASSED. The test request was cancelled; balances are back to ${available}.\n`);
}

runSeed(SCRIPT, main);

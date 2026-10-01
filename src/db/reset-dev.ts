// Wipes ALL data on the DEV Neon branch and reseeds the small dev dataset.
// NEVER run against production. The schema and migrations are kept.
//
// Guards: ALLOW_DEV_SEED must be exactly "true", NODE_ENV must not be
// "production", and you must type RESET DEV after checking the host.
// Staging uses the same dev database, so this also resets staging.
//
// Steps:
//   1. Delete every row of app data (including leave types and policies, so
//      the dev policies go back to the defaults) and every Better Auth user,
//      session, account and verification row, in one transaction.
//   2. npm run db:seed          leave types and default policies (MC rounds
//                               up); db:seed itself is insert-only
//   3. npm run db:seed:admin    the admin login (SEED_ADMIN_*)
//   4. npm run db:seed:dev      the dev team, routes and opening balance
//   5. npm run db:entitlements  current-period entitlement rows
// Idempotent: every run ends with the same data (dates relative to today).
//
// Run: npm run db:reset:dev

import { execSync } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

import { config } from "dotenv";

import { getDb } from "./index";
import {
  account,
  approvalActions,
  approvalOverrides,
  approvalReassignments,
  approvalRouteOverrides,
  approvalSettings,
  branchApprovalRoutes,
  branches,
  departments,
  employees,
  halfDaySettings,
  leaveAdjustments,
  leaveApplicationDays,
  leaveApplications,
  leaveEntitlements,
  leavePolicies,
  leaveTypes,
  session,
  user,
  verification,
} from "./schema";
import { databaseHost, runSeed } from "./seed-helpers";

// getDb() is lazy, so loading env here (after imports) is early enough.
config({ path: ".env.local", quiet: true });

const SCRIPT = "reset-dev";
const CONFIRMATION = "RESET DEV";
const RESEED_STEPS = ["db:seed", "db:seed:admin", "db:seed:dev", "db:entitlements"] as const;

async function confirm(host: string): Promise<boolean> {
  const prompt = createInterface({ input, output });
  try {
    const answer = await prompt.question(
      `[${SCRIPT}] This deletes ALL data (employees, leave, logins) on ${host}.\n` +
        `[${SCRIPT}] Type ${CONFIRMATION} to continue: `,
    );
    return answer.trim() === CONFIRMATION;
  } finally {
    prompt.close();
  }
}

// Children before parents; one db.batch, so all or nothing.
async function deleteAllData(): Promise<void> {
  const db = getDb();
  await db.batch([
    db.delete(approvalReassignments),
    db.delete(approvalOverrides),
    db.delete(approvalActions),
    db.delete(leaveApplicationDays),
    db.delete(leaveApplications),
    db.delete(leaveAdjustments),
    db.delete(leaveEntitlements),
    // Dev only: removes any policy edits so db:seed re-inserts the defaults.
    db.delete(leavePolicies),
    db.delete(leaveTypes),
    db.delete(approvalRouteOverrides),
    db.delete(branchApprovalRoutes),
    db.delete(approvalSettings),
    // Dev only: removes any timing edits (updated_by points at an employee);
    // db:seed re-inserts the default row.
    db.delete(halfDaySettings),
    // reporting_manager_id is ON DELETE RESTRICT, checked row by row.
    db.update(employees).set({ reportingManagerId: null }),
    db.delete(employees),
    db.delete(departments),
    db.delete(branches),
    db.delete(session),
    db.delete(account),
    db.delete(verification),
    db.delete(user),
  ]);
}

async function main() {
  if (process.env.ALLOW_DEV_SEED !== "true") {
    throw new Error('Refusing to run: ALLOW_DEV_SEED is not "true". Set it only for a dev-branch run.');
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run: NODE_ENV is production.");
  }

  const host = databaseHost();
  console.log(`\n[${SCRIPT}] Database host: ${host}`);
  if (!(await confirm(host))) {
    console.log(`[${SCRIPT}] Cancelled. Nothing was deleted.\n`);
    return;
  }

  await deleteAllData();
  console.log(`[${SCRIPT}] All data deleted. Reseeding...\n`);

  for (const step of RESEED_STEPS) {
    console.log(`[${SCRIPT}] npm run ${step}`);
    // Throws (and stops the reset) if a step fails.
    execSync(`npm run ${step}`, { stdio: "inherit" });
  }

  console.log(`\n[${SCRIPT}] Done: dev data reset and reseeded on ${host}.\n`);
}

runSeed(SCRIPT, main);

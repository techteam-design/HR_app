// Runs the daily entitlement job once, for "today" in Asia/Brunei, against
// the database in .env.local. Safe to run any time: it only inserts missing
// rows for the current periods and never changes existing ones.
// Use it to create entitlements for all dev employees now, and for production
// at go-live.
//
// Run: npm run db:entitlements

import { config } from "dotenv";

import { ensureAllEntitlements } from "../server/entitlement.service";

import { printTarget, runSeed } from "./seed-helpers";

// getDb() is lazy, so loading env here (after imports) is early enough.
config({ path: ".env.local", quiet: true });

const SCRIPT = "entitlements";

async function main() {
  printTarget(SCRIPT);

  const counts = await ensureAllEntitlements();

  console.log(`[${SCRIPT}] Date (Asia/Brunei): ${counts.onDate}`);
  console.log(`[${SCRIPT}] Employees checked:     ${counts.employeesChecked}`);
  console.log(`[${SCRIPT}] Employees skipped:     ${counts.employeesSkipped} (inactive or not started yet)`);
  console.log(`[${SCRIPT}] Entitlements created:  ${counts.created}`);
  console.log(`[${SCRIPT}] Already existed:       ${counts.alreadyExisted}\n`);
}

runSeed(SCRIPT, main);

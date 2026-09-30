// Config seed: leave types and their policies. Safe for production.
// Insert-only and idempotent: a leave type or policy that already exists is
// NEVER changed, because the client edits policies on the Leave policies
// page. The values below are only the defaults for rows that are missing.
// (npm run db:reset:dev deletes the dev rows first, so dev gets these
// defaults again.)
//
// Run: npm run db:seed

import { config } from "dotenv";
import { eq } from "drizzle-orm";

import { getDb } from "./index";
import { leavePolicies, leaveTypes, type EntitlementTable } from "./schema";
import { createSummary, printTarget, runSeed } from "./seed-helpers";

// getDb() is lazy, so loading env here (after imports) is early enough.
config({ path: ".env.local", quiet: true });

const SCRIPT = "seed";

type LeaveTypeSeed = Omit<typeof leaveTypes.$inferInsert, "id" | "createdAt" | "updatedAt">;
type PolicySeed = Omit<
  typeof leavePolicies.$inferInsert,
  "id" | "leaveTypeId" | "updatedBy" | "createdAt" | "updatedAt"
>;

// Year 1 = 7 days, +1 per year, 14 days from year 8 onward.
const ANNUAL_ENTITLEMENT_TABLE: EntitlementTable = [
  { serviceYear: 1, days: 7 },
  { serviceYear: 2, days: 8 },
  { serviceYear: 3, days: 9 },
  { serviceYear: 4, days: 10 },
  { serviceYear: 5, days: 11 },
  { serviceYear: 6, days: 12 },
  { serviceYear: 7, days: 13 },
  { serviceYear: 8, days: 14 },
];

// Every policy field is listed explicitly (including nulls).
const SEED: { type: LeaveTypeSeed; policy: PolicySeed }[] = [
  {
    type: {
      code: "annual",
      name: "Annual Leave",
      isPaid: true,
      periodBasis: "anniversary",
    },
    policy: {
      entitlementTable: ANNUAL_ENTITLEMENT_TABLE,
      fixedDays: null,
      eligibilityMonthsLocal: 3,
      eligibilityMonthsForeign: 0,
      advanceNoticeDaysForeign: 14,
      carryForwardEnabled: true,
      carryForwardCap: "3",
      carryForwardExpiryMonths: null,
      prorateOnJoin: false,
      prorateRounding: null,
    },
  },
  {
    type: {
      code: "mc",
      name: "Medical Leave (MC)",
      isPaid: true,
      periodBasis: "calendar",
    },
    policy: {
      entitlementTable: null,
      fixedDays: "14",
      eligibilityMonthsLocal: 1,
      eligibilityMonthsForeign: 1,
      advanceNoticeDaysForeign: 0,
      carryForwardEnabled: false,
      carryForwardCap: null,
      carryForwardExpiryMonths: null,
      prorateOnJoin: true,
      // Client decision: pro-rated MC rounds UP to the nearest half day.
      prorateRounding: "up",
    },
  },
  {
    type: {
      code: "unpaid",
      name: "Unpaid Leave",
      isPaid: false,
      periodBasis: "calendar",
    },
    policy: {
      entitlementTable: null,
      fixedDays: "7",
      eligibilityMonthsLocal: 0,
      eligibilityMonthsForeign: 0,
      advanceNoticeDaysForeign: 0,
      carryForwardEnabled: false,
      carryForwardCap: null,
      carryForwardExpiryMonths: null,
      prorateOnJoin: false,
      prorateRounding: null,
    },
  },
];

async function main() {
  printTarget(SCRIPT);

  const db = getDb();
  const summary = createSummary(SCRIPT);

  for (const { type, policy } of SEED) {
    const [insertedType] = await db
      .insert(leaveTypes)
      .values(type)
      .onConflictDoNothing({ target: leaveTypes.code })
      .returning({ id: leaveTypes.id });
    const [leaveType] = insertedType
      ? [insertedType]
      : await db.select({ id: leaveTypes.id }).from(leaveTypes).where(eq(leaveTypes.code, type.code));
    if (!leaveType) throw new Error(`Leave type "${type.code}" could not be created or found.`);
    (insertedType ? summary.created : summary.existing)(`leave_types: ${type.code}`);

    const [insertedPolicy] = await db
      .insert(leavePolicies)
      .values({ leaveTypeId: leaveType.id, ...policy })
      .onConflictDoNothing({ target: leavePolicies.leaveTypeId })
      .returning({ id: leavePolicies.id });
    (insertedPolicy ? summary.created : summary.existing)(`leave_policies: ${type.code}`);
  }

  summary.print();
}

runSeed(SCRIPT, main);

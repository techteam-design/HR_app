// Config seed: leave types and their policies. Safe for production.
// Idempotent: upserts by leave_types.code and leave_policies.leave_type_id.
// This script is the source of truth for policy defaults: existing rows are
// updated to the values below.
//
// Run: npm run db:seed

import { config } from "dotenv";

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

// Every policy field is listed explicitly (including nulls) so an update
// resets any drift back to these defaults.
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
      // Still pending client confirmation (up, down or nearest).
      prorateRounding: null,
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

  const existingTypeCodes = new Set(
    (await db.select({ code: leaveTypes.code }).from(leaveTypes)).map((r) => r.code),
  );
  const existingPolicyTypeIds = new Set(
    (await db.select({ leaveTypeId: leavePolicies.leaveTypeId }).from(leavePolicies)).map(
      (r) => r.leaveTypeId,
    ),
  );

  for (const { type, policy } of SEED) {
    const [leaveType] = await db
      .insert(leaveTypes)
      .values(type)
      .onConflictDoUpdate({
        target: leaveTypes.code,
        set: {
          name: type.name,
          isPaid: type.isPaid,
          periodBasis: type.periodBasis,
          updatedAt: new Date(),
        },
      })
      .returning({ id: leaveTypes.id });

    if (!leaveType) throw new Error(`Upsert of leave type "${type.code}" returned no row.`);

    if (existingTypeCodes.has(type.code)) {
      summary.updated(`leave_types: ${type.code} (reset to seed values)`);
    } else {
      summary.created(`leave_types: ${type.code}`);
    }

    await db
      .insert(leavePolicies)
      .values({ leaveTypeId: leaveType.id, ...policy })
      .onConflictDoUpdate({
        target: leavePolicies.leaveTypeId,
        set: { ...policy, updatedBy: null, updatedAt: new Date() },
      });

    if (existingPolicyTypeIds.has(leaveType.id)) {
      summary.updated(`leave_policies: ${type.code} (reset to seed values)`);
    } else {
      summary.created(`leave_policies: ${type.code}`);
    }
  }

  summary.print();
}

runSeed(SCRIPT, main);

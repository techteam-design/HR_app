import { asc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { employees, leavePolicies, leaveTypes } from "@/db/schema";
import { LEAVE_TYPE_CODES, type LeaveTypeCode } from "@/lib/leave-engine/constants";
import type { PlanPolicy } from "@/lib/leave-engine/entitlement-plan";
import type { PolicyUpdateInput } from "@/validations/leave";

import { fail, type ServiceResult } from "./service-result";

// A leave type with its policy, day counts converted from numeric strings.
export type LeavePolicy = PlanPolicy & {
  leaveTypeId: string;
  name: string;
  isPaid: boolean;
  periodBasis: "anniversary" | "calendar";
  eligibilityMonthsLocal: number;
  eligibilityMonthsForeign: number;
  advanceNoticeDaysForeign: number;
  updatedAt: Date;
  updatedByName: string | null;
};

const toNumber = (value: string | null) => (value === null ? null : Number(value));

const ORDER: Record<LeaveTypeCode, number> = { annual: 0, mc: 1, unpaid: 2 };

// Every leave type with its policy, in display order (annual, MC, unpaid).
export async function loadLeavePolicies(): Promise<LeavePolicy[]> {
  const rows = await getDb()
    .select({
      leaveTypeId: leaveTypes.id,
      code: leaveTypes.code,
      name: leaveTypes.name,
      isPaid: leaveTypes.isPaid,
      periodBasis: leaveTypes.periodBasis,
      entitlementTable: leavePolicies.entitlementTable,
      fixedDays: leavePolicies.fixedDays,
      eligibilityMonthsLocal: leavePolicies.eligibilityMonthsLocal,
      eligibilityMonthsForeign: leavePolicies.eligibilityMonthsForeign,
      advanceNoticeDaysForeign: leavePolicies.advanceNoticeDaysForeign,
      carryForwardEnabled: leavePolicies.carryForwardEnabled,
      carryForwardCap: leavePolicies.carryForwardCap,
      carryForwardExpiryMonths: leavePolicies.carryForwardExpiryMonths,
      prorateOnJoin: leavePolicies.prorateOnJoin,
      prorateRounding: leavePolicies.prorateRounding,
      updatedAt: leavePolicies.updatedAt,
      updatedByName: employees.fullName,
    })
    .from(leaveTypes)
    .innerJoin(leavePolicies, eq(leavePolicies.leaveTypeId, leaveTypes.id))
    .leftJoin(employees, eq(employees.id, leavePolicies.updatedBy))
    .orderBy(asc(leaveTypes.code));

  return rows
    .map((row) => ({
      ...row,
      fixedDays: toNumber(row.fixedDays),
      carryForwardCap: toNumber(row.carryForwardCap),
    }))
    .sort((a, b) => ORDER[a.code] - ORDER[b.code]);
}

// Fails loudly when the config seed (npm run db:seed) has not been run.
export function requireAllPolicies(policies: LeavePolicy[]): void {
  const missing = LEAVE_TYPE_CODES.filter((code) => !policies.some((p) => p.code === code));
  if (missing.length > 0) {
    throw new Error(`Leave policies missing for: ${missing.join(", ")}. Run npm run db:seed.`);
  }
}

// Saves one leave type's policy. Existing entitlement rows are never
// recalculated: changes apply to entitlements created from now on.
export async function updateLeavePolicy(actor: { id: string }, input: PolicyUpdateInput): Promise<ServiceResult> {
  const db = getDb();
  const [type] = await db
    .select({ id: leaveTypes.id })
    .from(leaveTypes)
    .where(eq(leaveTypes.code, input.code))
    .limit(1);
  if (!type) return fail(404, "Leave type not found. Run npm run db:seed.");

  const values =
    input.code === "annual"
      ? {
          entitlementTable: input.entitlementDays.map((days, index) => ({ serviceYear: index + 1, days })),
          eligibilityMonthsLocal: input.eligibilityMonthsLocal,
          eligibilityMonthsForeign: input.eligibilityMonthsForeign,
          advanceNoticeDaysForeign: input.advanceNoticeDaysForeign,
          carryForwardEnabled: input.carryForwardEnabled,
          carryForwardCap: input.carryForwardCap === null ? null : String(input.carryForwardCap),
          carryForwardExpiryMonths: input.carryForwardExpiryMonths,
        }
      : input.code === "mc"
        ? {
            fixedDays: String(input.fixedDays),
            eligibilityMonthsLocal: input.eligibilityMonthsLocal,
            eligibilityMonthsForeign: input.eligibilityMonthsForeign,
            prorateRounding: input.prorateRounding,
          }
        : { fixedDays: String(input.fixedDays) };

  const updated = await db
    .update(leavePolicies)
    .set({ ...values, updatedBy: actor.id })
    .where(eq(leavePolicies.leaveTypeId, type.id))
    .returning({ id: leavePolicies.id });
  if (updated.length === 0) return fail(404, "Leave policy not found. Run npm run db:seed.");
  return { ok: true };
}

import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/db";
import { employees, leaveAdjustments, leaveEntitlements, leaveTypes } from "@/db/schema";
import { computeBalance, formatDays, type Balance } from "@/lib/leave-engine/balance";
import type { LeaveTypeCode } from "@/lib/leave-engine/constants";
import { eligibleFrom, isEligible } from "@/lib/leave-engine/eligibility";
import { currentPeriodFor } from "@/lib/leave-engine/entitlement-plan";
import type { IsoDate } from "@/lib/leave-engine/iso-date";
import { nextPeriodStart } from "@/lib/leave-engine/leave-year";
import type { AdjustmentInput } from "@/validations/leave";

import {
  databaseEntitlementStore,
  ensureEntitlementsWith,
  findEntitlementEmployee,
  needsEntitlements,
} from "./entitlement.service";
import { loadLeavePolicies } from "./leave-policy.service";
import { fail, UUID, type ServiceResult } from "./service-result";

export type LeaveTypeBalance = {
  leaveTypeId: string;
  code: LeaveTypeCode;
  name: string;
  isPaid: boolean;
  // Null when the employee has no row for the current period (inactive, or
  // not started yet).
  entitlementId: string | null;
  periodStart: IsoDate | null;
  periodEnd: IsoDate | null;
  balance: Balance | null;
  forfeitedDays: number;
  carryForwardExpiresOn: IsoDate | null;
  eligibleFrom: IsoDate;
  eligible: boolean;
};

export type EmployeeBalances = {
  employeeId: string;
  joinDate: IsoDate;
  classification: "local" | "foreign";
  status: "active" | "inactive" | "probation";
  onDate: IsoDate;
  // False before the join date: no leave periods exist yet.
  started: boolean;
  types: LeaveTypeBalance[];
  annual: {
    // The day the next annual leave year starts.
    renewsOn: IsoDate | null;
    carryForwardEnabled: boolean;
    carryForwardCap: number | null;
    // Only for foreign staff; 0 when no notice is required.
    advanceNoticeDays: number;
  };
};

// Current-period balances for every leave type. Creates any missing
// entitlement rows first (lazily), unless the employee is inactive.
// Returns null when the employee does not exist.
export async function getEmployeeBalances(employeeId: string, onDate: IsoDate): Promise<EmployeeBalances | null> {
  if (!UUID.test(employeeId)) return null;
  const [employee, policies] = await Promise.all([findEntitlementEmployee(employeeId), loadLeavePolicies()]);
  if (!employee) return null;

  if (needsEntitlements(employee, onDate)) {
    await ensureEntitlementsWith(databaseEntitlementStore, policies, [employee], onDate);
  }

  const periods = policies.map((policy) => ({
    policy,
    period: currentPeriodFor(policy.code, employee.joinDate, onDate),
  }));
  const starts = [...new Set(periods.flatMap(({ period }) => (period ? [period.start] : [])))];
  const rows = await databaseEntitlementStore.findEntitlements([employee.id], starts);
  const usage = await databaseEntitlementStore.usageFor(rows.map((row) => row.id));

  const types = periods.map(({ policy, period }): LeaveTypeBalance => {
    const row = period
      ? rows.find((r) => r.leaveTypeId === policy.leaveTypeId && r.periodStart === period.start)
      : undefined;
    const rowUsage = row ? usage.get(row.id) : undefined;
    const from = eligibleFrom(employee.joinDate, employee.classification, policy);
    return {
      leaveTypeId: policy.leaveTypeId,
      code: policy.code,
      name: policy.name,
      isPaid: policy.isPaid,
      entitlementId: row?.id ?? null,
      periodStart: row?.periodStart ?? null,
      periodEnd: row?.periodEnd ?? null,
      balance:
        row && rowUsage
          ? computeBalance({
              entitled: row.entitledDays,
              carriedForward: row.carriedForwardDays,
              adjustments: rowUsage.adjustments,
              approvedDays: rowUsage.approved,
              pendingDays: rowUsage.pending,
            })
          : null,
      forfeitedDays: row?.forfeitedDays ?? 0,
      carryForwardExpiresOn: row?.carryForwardExpiresOn ?? null,
      eligibleFrom: from,
      eligible: isEligible(from, onDate),
    };
  });

  const annualPolicy = policies.find((p) => p.code === "annual");
  const annualPeriod = periods.find(({ policy }) => policy.code === "annual")?.period ?? null;

  return {
    employeeId: employee.id,
    joinDate: employee.joinDate,
    classification: employee.classification,
    status: employee.status,
    onDate,
    started: employee.joinDate <= onDate,
    types,
    annual: {
      renewsOn: annualPeriod ? nextPeriodStart(annualPeriod) : null,
      carryForwardEnabled: annualPolicy?.carryForwardEnabled ?? false,
      carryForwardCap: annualPolicy?.carryForwardCap ?? null,
      advanceNoticeDays: employee.classification === "foreign" ? (annualPolicy?.advanceNoticeDaysForeign ?? 0) : 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Adjustments (admin only, append-only)
// ---------------------------------------------------------------------------

const createdByEmployee = alias(employees, "created_by_employee");

// Newest first. Never edited or deleted; wrong ones are offset by a new one.
export async function listAdjustments(employeeId: string, limit = 50) {
  if (!UUID.test(employeeId)) return [];
  const rows = await getDb()
    .select({
      id: leaveAdjustments.id,
      createdAt: leaveAdjustments.createdAt,
      leaveTypeName: leaveTypes.name,
      periodStart: leaveEntitlements.periodStart,
      periodEnd: leaveEntitlements.periodEnd,
      days: leaveAdjustments.days,
      reason: leaveAdjustments.reason,
      note: leaveAdjustments.note,
      createdByName: createdByEmployee.fullName,
    })
    .from(leaveAdjustments)
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveAdjustments.leaveTypeId))
    .innerJoin(leaveEntitlements, eq(leaveEntitlements.id, leaveAdjustments.entitlementId))
    .innerJoin(createdByEmployee, eq(createdByEmployee.id, leaveAdjustments.createdBy))
    .where(eq(leaveAdjustments.employeeId, employeeId))
    .orderBy(desc(leaveAdjustments.createdAt))
    .limit(limit);
  return rows.map((row) => ({ ...row, days: Number(row.days) }));
}

export type AdjustmentHistoryItem = Awaited<ReturnType<typeof listAdjustments>>[number];

// Adds an adjustment to the employee's CURRENT period for the leave type.
// Refused when it would take the available balance below 0.
export async function addAdjustment(
  actor: { id: string },
  employeeId: string,
  input: AdjustmentInput,
  onDate: IsoDate,
): Promise<ServiceResult<{ id: string; available: number }>> {
  const balances = await getEmployeeBalances(employeeId, onDate);
  if (!balances) return fail(404, "Employee not found");
  if (balances.status === "inactive") {
    return fail(409, "This employee is inactive. Reactivate them before adjusting their balance.");
  }
  if (!balances.started) {
    return fail(409, "This employee has not started yet. Balances can be adjusted from their join date.");
  }

  const type = balances.types.find((t) => t.code === input.leaveType);
  if (!type?.entitlementId || !type.balance) {
    return fail(409, "No leave period exists for this leave type yet. Please try again.");
  }

  const available = type.balance.available + input.days;
  if (available < 0) {
    return fail(400, "Please check the highlighted fields.", {
      fieldErrors: {
        days: `This would leave ${formatDays(available)} days available. The available balance cannot go below 0 (currently ${formatDays(type.balance.available)}).`,
      },
    });
  }

  const [row] = await getDb()
    .insert(leaveAdjustments)
    .values({
      employeeId: balances.employeeId,
      leaveTypeId: type.leaveTypeId,
      entitlementId: type.entitlementId,
      days: String(input.days),
      reason: input.reason,
      note: input.note,
      createdBy: actor.id,
    })
    .returning({ id: leaveAdjustments.id });
  return { ok: true, id: row.id, available };
}

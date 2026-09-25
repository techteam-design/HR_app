import { and, asc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { getDb } from "@/db";
import { employees, leaveAdjustments, leaveApplications, leaveEntitlements } from "@/db/schema";
import {
  currentPeriodFor,
  planEntitlement,
  previousPeriodFor,
  type PlannedEntitlement,
} from "@/lib/leave-engine/entitlement-plan";
import type { IsoDate } from "@/lib/leave-engine/iso-date";
import { todayIsoInSingapore } from "@/lib/utils/dates";

import { loadLeavePolicies, requireAllPolicies, type LeavePolicy } from "./leave-policy.service";

// Creates the leave_entitlements rows each active or probation employee
// needs for "today": the current annual (anniversary) period, and the current
// calendar-year MC and unpaid periods.
//
// Idempotent: rows are inserted with ON CONFLICT DO NOTHING on the unique
// (employee_id, leave_type_id, period_start) constraint, and existing rows are
// never updated or deleted. Running twice on the same day creates nothing new.
// The one exception is a join-date change (planJoinDateChange below): current
// rows with no adjustments or applications are replaced.
// No historical backfill: when the previous annual period has no row, nothing
// carries forward (opening balances are entered as adjustments).

export type EntitlementEmployee = {
  id: string;
  joinDate: IsoDate;
  classification: "local" | "foreign";
  status: "active" | "inactive" | "probation";
};

export type StoredEntitlement = {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  entitledDays: number;
  carriedForwardDays: number;
  forfeitedDays: number;
  carryForwardExpiresOn: IsoDate | null;
};

export type NewEntitlement = Omit<PlannedEntitlement, "code"> & { employeeId: string; leaveTypeId: string };

// Per entitlement row: sum of adjustments, and approved / pending application
// days whose start date falls inside the row's period.
export type EntitlementUsage = { adjustments: number; approved: number; pending: number };

// Database access used by the entitlement logic. Replaced by an in-memory
// store in tests.
export type EntitlementStore = {
  findEntitlements(employeeIds: string[], periodStarts: IsoDate[]): Promise<StoredEntitlement[]>;
  usageFor(entitlementIds: string[]): Promise<Map<string, EntitlementUsage>>;
  // Returns how many rows were actually inserted (conflicts are skipped).
  insertEntitlements(rows: NewEntitlement[]): Promise<number>;
  // Rows whose period contains onDate (any leave type).
  findCurrentEntitlements(employeeId: string, onDate: IsoDate): Promise<StoredEntitlement[]>;
  // Ids of the rows that have any adjustment, or any leave application (any
  // status) starting inside their period.
  withActivity(entitlementIds: string[]): Promise<Set<string>>;
};

export type EnsureCounts = {
  employeesChecked: number;
  // Inactive, or join date still in the future.
  employeesSkipped: number;
  created: number;
  alreadyExisted: number;
};

const BATCH_SIZE = 100;
const NO_USAGE: EntitlementUsage = { adjustments: 0, approved: 0, pending: 0 };

const keyOf = (employeeId: string, leaveTypeId: string, periodStart: IsoDate) =>
  `${employeeId}|${leaveTypeId}|${periodStart}`;

export function needsEntitlements(employee: EntitlementEmployee, onDate: IsoDate): boolean {
  return employee.status !== "inactive" && employee.joinDate <= onDate;
}

// The core, shared by the single-employee and daily-job entry points.
export async function ensureEntitlementsWith(
  store: EntitlementStore,
  policies: LeavePolicy[],
  employeeList: EntitlementEmployee[],
  onDate: IsoDate,
): Promise<EnsureCounts> {
  requireAllPolicies(policies);
  const counts: EnsureCounts = { employeesChecked: employeeList.length, employeesSkipped: 0, created: 0, alreadyExisted: 0 };
  const eligible = employeeList.filter((employee) => needsEntitlements(employee, onDate));
  counts.employeesSkipped = employeeList.length - eligible.length;

  for (let offset = 0; offset < eligible.length; offset += BATCH_SIZE) {
    const batch = eligible.slice(offset, offset + BATCH_SIZE);

    const { targets, rows } = await planMissingEntitlements(store, policies, batch, onDate);
    const inserted = rows.length > 0 ? await store.insertEntitlements(rows) : 0;
    counts.created += inserted;
    // Includes rows another request inserted in the meantime.
    counts.alreadyExisted += targets - inserted;
  }

  return counts;
}

// Plans the rows missing for the current periods of these employees (all must
// need entitlements). Stored rows listed in `ignore` are treated as absent:
// used when they are about to be replaced.
export async function planMissingEntitlements(
  store: EntitlementStore,
  policies: LeavePolicy[],
  batch: EntitlementEmployee[],
  onDate: IsoDate,
  ignore: ReadonlySet<string> = new Set(),
): Promise<{ targets: number; rows: NewEntitlement[] }> {
  const targets = batch.flatMap((employee) =>
    policies.map((policy) => ({
      employee,
      policy,
      period: currentPeriodFor(policy.code, employee.joinDate, onDate)!,
      previous: previousPeriodFor(policy.code, employee.joinDate, onDate),
    })),
  );

  const starts = new Set<IsoDate>();
  for (const target of targets) {
    starts.add(target.period.start);
    if (target.previous) starts.add(target.previous.start);
  }
  const stored = await store.findEntitlements(
    batch.map((employee) => employee.id),
    [...starts],
  );
  const byKey = new Map(
    stored
      .filter((row) => !ignore.has(row.id))
      .map((row) => [keyOf(row.employeeId, row.leaveTypeId, row.periodStart), row]),
  );

  const missing = targets.filter(
    (target) => !byKey.has(keyOf(target.employee.id, target.policy.leaveTypeId, target.period.start)),
  );
  if (missing.length === 0) return { targets: targets.length, rows: [] };

  // Carry-forward sources: the previous annual period's row, when it exists.
  const previousRowFor = (target: (typeof targets)[number]) =>
    target.previous
      ? byKey.get(keyOf(target.employee.id, target.policy.leaveTypeId, target.previous.start))
      : undefined;
  const previousIds = missing.flatMap((target) => previousRowFor(target)?.id ?? []);
  const usage = previousIds.length > 0 ? await store.usageFor(previousIds) : new Map<string, EntitlementUsage>();

  const rows: NewEntitlement[] = [];
  for (const target of missing) {
    const previousRow = previousRowFor(target);
    const previousUsage = previousRow ? (usage.get(previousRow.id) ?? NO_USAGE) : null;
    const planned = planEntitlement({
      policy: target.policy,
      joinDate: target.employee.joinDate,
      onDate,
      previous:
        previousRow && previousUsage
          ? {
              entitled: previousRow.entitledDays,
              carriedForward: previousRow.carriedForwardDays,
              adjustments: previousUsage.adjustments,
              used: previousUsage.approved,
            }
          : null,
    });
    if (!planned) continue;
    rows.push({
      employeeId: target.employee.id,
      leaveTypeId: target.policy.leaveTypeId,
      periodStart: planned.periodStart,
      periodEnd: planned.periodEnd,
      entitledDays: planned.entitledDays,
      carriedForwardDays: planned.carriedForwardDays,
      forfeitedDays: planned.forfeitedDays,
      carryForwardExpiresOn: planned.carryForwardExpiresOn,
    });
  }

  return { targets: targets.length, rows };
}

// ---------------------------------------------------------------------------
// Join-date changes
// ---------------------------------------------------------------------------

export const JOIN_DATE_BLOCKED =
  "This employee already has leave activity in the current period. Contact support to correct the join date.";

export type JoinDateChangePlan =
  | { ok: true; deleteIds: string[]; rows: NewEntitlement[] }
  | { ok: false; error: string };

// A join date change moves the annual period and can change MC proration.
// The CURRENT rows (period contains onDate) are derived data, so when none of
// them has adjustments or applications they are deleted and regenerated from
// the new join date. If any has activity, the change is refused. Rows from
// past periods are never touched. `employee` carries the NEW join date.
export async function planJoinDateChange(
  store: EntitlementStore,
  policies: LeavePolicy[],
  employee: EntitlementEmployee,
  onDate: IsoDate,
): Promise<JoinDateChangePlan> {
  requireAllPolicies(policies);
  const current = await store.findCurrentEntitlements(employee.id, onDate);
  const deleteIds = current.map((row) => row.id);
  if (deleteIds.length > 0 && (await store.withActivity(deleteIds)).size > 0) {
    return { ok: false, error: JOIN_DATE_BLOCKED };
  }
  if (!needsEntitlements(employee, onDate)) return { ok: true, deleteIds, rows: [] };

  const { rows } = await planMissingEntitlements(store, policies, [employee], onDate, new Set(deleteIds));
  return { ok: true, deleteIds, rows };
}

// ---------------------------------------------------------------------------
// Database store
// ---------------------------------------------------------------------------

const dayTotal = (column: unknown) => sql<number>`coalesce(sum(${column}), 0)`.mapWith(Number);

const storedColumns = {
  id: leaveEntitlements.id,
  employeeId: leaveEntitlements.employeeId,
  leaveTypeId: leaveEntitlements.leaveTypeId,
  periodStart: leaveEntitlements.periodStart,
  periodEnd: leaveEntitlements.periodEnd,
  entitledDays: leaveEntitlements.entitledDays,
  carriedForwardDays: leaveEntitlements.carriedForwardDays,
  forfeitedDays: leaveEntitlements.forfeitedDays,
  carryForwardExpiresOn: leaveEntitlements.carryForwardExpiresOn,
};

function toStored(row: {
  entitledDays: string;
  carriedForwardDays: string;
  forfeitedDays: string;
} & Omit<StoredEntitlement, "entitledDays" | "carriedForwardDays" | "forfeitedDays">): StoredEntitlement {
  return {
    ...row,
    entitledDays: Number(row.entitledDays),
    carriedForwardDays: Number(row.carriedForwardDays),
    forfeitedDays: Number(row.forfeitedDays),
  };
}

// INSERT ... ON CONFLICT DO NOTHING, not yet executed (so it can join a batch).
function insertEntitlementsQuery(rows: NewEntitlement[]) {
  return getDb()
    .insert(leaveEntitlements)
    .values(
      rows.map((row) => ({
        employeeId: row.employeeId,
        leaveTypeId: row.leaveTypeId,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        entitledDays: String(row.entitledDays),
        carriedForwardDays: String(row.carriedForwardDays),
        forfeitedDays: String(row.forfeitedDays),
        carryForwardExpiresOn: row.carryForwardExpiresOn,
      })),
    )
    .onConflictDoNothing({
      target: [leaveEntitlements.employeeId, leaveEntitlements.leaveTypeId, leaveEntitlements.periodStart],
    })
    .returning({ id: leaveEntitlements.id });
}

export const databaseEntitlementStore: EntitlementStore = {
  async findEntitlements(employeeIds, periodStarts) {
    if (employeeIds.length === 0 || periodStarts.length === 0) return [];
    const rows = await getDb()
      .select(storedColumns)
      .from(leaveEntitlements)
      .where(
        and(
          inArray(leaveEntitlements.employeeId, employeeIds),
          inArray(leaveEntitlements.periodStart, periodStarts),
        ),
      );
    return rows.map(toStored);
  },

  async usageFor(entitlementIds) {
    const result = new Map<string, EntitlementUsage>();
    if (entitlementIds.length === 0) return result;
    const db = getDb();
    const [adjustmentRows, applicationRows] = await db.batch([
      db
        .select({ entitlementId: leaveAdjustments.entitlementId, days: dayTotal(leaveAdjustments.days) })
        .from(leaveAdjustments)
        .where(inArray(leaveAdjustments.entitlementId, entitlementIds))
        .groupBy(leaveAdjustments.entitlementId),
      // An application counts in the period that contains its start date.
      db
        .select({
          entitlementId: leaveEntitlements.id,
          approved: dayTotal(
            sql`case when ${leaveApplications.status} = 'approved' then ${leaveApplications.totalDays} end`,
          ),
          pending: dayTotal(
            sql`case when ${leaveApplications.status} = 'pending' then ${leaveApplications.totalDays} end`,
          ),
        })
        .from(leaveEntitlements)
        .innerJoin(
          leaveApplications,
          and(
            eq(leaveApplications.employeeId, leaveEntitlements.employeeId),
            eq(leaveApplications.leaveTypeId, leaveEntitlements.leaveTypeId),
            sql`${leaveApplications.startDate} between ${leaveEntitlements.periodStart} and ${leaveEntitlements.periodEnd}`,
            inArray(leaveApplications.status, ["approved", "pending"]),
          ),
        )
        .where(inArray(leaveEntitlements.id, entitlementIds))
        .groupBy(leaveEntitlements.id),
    ]);

    for (const id of entitlementIds) result.set(id, { ...NO_USAGE });
    for (const row of adjustmentRows) result.get(row.entitlementId)!.adjustments = row.days;
    for (const row of applicationRows) {
      const usage = result.get(row.entitlementId)!;
      usage.approved = row.approved;
      usage.pending = row.pending;
    }
    return result;
  },

  async insertEntitlements(rows) {
    if (rows.length === 0) return 0;
    return (await insertEntitlementsQuery(rows)).length;
  },

  async findCurrentEntitlements(employeeId, onDate) {
    const rows = await getDb()
      .select(storedColumns)
      .from(leaveEntitlements)
      .where(
        and(
          eq(leaveEntitlements.employeeId, employeeId),
          lte(leaveEntitlements.periodStart, onDate),
          gte(leaveEntitlements.periodEnd, onDate),
        ),
      );
    return rows.map(toStored);
  },

  async withActivity(entitlementIds) {
    if (entitlementIds.length === 0) return new Set();
    const db = getDb();
    const [adjusted, applied] = await db.batch([
      db
        .selectDistinct({ id: leaveAdjustments.entitlementId })
        .from(leaveAdjustments)
        .where(inArray(leaveAdjustments.entitlementId, entitlementIds)),
      // Any status counts: even a rejected or cancelled application is history.
      db
        .selectDistinct({ id: leaveEntitlements.id })
        .from(leaveEntitlements)
        .innerJoin(
          leaveApplications,
          and(
            eq(leaveApplications.employeeId, leaveEntitlements.employeeId),
            eq(leaveApplications.leaveTypeId, leaveEntitlements.leaveTypeId),
            or(
              sql`${leaveApplications.startDate} between ${leaveEntitlements.periodStart} and ${leaveEntitlements.periodEnd}`,
              sql`${leaveApplications.endDate} between ${leaveEntitlements.periodStart} and ${leaveEntitlements.periodEnd}`,
            ),
          ),
        )
        .where(inArray(leaveEntitlements.id, entitlementIds)),
    ]);
    return new Set([...adjusted, ...applied].map((row) => row.id));
  },
};

type Statement = BatchItem<"pg">;

// For updateEmployee: the statements that replace the employee's current
// entitlement rows after a join-date change, to run in the SAME db.batch as
// the employee update. `employee` carries the new join date and status.
// Should an adjustment be added in between, its foreign key makes the delete
// fail and the whole batch rolls back.
export async function joinDateChangeStatements(
  employee: EntitlementEmployee,
  onDate: IsoDate = todayIsoInSingapore(),
): Promise<{ ok: true; statements: Statement[] } | { ok: false; error: string }> {
  const plan = await planJoinDateChange(databaseEntitlementStore, await loadLeavePolicies(), employee, onDate);
  if (!plan.ok) return plan;

  const statements: Statement[] = [];
  if (plan.deleteIds.length > 0) {
    statements.push(getDb().delete(leaveEntitlements).where(inArray(leaveEntitlements.id, plan.deleteIds)));
  }
  if (plan.rows.length > 0) statements.push(insertEntitlementsQuery(plan.rows));
  return { ok: true, statements };
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

const entitlementEmployeeColumns = {
  id: employees.id,
  joinDate: employees.joinDate,
  classification: employees.classification,
  status: employees.status,
};

export async function findEntitlementEmployee(employeeId: string): Promise<EntitlementEmployee | null> {
  const [row] = await getDb()
    .select(entitlementEmployeeColumns)
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  return row ?? null;
}

// One employee. Called when an employee is created or reactivated, and before
// their balances are shown. Inactive employees get no new entitlements.
export async function ensureEntitlements(
  employeeId: string,
  onDate: IsoDate = todayIsoInSingapore(),
  policies?: LeavePolicy[],
): Promise<EnsureCounts> {
  const employee = await findEntitlementEmployee(employeeId);
  if (!employee) return { employeesChecked: 0, employeesSkipped: 0, created: 0, alreadyExisted: 0 };
  return ensureEntitlementsWith(databaseEntitlementStore, policies ?? (await loadLeavePolicies()), [employee], onDate);
}

// Same as ensureEntitlements, but never throws: used after an employee is
// created or reactivated, where the main change has already been saved. The
// rows are created lazily on the next balance view or by the daily job.
export async function ensureEntitlementsQuietly(employeeId: string): Promise<void> {
  try {
    await ensureEntitlements(employeeId);
  } catch (error) {
    console.error("ensureEntitlements failed", { employeeId, error });
  }
}

// Every employee, for the daily job and db:entitlements. Inactive employees
// are loaded only so they show up in the "skipped" count.
export async function ensureAllEntitlements(onDate: IsoDate = todayIsoInSingapore()): Promise<EnsureCounts & { onDate: IsoDate }> {
  const db = getDb();
  const [employeeList, policies] = await Promise.all([
    db
      .select(entitlementEmployeeColumns)
      .from(employees)
      .orderBy(asc(employees.employeeCode)),
    loadLeavePolicies(),
  ]);
  const counts = await ensureEntitlementsWith(databaseEntitlementStore, policies, employeeList, onDate);
  return { onDate, ...counts };
}

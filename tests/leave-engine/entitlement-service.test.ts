import { describe, expect, it, vi } from "vitest";

// The entitlement service with the database replaced by an in-memory store
// that enforces the same unique (employee_id, leave_type_id, period_start)
// constraint as leave_entitlements.

vi.mock("@/db", () => ({ getDb: () => { throw new Error("The database must not be used in this test"); } }));

const { ensureEntitlementsWith, JOIN_DATE_BLOCKED, planJoinDateChange } = await import("@/server/entitlement.service");
type Store = import("@/server/entitlement.service").EntitlementStore;
type Stored = import("@/server/entitlement.service").StoredEntitlement;
type Policy = import("@/server/leave-policy.service").LeavePolicy;

const TABLE = [1, 2, 3, 4, 5, 6, 7, 8].map((serviceYear) => ({ serviceYear, days: serviceYear + 6 }));

const base = {
  entitlementTable: null,
  fixedDays: null,
  eligibilityMonthsLocal: 0,
  eligibilityMonthsForeign: 0,
  advanceNoticeDaysForeign: 0,
  carryForwardEnabled: false,
  carryForwardCap: null,
  carryForwardExpiryMonths: null,
  prorateOnJoin: false,
  prorateRounding: null,
  updatedAt: new Date(0),
  updatedByName: null,
} as const;

const POLICIES: Policy[] = [
  { ...base, leaveTypeId: "t-annual", code: "annual", name: "Annual Leave", isPaid: true, periodBasis: "anniversary", entitlementTable: TABLE, eligibilityMonthsLocal: 3, advanceNoticeDaysForeign: 14, carryForwardEnabled: true, carryForwardCap: 3 },
  { ...base, leaveTypeId: "t-mc", code: "mc", name: "Medical Leave (MC)", isPaid: true, periodBasis: "calendar", fixedDays: 14, eligibilityMonthsLocal: 1, eligibilityMonthsForeign: 1, prorateOnJoin: true },
  { ...base, leaveTypeId: "t-unpaid", code: "unpaid", name: "Unpaid Leave", isPaid: false, periodBasis: "calendar", fixedDays: 7 },
];

function memoryStore(
  initial: Stored[] = [],
  usage: Record<string, { adjustments: number; approved: number; pending: number }> = {},
  // Ids of rows that have adjustments or applications.
  activity: string[] = [],
) {
  const rows = [...initial];
  const insert = vi.fn(async (newRows: Parameters<Store["insertEntitlements"]>[0]) => {
    let inserted = 0;
    for (const row of newRows) {
      const exists = rows.some(
        (r) => r.employeeId === row.employeeId && r.leaveTypeId === row.leaveTypeId && r.periodStart === row.periodStart,
      );
      if (exists) continue; // ON CONFLICT DO NOTHING
      rows.push({ id: `e${rows.length + 1}`, ...row });
      inserted += 1;
    }
    return inserted;
  });
  const store: Store = {
    findEntitlements: async (employeeIds, starts) =>
      rows.filter((r) => employeeIds.includes(r.employeeId) && starts.includes(r.periodStart)),
    usageFor: async (ids) => new Map(ids.map((id) => [id, usage[id] ?? { adjustments: 0, approved: 0, pending: 0 }])),
    insertEntitlements: insert,
    findCurrentEntitlements: async (employeeId, onDate) =>
      rows.filter((r) => r.employeeId === employeeId && r.periodStart <= onDate && r.periodEnd >= onDate),
    withActivity: async (ids) => new Set(ids.filter((id) => activity.includes(id))),
  };
  return { store, rows, insert };
}

const MARIA = { id: "maria", joinDate: "2023-09-20", classification: "foreign" as const, status: "active" as const };
const RACHEL = { id: "rachel", joinDate: "2026-07-01", classification: "local" as const, status: "active" as const };
const JASON = { id: "jason", joinDate: "2024-09-20", classification: "local" as const, status: "inactive" as const };
const FUTURE = { id: "future", joinDate: "2026-11-01", classification: "local" as const, status: "active" as const };

describe("ensureEntitlementsWith()", () => {
  it("creates the annual, MC and unpaid rows for the current periods", async () => {
    const { store, rows } = memoryStore();
    const counts = await ensureEntitlementsWith(store, POLICIES, [MARIA, RACHEL], "2026-09-25");

    expect(counts).toEqual({ employeesChecked: 2, employeesSkipped: 0, created: 6, alreadyExisted: 0 });
    expect(rows.find((r) => r.employeeId === "maria" && r.leaveTypeId === "t-annual")).toMatchObject({
      periodStart: "2026-09-20",
      periodEnd: "2027-09-19",
      entitledDays: 10, // service year 4
      carriedForwardDays: 0, // no previous row: no backfill
    });
    expect(rows.find((r) => r.employeeId === "rachel" && r.leaveTypeId === "t-mc")).toMatchObject({
      periodStart: "2026-01-01",
      entitledDays: 7, // joined 1 July: 14 × 6 / 12
    });
    expect(rows.find((r) => r.employeeId === "rachel" && r.leaveTypeId === "t-unpaid")?.entitledDays).toBe(7);
  });

  it("is idempotent: a second run creates nothing new", async () => {
    const { store, rows, insert } = memoryStore();
    await ensureEntitlementsWith(store, POLICIES, [MARIA, RACHEL], "2026-09-25");
    const before = rows.length;

    const counts = await ensureEntitlementsWith(store, POLICIES, [MARIA, RACHEL], "2026-09-25");

    expect(counts).toEqual({ employeesChecked: 2, employeesSkipped: 0, created: 0, alreadyExisted: 6 });
    expect(rows.length).toBe(before);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("never changes existing rows", async () => {
    const existing: Stored = {
      id: "old",
      employeeId: "maria",
      leaveTypeId: "t-annual",
      periodStart: "2026-09-20",
      periodEnd: "2027-09-19",
      entitledDays: 99,
      carriedForwardDays: 0,
      forfeitedDays: 0,
      carryForwardExpiresOn: null,
    };
    const { store, rows } = memoryStore([existing]);
    await ensureEntitlementsWith(store, POLICIES, [MARIA], "2026-09-25");
    expect(rows.find((r) => r.id === "old")?.entitledDays).toBe(99);
  });

  it("carries forward from the previous annual row, capped at 3", async () => {
    const previous: Stored = {
      id: "prev",
      employeeId: "maria",
      leaveTypeId: "t-annual",
      periodStart: "2025-09-20",
      periodEnd: "2026-09-19",
      entitledDays: 9,
      carriedForwardDays: 0,
      forfeitedDays: 0,
      carryForwardExpiresOn: null,
    };
    const { store, rows } = memoryStore([previous], { prev: { adjustments: 1, approved: 2, pending: 0 } });
    await ensureEntitlementsWith(store, POLICIES, [MARIA], "2026-09-20");

    // unused = 9 + 0 + 1 − 2 = 8 → carried 3, forfeited 5
    expect(rows.find((r) => r.employeeId === "maria" && r.periodStart === "2026-09-20")).toMatchObject({
      entitledDays: 10,
      carriedForwardDays: 3,
      forfeitedDays: 5,
    });
  });

  it("skips inactive employees and those who have not started", async () => {
    const { store, rows } = memoryStore();
    const counts = await ensureEntitlementsWith(store, POLICIES, [JASON, FUTURE, RACHEL], "2026-09-25");
    expect(counts).toEqual({ employeesChecked: 3, employeesSkipped: 2, created: 3, alreadyExisted: 0 });
    expect(rows.every((r) => r.employeeId === "rachel")).toBe(true);
  });

  it("counts rows inserted concurrently by someone else as already existing", async () => {
    const { store } = memoryStore();
    const racing: Store = { ...store, insertEntitlements: async () => 1 };
    const counts = await ensureEntitlementsWith(racing, POLICIES, [RACHEL], "2026-09-25");
    expect(counts).toMatchObject({ created: 1, alreadyExisted: 2 });
  });

  it("fails loudly when a leave policy is missing", async () => {
    const { store } = memoryStore();
    await expect(ensureEntitlementsWith(store, POLICIES.slice(0, 2), [RACHEL], "2026-09-25")).rejects.toThrow(/db:seed/);
  });
});

describe("planJoinDateChange()", () => {
  const TODAY = "2026-09-25";

  // Maria's rows as the daily job would have created them, plus a past row.
  async function mariaStore(activity: string[] = []) {
    const pastAnnual: Stored = {
      id: "past",
      employeeId: "maria",
      leaveTypeId: "t-annual",
      periodStart: "2025-09-20",
      periodEnd: "2026-09-19",
      entitledDays: 9,
      carriedForwardDays: 0,
      forfeitedDays: 0,
      carryForwardExpiresOn: null,
    };
    const memory = memoryStore([pastAnnual], {}, activity);
    await ensureEntitlementsWith(memory.store, POLICIES, [MARIA], TODAY);
    return memory;
  }

  // What the db.batch does: delete the planned ids, then insert the new rows.
  async function apply(memory: Awaited<ReturnType<typeof mariaStore>>, plan: { deleteIds: string[]; rows: Parameters<Store["insertEntitlements"]>[0] }) {
    for (const id of plan.deleteIds) memory.rows.splice(memory.rows.findIndex((r) => r.id === id), 1);
    await memory.store.insertEntitlements(plan.rows);
  }

  it("replaces activity-free current rows with rows for the new join date", async () => {
    const memory = await mariaStore();
    const currentIds = memory.rows.filter((r) => r.id !== "past").map((r) => r.id);

    const plan = await planJoinDateChange(memory.store, POLICIES, { ...MARIA, joinDate: "2024-03-10" }, TODAY);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.deleteIds.sort()).toEqual(currentIds.sort());
    await apply(memory, plan);

    const annual = memory.rows.filter((r) => r.leaveTypeId === "t-annual" && r.id !== "past");
    // Joined 10 Mar 2024: service year 3 runs 10 Mar 2026 – 9 Mar 2027 → 9 days.
    expect(annual).toHaveLength(1);
    expect(annual[0]).toMatchObject({ periodStart: "2026-03-10", periodEnd: "2027-03-09", entitledDays: 9 });
    expect(memory.rows.find((r) => r.leaveTypeId === "t-mc")).toMatchObject({ periodStart: "2026-01-01", entitledDays: 14 });
    expect(memory.rows.filter((r) => r.leaveTypeId === "t-unpaid")).toHaveLength(1);
  });

  it("re-prorates MC when the new join date falls in this calendar year", async () => {
    const memory = await mariaStore();
    const plan = await planJoinDateChange(memory.store, POLICIES, { ...MARIA, joinDate: "2026-07-01" }, TODAY);
    if (!plan.ok) throw new Error(plan.error);
    await apply(memory, plan);

    expect(memory.rows.find((r) => r.leaveTypeId === "t-mc")?.entitledDays).toBe(7);
    expect(memory.rows.find((r) => r.leaveTypeId === "t-annual" && r.id !== "past")).toMatchObject({
      periodStart: "2026-07-01",
      periodEnd: "2027-06-30",
      entitledDays: 7, // service year 1
    });
  });

  it("is blocked when a current row has an adjustment", async () => {
    const memory = await mariaStore();
    const current = memory.rows.find((r) => r.leaveTypeId === "t-annual" && r.id !== "past")!;
    const blocked = memoryStore(memory.rows, {}, [current.id]);

    const plan = await planJoinDateChange(blocked.store, POLICIES, { ...MARIA, joinDate: "2024-03-10" }, TODAY);
    expect(plan).toEqual({ ok: false, error: JOIN_DATE_BLOCKED });
  });

  it("never touches past-period rows, even when they have activity", async () => {
    const memory = await mariaStore(["past"]);
    const before = { ...memory.rows.find((r) => r.id === "past")! };

    const plan = await planJoinDateChange(memory.store, POLICIES, { ...MARIA, joinDate: "2024-03-10" }, TODAY);
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.deleteIds).not.toContain("past");
    await apply(memory, plan);

    expect(memory.rows.find((r) => r.id === "past")).toEqual(before);
  });

  it("deletes but does not regenerate when the new join date is in the future", async () => {
    const memory = await mariaStore();
    const plan = await planJoinDateChange(memory.store, POLICIES, { ...MARIA, joinDate: "2026-11-01" }, TODAY);
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.deleteIds).toHaveLength(3);
    expect(plan.rows).toEqual([]);
  });
});

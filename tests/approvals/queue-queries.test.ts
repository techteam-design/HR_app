import { getTableName, type Table } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { employees, leaveApplicationDays, leaveEntitlements } from "@/db/schema";

// listQueue() (the approver queue) with the database replaced by a recorder:
// every awaited query and every db.batch counts as one round trip. The
// number of round trips must not grow with the number of pending requests,
// and the balances must match the per-request rules (periodBalance()).

const RESOLVE = Symbol("resolve");
type State = { kind: "select" | "insert"; table?: Table };

const db = vi.hoisted(() => ({
  roundTrips: [] as string[],
  respond: (() => []) as (state: { kind: string; table?: unknown }) => unknown[],
}));

vi.mock("@/db", () => {
  const label = (state: State) => `${state.kind} ${state.table ? getTableName(state.table) : "?"}`;
  const chain = (state: State): object => {
    const proxy: object = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === RESOLVE) return () => db.respond(state);
          if (prop === "then") {
            return (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
              db.roundTrips.push(label(state));
              return Promise.resolve(db.respond(state)).then(resolve, reject);
            };
          }
          if (prop === "from") {
            return (table: Table) => {
              state.table = table;
              return proxy;
            };
          }
          return () => proxy;
        },
      },
    );
    return proxy;
  };
  return {
    getDb: () => ({
      select: () => chain({ kind: "select" }),
      insert: (table: Table) => chain({ kind: "insert", table }),
      batch: async (items: Record<symbol, () => unknown>[]) => {
        db.roundTrips.push(`batch[${items.length}]`);
        return items.map((item) => item[RESOLVE]());
      },
    }),
  };
});

vi.mock("@/server/employee-photo.service", () => ({
  withPhotoUrls: async <T extends object>(items: T[]) => items.map((item) => ({ ...item, photoUrl: null })),
}));

const queue = vi.hoisted(() => ({ items: [] as unknown[] }));
vi.mock("@/server/leave-application.service", () => ({ queryApplications: async () => queue.items }));

type Policy = import("@/server/leave-policy.service").LeavePolicy;
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
const TABLE = [1, 2, 3, 4, 5, 6, 7, 8].map((serviceYear) => ({ serviceYear, days: serviceYear + 6 }));
const POLICIES: Policy[] = [
  { ...base, leaveTypeId: "t-annual", code: "annual", name: "Annual Leave", isPaid: true, periodBasis: "anniversary", entitlementTable: TABLE, carryForwardEnabled: true, carryForwardCap: 3 },
  { ...base, leaveTypeId: "t-mc", code: "mc", name: "Medical Leave (MC)", isPaid: true, periodBasis: "calendar", fixedDays: 14 },
  { ...base, leaveTypeId: "t-unpaid", code: "unpaid", name: "Unpaid Leave", isPaid: false, periodBasis: "calendar", fixedDays: 7 },
];
vi.mock("@/server/leave-policy.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/leave-policy.service")>()),
  loadLeavePolicies: async () => POLICIES,
}));

const { listQueue } = await import("@/server/approval.service");

const TODAY = "2026-10-01";
// Joined 15 Jan 2020: service year 7 runs 15 Jan 2026 to 14 Jan 2027 (13 days).
const JOIN_DATE = "2020-01-15";
const ADMIN = { id: "boss", role: "admin" as const };

function scenario(count: number) {
  const ids = Array.from({ length: count }, (_, i) => `emp-${i + 1}`);
  queue.items = ids.map((employeeId, i) => ({
    id: `app-${i + 1}`,
    employeeId,
    code: "annual",
    status: "pending",
    approvalMode: "single",
    currentLevel: 1,
    totalDays: 2,
    approvers: [{ id: "daniel", name: "Daniel Tan", level: 1 }],
    days: [
      { date: "2026-10-20", portion: 1 },
      { date: "2026-10-21", portion: 1 },
    ],
  }));

  const rows = ids.flatMap((employeeId) => [
    { id: `${employeeId}-annual`, employeeId, leaveTypeId: "t-annual", periodStart: "2026-01-15", periodEnd: "2027-01-14", entitledDays: "13", carriedForwardDays: "0", forfeitedDays: "0", carryForwardExpiresOn: null, adjustments: 1.5 },
    { id: `${employeeId}-mc`, employeeId, leaveTypeId: "t-mc", periodStart: "2026-01-01", periodEnd: "2026-12-31", entitledDays: "14", carriedForwardDays: "0", forfeitedDays: "0", carryForwardExpiresOn: null, adjustments: 0 },
    { id: `${employeeId}-unpaid`, employeeId, leaveTypeId: "t-unpaid", periodStart: "2026-01-01", periodEnd: "2026-12-31", entitledDays: "7", carriedForwardDays: "0", forfeitedDays: "0", carryForwardExpiresOn: null, adjustments: 0 },
  ]);
  const day = (applicationId: string, employeeId: string, leaveTypeId: string, status: string, date: string, portion: string) => ({
    applicationId, employeeId, leaveTypeId, status, date, portion,
  });
  const days = ids.flatMap((employeeId, i) => [
    // The request itself: excluded from its own balance.
    day(`app-${i + 1}`, employeeId, "t-annual", "pending", "2026-10-20", "1.0"),
    day(`app-${i + 1}`, employeeId, "t-annual", "pending", "2026-10-21", "1.0"),
    // Approved annual leave this leave year: counts.
    day(`old-${i + 1}`, employeeId, "t-annual", "approved", "2026-03-02", "1.0"),
    day(`old-${i + 1}`, employeeId, "t-annual", "approved", "2026-03-03", "0.5"),
    // Another pending annual request: pending only, does not reduce "available".
    day(`other-${i + 1}`, employeeId, "t-annual", "pending", "2026-11-09", "1.0"),
    // Approved annual leave in the PREVIOUS leave year: does not count.
    day(`prev-${i + 1}`, employeeId, "t-annual", "approved", "2026-01-12", "1.0"),
  ]);
  const people = ids.map((id) => ({
    id, fullName: id, joinDate: JOIN_DATE, classification: "local", status: "active", photoKey: null, branchName: "Branch A",
  }));

  db.respond = (state) => {
    if (state.kind === "insert") return [];
    if (state.table === employees) return people;
    if (state.table === leaveEntitlements) return rows;
    if (state.table === leaveApplicationDays) return days;
    return [];
  };
}

beforeEach(() => {
  db.roundTrips.length = 0;
});

describe("listQueue() round trips", () => {
  it("stays the same however many requests are pending", async () => {
    const counts: Record<number, string[]> = {};
    for (const size of [1, 2, 10]) {
      scenario(size);
      db.roundTrips.length = 0;
      const items = await listQueue(ADMIN, "all", TODAY);
      expect(items).toHaveLength(size);
      counts[size] = [...db.roundTrips];
    }
    // People, the entitlement check, then one batch for all balances
    // (the queue itself and the policies are loaded by mocked services).
    expect(counts[1]).toEqual(["select employees", "select leave_entitlements", "batch[2]"]);
    expect(counts[2]).toEqual(counts[1]);
    expect(counts[10]).toEqual(counts[1]);
  });
});

describe("listQueue() balances", () => {
  it("matches the per-request rules: approved days of the request's period, the request itself excluded", async () => {
    scenario(3);
    const items = await listQueue(ADMIN, "all", TODAY);
    // 13 entitled + 0 carried + 1.5 adjustments - 1.5 approved = 13; after this request (2 days) = 11.
    for (const item of items) expect(item.balance).toEqual({ available: 13, after: 11 });
  });

  it("gives no balance when the stored row is missing", async () => {
    scenario(1);
    const respond = db.respond;
    db.respond = (state) => (state.table === leaveEntitlements && state.kind === "select" ? [] : respond(state));
    const [item] = await listQueue(ADMIN, "all", TODAY);
    expect(item.balance).toBeNull();
  });
});

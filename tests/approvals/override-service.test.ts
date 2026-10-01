import { beforeEach, describe, expect, it, vi } from "vitest";

import { approvalOverrides } from "@/db/schema";

// overrideApplication() ("Revoke approval", "Approve anyway") with the
// database and the locked transaction replaced by fakes. The rules live in
// src/lib/approvals/override.ts and final-approval.ts (tested separately);
// this checks the service wiring: what is re-checked, written and recorded.

const state = vi.hoisted(() => ({
  application: null as Record<string, unknown> | null,
  dates: [] as { date: string }[],
  updated: [{ id: "app-1" }] as { id: string }[],
  sets: [] as Record<string, unknown>[],
  inserts: [] as { table: unknown; values: Record<string, unknown> }[],
}));

vi.mock("@/db", () => {
  const select = () => {
    const chain = {
      from: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      limit: async () => (state.application ? [state.application] : []),
    };
    return chain;
  };
  return { getDb: () => ({ select }) };
});

const tx = {
  select: () => ({ from: () => ({ where: async () => state.dates }) }),
  update: () => ({
    set: (values: Record<string, unknown>) => {
      state.sets.push(values);
      return { where: () => ({ returning: async () => state.updated }) };
    },
  }),
  insert: (table: unknown) => ({
    values: async (values: Record<string, unknown>) => {
      state.inserts.push({ table, values });
    },
  }),
};

const period = vi.hoisted(() => ({
  periodBalance: vi.fn(),
  bookedOn: vi.fn(),
  applyCarryForwardCorrection: vi.fn(),
}));
vi.mock("@/server/leave-period.service", () => ({
  runLocked: (_employeeId: string, work: (t: typeof tx) => unknown) => work(tx),
  periodBalance: period.periodBalance,
  periodBalances: vi.fn(),
  bookedOn: period.bookedOn,
  applyCarryForwardCorrection: period.applyCarryForwardCorrection,
}));

const ensureEntitlements = vi.hoisted(() => vi.fn());
vi.mock("@/server/entitlement.service", () => ({
  ensureEntitlements,
  ensureEntitlementsWith: vi.fn(),
  databaseEntitlementStore: {},
}));
vi.mock("@/server/employee-photo.service", () => ({ withPhotoUrls: vi.fn() }));
const notifyAfterCommit = vi.hoisted(() => vi.fn());
vi.mock("@/server/notification.service", () => ({ notifyAfterCommit }));
vi.mock("@/server/leave-application.service", () => ({ queryApplications: vi.fn() }));
vi.mock("@/server/approval-route.service", () => ({ waitingForCondition: vi.fn() }));
vi.mock("@/server/leave-policy.service", () => ({
  loadLeavePolicies: async () => [
    {
      leaveTypeId: "t-annual",
      code: "annual",
      name: "Annual Leave",
      periodBasis: "anniversary",
      entitlementTable: [{ serviceYear: 1, days: 14 }],
      fixedDays: null,
      carryForwardEnabled: true,
      carryForwardCap: 3,
      carryForwardExpiryMonths: null,
    },
  ],
}));

const { overrideApplication } = await import("@/server/approval.service");

const ADMIN = { id: "boss", role: "admin" as const };
const TODAY = "2026-10-01";
const APP_ID = "11111111-1111-4111-8111-111111111111";

function request(status: string) {
  state.application = {
    id: APP_ID,
    employeeId: "maria",
    leaveTypeId: "t-annual",
    status,
    totalDays: "2.0",
    employeeName: "Maria Santos",
    joinDate: "2020-01-15",
  };
}

beforeEach(() => {
  state.dates = [{ date: "2026-10-20" }, { date: "2026-10-21" }];
  state.updated = [{ id: APP_ID }];
  state.sets = [];
  state.inserts = [];
  period.periodBalance.mockReset().mockResolvedValue({ available: 5 });
  period.bookedOn.mockReset().mockResolvedValue([]);
  period.applyCarryForwardCorrection.mockReset().mockResolvedValue(0);
  ensureEntitlements.mockReset();
  notifyAfterCommit.mockReset();
});

describe("overrideApplication(): Revoke approval", () => {
  it("revokes approved leave, records the override and corrects the carry-forward", async () => {
    request("approved");
    const result = await overrideApplication(ADMIN, APP_ID, { action: "revoke", reason: "Approved by mistake" }, TODAY);
    expect(result).toEqual({ ok: true, status: "revoked" });
    expect(state.sets).toEqual([{ status: "revoked" }]);
    expect(state.inserts).toEqual([
      {
        table: approvalOverrides,
        values: {
          applicationId: APP_ID,
          kind: "approval_revoked",
          adminId: "boss",
          reason: "Approved by mistake",
          fromStatus: "approved",
          toStatus: "revoked",
        },
      },
    ]);
    expect(period.applyCarryForwardCorrection).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ event: "revocation", actorId: "boss", dates: ["2026-10-20", "2026-10-21"] }),
    );
    // Revoking only gives days back: no balance check.
    expect(period.periodBalance).not.toHaveBeenCalled();
    // The employee is emailed after the commit.
    expect(notifyAfterCommit).toHaveBeenCalledWith({ kind: "revoked", applicationId: APP_ID });
  });

  it("refuses anything but approved leave", async () => {
    request("pending");
    expect(await overrideApplication(ADMIN, APP_ID, { action: "revoke", reason: "Because" }, TODAY)).toMatchObject({
      ok: false,
      status: 409,
      error: "This request is still pending. Approve or reject it in Approvals.",
    });
    expect(state.inserts).toEqual([]);
  });
});

describe("overrideApplication(): Approve anyway", () => {
  it("approves a rejected request that still fits", async () => {
    request("rejected");
    const result = await overrideApplication(ADMIN, APP_ID, { action: "approve", reason: "Cover arranged" }, TODAY);
    expect(result).toEqual({ ok: true, status: "approved" });
    expect(ensureEntitlements).toHaveBeenCalled();
    // The request itself is left out of the balance and the overlap check.
    expect(period.periodBalance).toHaveBeenCalledWith(tx, expect.objectContaining({ excludeApplicationId: APP_ID }));
    expect(period.bookedOn).toHaveBeenCalledWith(tx, "maria", ["2026-10-20", "2026-10-21"], APP_ID);
    expect(state.sets[0]).toMatchObject({ status: "approved" });
    expect(state.sets[0].decidedAt).toBeInstanceOf(Date);
    expect(state.inserts[0].values).toMatchObject({
      kind: "rejection_overridden",
      fromStatus: "rejected",
      toStatus: "approved",
    });
    expect(period.applyCarryForwardCorrection).toHaveBeenCalledWith(tx, expect.objectContaining({ event: "approval" }));
    expect(notifyAfterCommit).toHaveBeenCalledWith({ kind: "approved_anyway", applicationId: APP_ID });
  });

  it("is blocked when the balance no longer fits", async () => {
    request("rejected");
    period.periodBalance.mockResolvedValue({ available: 1 });
    const result = await overrideApplication(ADMIN, APP_ID, { action: "approve", reason: "Cover arranged" }, TODAY);
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(result.ok ? "" : result.error).toContain("Not enough balance");
    expect(result.ok ? "" : result.error).toContain("Adjust the balance first, or leave it rejected.");
    expect(state.sets).toEqual([]);
    expect(state.inserts).toEqual([]);
    // Nothing changed, so nobody is emailed.
    expect(notifyAfterCommit).not.toHaveBeenCalled();
  });

  it("is blocked when other leave now covers the dates", async () => {
    request("rejected");
    period.bookedOn.mockResolvedValue([{ date: "2026-10-21", portion: 1 }]);
    const result = await overrideApplication(ADMIN, APP_ID, { action: "approve", reason: "Cover arranged" }, TODAY);
    expect(result.ok ? "" : result.error).toContain("already has other leave on 21 Oct 2026");
    expect(state.inserts).toEqual([]);
  });

  it("keeps a revoked request final", async () => {
    request("revoked");
    expect(await overrideApplication(ADMIN, APP_ID, { action: "approve", reason: "Changed my mind" }, TODAY)).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(state.sets).toEqual([]);
  });
});

describe("overrideApplication(): concurrency and access", () => {
  it("writes nothing when the status changed meanwhile", async () => {
    request("approved");
    state.updated = [];
    expect(await overrideApplication(ADMIN, APP_ID, { action: "revoke", reason: "Approved by mistake" }, TODAY)).toMatchObject({
      ok: false,
      status: 409,
      error: "This request has just changed. Please refresh the page and try again.",
    });
    expect(state.inserts).toEqual([]);
    expect(period.applyCarryForwardCorrection).not.toHaveBeenCalled();
  });

  it("is not found for anyone but an admin", async () => {
    request("approved");
    const manager = { id: "daniel", role: "manager" as const };
    expect(await overrideApplication(manager, APP_ID, { action: "revoke", reason: "Approved by mistake" }, TODAY)).toMatchObject({
      ok: false,
      status: 404,
    });
  });
});

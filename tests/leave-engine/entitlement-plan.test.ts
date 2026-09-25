import { describe, expect, it } from "vitest";

import { planEntitlement, previousPeriodFor, type PlanPolicy } from "@/lib/leave-engine/entitlement-plan";

const TABLE = [1, 2, 3, 4, 5, 6, 7, 8].map((serviceYear) => ({ serviceYear, days: serviceYear + 6 }));

const ANNUAL: PlanPolicy = {
  code: "annual",
  entitlementTable: TABLE,
  fixedDays: null,
  carryForwardEnabled: true,
  carryForwardCap: 3,
  carryForwardExpiryMonths: null,
  prorateOnJoin: false,
  prorateRounding: null,
};
const MC: PlanPolicy = { ...ANNUAL, code: "mc", entitlementTable: null, fixedDays: 14, carryForwardEnabled: false, carryForwardCap: null, prorateOnJoin: true };
const UNPAID: PlanPolicy = { ...MC, code: "unpaid", fixedDays: 7, prorateOnJoin: false };

describe("planEntitlement()", () => {
  it("annual: service year 3 with carry-forward from the previous row", () => {
    expect(
      planEntitlement({
        policy: ANNUAL,
        joinDate: "2023-06-15",
        onDate: "2025-09-01",
        previous: { entitled: 8, carriedForward: 0, adjustments: 0, used: 3 },
      }),
    ).toEqual({
      code: "annual",
      periodStart: "2025-06-15",
      periodEnd: "2026-06-14",
      entitledDays: 9,
      carriedForwardDays: 3,
      forfeitedDays: 2,
      carryForwardExpiresOn: null,
    });
  });

  it("annual: nothing carries forward without a previous row (no backfill)", () => {
    const row = planEntitlement({ policy: ANNUAL, joinDate: "2023-06-15", onDate: "2025-09-01", previous: null });
    expect(row).toMatchObject({ entitledDays: 9, carriedForwardDays: 0, forfeitedDays: 0 });
  });

  it("MC: prorated in the join year, full in later years", () => {
    expect(planEntitlement({ policy: MC, joinDate: "2026-07-01", onDate: "2026-09-25", previous: null })).toMatchObject({
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      entitledDays: 7,
    });
    expect(planEntitlement({ policy: MC, joinDate: "2026-07-01", onDate: "2027-01-01", previous: null })).toMatchObject({
      periodStart: "2027-01-01",
      entitledDays: 14,
    });
  });

  it("unpaid: never prorated", () => {
    expect(planEntitlement({ policy: UNPAID, joinDate: "2026-10-15", onDate: "2026-10-15", previous: null })).toMatchObject({
      entitledDays: 7,
    });
  });

  it("returns nothing before the join date", () => {
    for (const policy of [ANNUAL, MC, UNPAID]) {
      expect(planEntitlement({ policy, joinDate: "2026-11-01", onDate: "2026-10-31", previous: null })).toBeNull();
    }
  });
});

describe("previousPeriodFor()", () => {
  it("only applies to annual leave after service year 1", () => {
    expect(previousPeriodFor("annual", "2023-06-15", "2023-07-01")).toBeNull();
    expect(previousPeriodFor("mc", "2023-06-15", "2026-07-01")).toBeNull();
    expect(previousPeriodFor("annual", "2023-06-15", "2026-07-01")).toMatchObject({ start: "2025-06-15", end: "2026-06-14" });
  });
});

import { describe, expect, it } from "vitest";

import { fieldErrorsOf } from "@/validations/employee";
import { adjustmentSchema, policyUpdateSchema } from "@/validations/leave";

describe("adjustmentSchema", () => {
  const valid = { leaveType: "annual", days: "2.5", reason: "opening_balance", note: "Unused days from the old system" };

  it("accepts half-day steps, positive or negative, from form strings", () => {
    expect(adjustmentSchema.parse(valid).days).toBe(2.5);
    expect(adjustmentSchema.parse({ ...valid, days: -1.5 }).days).toBe(-1.5);
  });

  it("rejects 0, non-half steps, a missing note and an unknown reason", () => {
    const errors = (input: object) => {
      const result = adjustmentSchema.safeParse({ ...valid, ...input });
      return result.success ? {} : fieldErrorsOf(result.error);
    };
    expect(errors({ days: 0 }).days).toMatch(/cannot be 0/);
    expect(errors({ days: "1.25" }).days).toMatch(/0\.5/);
    expect(errors({ days: "" }).days).toBeDefined();
    expect(errors({ note: "  " }).note).toBeDefined();
    expect(errors({ reason: "bonus" }).reason).toBeDefined();
  });
});

describe("policyUpdateSchema", () => {
  const annual = {
    code: "annual",
    entitlementDays: ["7", "8", "9", "10", "11", "12", "13", "14"],
    eligibilityMonthsLocal: "3",
    eligibilityMonthsForeign: "0",
    advanceNoticeDaysForeign: "14",
    carryForwardEnabled: true,
    carryForwardCap: "3",
    carryForwardExpiryMonths: "",
  };

  it("accepts the seed annual policy", () => {
    const parsed = policyUpdateSchema.parse(annual);
    expect(parsed).toMatchObject({ code: "annual", carryForwardCap: 3, carryForwardExpiryMonths: null });
  });

  it("rejects an entitlement table that goes down", () => {
    const result = policyUpdateSchema.safeParse({ ...annual, entitlementDays: ["7", "8", "9", "8", "11", "12", "13", "14"] });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrorsOf(result.error).entitlementDays).toMatch(/cannot go down/);
  });

  it("requires a cap when carry-forward is on, and clears it when off", () => {
    expect(policyUpdateSchema.safeParse({ ...annual, carryForwardCap: "" }).success).toBe(false);
    expect(policyUpdateSchema.parse({ ...annual, carryForwardEnabled: false, carryForwardExpiryMonths: "6" })).toMatchObject({
      carryForwardCap: null,
      carryForwardExpiryMonths: null,
    });
  });

  it("accepts MC with undecided rounding (null)", () => {
    expect(
      policyUpdateSchema.parse({ code: "mc", fixedDays: "14", eligibilityMonthsLocal: 1, eligibilityMonthsForeign: 1, prorateRounding: "" }),
    ).toMatchObject({ code: "mc", fixedDays: 14, prorateRounding: null });
  });

  it("rejects out-of-range values", () => {
    expect(policyUpdateSchema.safeParse({ code: "unpaid", fixedDays: "61" }).success).toBe(false);
    expect(
      policyUpdateSchema.safeParse({ code: "mc", fixedDays: "14", eligibilityMonthsLocal: 30, eligibilityMonthsForeign: 1, prorateRounding: "up" })
        .success,
    ).toBe(false);
  });
});

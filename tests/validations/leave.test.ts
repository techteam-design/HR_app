import { describe, expect, it } from "vitest";

import { fieldErrorsOf } from "@/validations/employee";
import {
  adjustmentSchema,
  applicationSchema,
  cancelApplicationSchema,
  historyFilterSchema,
  policyUpdateSchema,
} from "@/validations/leave";

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

describe("applicationSchema", () => {
  const valid = {
    leaveType: "annual",
    startDate: "2026-10-12",
    endDate: "2026-10-14",
    dayType: "full",
    halfDaySlot: "",
    dates: ["2026-10-12", "2026-10-14"],
    reason: "  ",
  };

  it("accepts a request and normalises empty values to null", () => {
    expect(applicationSchema.parse(valid)).toMatchObject({ halfDaySlot: null, reason: null });
  });

  it("rejects impossible dates and bad slots", () => {
    expect(applicationSchema.safeParse({ ...valid, startDate: "2026-02-30" }).success).toBe(false);
    expect(applicationSchema.safeParse({ ...valid, dates: ["14/10/2026"] }).success).toBe(false);
    expect(applicationSchema.safeParse({ ...valid, dayType: "half", halfDaySlot: "evening" }).success).toBe(false);
  });

  it("caps the number of dates at 60", () => {
    const dates = Array.from({ length: 61 }, (_, i) => `2026-${String(10 + Math.floor(i / 30)).padStart(2, "0")}-${String((i % 30) + 1).padStart(2, "0")}`);
    expect(applicationSchema.safeParse({ ...valid, dates }).success).toBe(false);
  });
});

describe("cancelApplicationSchema and historyFilterSchema", () => {
  it("trims the note", () => {
    expect(cancelApplicationSchema.parse({ note: "  Duplicate " })).toEqual({ note: "Duplicate" });
    expect(cancelApplicationSchema.parse({})).toEqual({ note: null });
  });

  it("drops invalid filters", () => {
    expect(historyFilterSchema.parse({ type: "annual", status: "nope", year: "20x" })).toEqual({
      type: "annual",
      status: undefined,
      year: undefined,
    });
  });
});

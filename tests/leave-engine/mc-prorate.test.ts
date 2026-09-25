import { describe, expect, it } from "vitest";

import { PROVISIONAL_MC_ROUNDING, type ProrateRounding } from "@/lib/leave-engine/constants";
import { mcEntitlement, roundToHalfDay } from "@/lib/leave-engine/mc-prorate";

const YEAR_START = "2026-01-01";

function mc(joinDate: string, rounding: ProrateRounding | null = "nearest") {
  return mcEntitlement({ fullDays: 14, joinDate, periodStart: YEAR_START, prorateOnJoin: true, rounding }).days;
}

describe("mcEntitlement()", () => {
  it("gives the full 14 days to a January joiner (12 of 12 months)", () => {
    expect(mc("2026-01-20")).toBe(14);
  });

  it("gives 7 days to a July joiner (6 of 12 months)", () => {
    expect(mc("2026-07-01")).toBe(7);
    expect(mc("2026-07-31")).toBe(7);
  });

  it("gives 3.5 days to an October joiner (3 of 12 months)", () => {
    expect(mc("2026-10-15")).toBe(3.5);
  });

  it("rounds a December joiner's 1.17 days per the policy", () => {
    expect(mc("2026-12-01", "up")).toBe(1.5);
    expect(mc("2026-12-01", "down")).toBe(1);
    expect(mc("2026-12-01", "nearest")).toBe(1);
  });

  it("rounds a March joiner's 11.67 days per the policy", () => {
    expect(mc("2026-03-10", "up")).toBe(12);
    expect(mc("2026-03-10", "down")).toBe(11.5);
    expect(mc("2026-03-10", "nearest")).toBe(11.5);
  });

  it("rounds an August joiner's 5.83 days per the policy", () => {
    expect(mc("2026-08-10", "up")).toBe(6);
    expect(mc("2026-08-10", "down")).toBe(5.5);
    expect(mc("2026-08-10", "nearest")).toBe(6);
  });

  it("uses the provisional default (nearest) when rounding is not decided", () => {
    expect(PROVISIONAL_MC_ROUNDING).toBe("nearest");
    const result = mcEntitlement({
      fullDays: 14,
      joinDate: "2026-03-10",
      periodStart: YEAR_START,
      prorateOnJoin: true,
      rounding: null,
    });
    expect(result).toEqual({ days: 11.5, prorated: true, provisionalRounding: true });
  });

  it("gives the full 14 days to someone who joined in a previous year", () => {
    expect(mc("2025-11-20")).toBe(14);
    expect(mc("2019-03-01", null)).toBe(14);
  });

  it("does not prorate when the policy turns pro-rating off", () => {
    expect(
      mcEntitlement({ fullDays: 14, joinDate: "2026-10-15", periodStart: YEAR_START, prorateOnJoin: false, rounding: null })
        .days,
    ).toBe(14);
  });
});

describe("roundToHalfDay()", () => {
  it("keeps exact half days unchanged in every mode", () => {
    for (const mode of ["up", "down", "nearest"] as const) {
      expect(roundToHalfDay(7, mode)).toBe(7);
      expect(roundToHalfDay(3.5, mode)).toBe(3.5);
      expect(roundToHalfDay(7.000000000000001, mode)).toBe(7);
    }
  });
});

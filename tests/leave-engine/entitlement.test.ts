import { describe, expect, it } from "vitest";

import { annualEntitlement } from "@/lib/leave-engine/entitlement";

// Seed table: year 1 = 7 days, +1 per year, 14 days from year 8 onward.
const TABLE = [1, 2, 3, 4, 5, 6, 7, 8].map((serviceYear) => ({ serviceYear, days: serviceYear + 6 }));

describe("annualEntitlement()", () => {
  it("uses the table row for the service year", () => {
    expect(annualEntitlement(1, TABLE)).toBe(7);
    expect(annualEntitlement(7, TABLE)).toBe(13);
    expect(annualEntitlement(8, TABLE)).toBe(14);
  });

  it("uses the highest entry for any later year", () => {
    expect(annualEntitlement(12, TABLE)).toBe(14);
    expect(annualEntitlement(40, TABLE)).toBe(14);
  });

  it("does not depend on the table order", () => {
    expect(annualEntitlement(3, [...TABLE].reverse())).toBe(9);
  });

  it("rejects an empty table", () => {
    expect(() => annualEntitlement(1, [])).toThrow();
  });
});

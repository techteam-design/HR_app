import { describe, expect, it } from "vitest";

import { eligibleFrom, isEligible } from "@/lib/leave-engine/eligibility";

// Seed policies.
const ANNUAL = { eligibilityMonthsLocal: 3, eligibilityMonthsForeign: 0 };
const MC = { eligibilityMonthsLocal: 1, eligibilityMonthsForeign: 1 };
const UNPAID = { eligibilityMonthsLocal: 0, eligibilityMonthsForeign: 0 };

describe("eligibleFrom()", () => {
  it("annual: local staff after 3 months, foreign staff from the join date", () => {
    expect(eligibleFrom("2026-07-10", "local", ANNUAL)).toBe("2026-10-10");
    expect(eligibleFrom("2026-07-10", "foreign", ANNUAL)).toBe("2026-07-10");
  });

  it("MC: one month after joining, for local and foreign staff", () => {
    expect(eligibleFrom("2026-09-05", "local", MC)).toBe("2026-10-05");
    expect(eligibleFrom("2026-09-05", "foreign", MC)).toBe("2026-10-05");
  });

  it("unpaid: from the join date", () => {
    expect(eligibleFrom("2026-09-05", "local", UNPAID)).toBe("2026-09-05");
  });

  it("uses the month's last day when the day does not exist", () => {
    expect(eligibleFrom("2026-10-31", "local", MC)).toBe("2026-11-30");
    expect(eligibleFrom("2026-11-30", "local", ANNUAL)).toBe("2027-02-28");
  });
});

describe("isEligible()", () => {
  it("is false the day before and true on the eligible date", () => {
    const from = eligibleFrom("2026-07-10", "local", ANNUAL);
    expect(isEligible(from, "2026-10-09")).toBe(false);
    expect(isEligible(from, "2026-10-10")).toBe(true);
    expect(isEligible(from, "2026-10-11")).toBe(true);
  });
});

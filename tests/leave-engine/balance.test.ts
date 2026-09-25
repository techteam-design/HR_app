import { describe, expect, it } from "vitest";

import { availableShare, computeBalance, formatDays } from "@/lib/leave-engine/balance";

describe("computeBalance()", () => {
  it("adds entitlement, carry-forward and adjustments, then subtracts used days", () => {
    expect(
      computeBalance({ entitled: 9, carriedForward: 3, adjustments: 1.5, approvedDays: 4, pendingDays: 2 }),
    ).toEqual({
      entitled: 9,
      carriedForward: 3,
      adjustments: 1.5,
      total: 13.5,
      used: 4,
      pending: 2,
      available: 9.5,
      availableAfterPending: 7.5,
    });
  });

  it("subtracts negative adjustments", () => {
    expect(computeBalance({ entitled: 14, carriedForward: 0, adjustments: -2, approvedDays: 0, pendingDays: 0 }).available).toBe(12);
  });

  it("returns a negative balance as is", () => {
    const balance = computeBalance({ entitled: 7, carriedForward: 0, adjustments: -3, approvedDays: 5.5, pendingDays: 1 });
    expect(balance.available).toBe(-1.5);
    expect(balance.availableAfterPending).toBe(-2.5);
  });
});

describe("availableShare()", () => {
  it("is available ÷ total, kept between 0 and 1", () => {
    expect(availableShare({ available: 3.5, total: 7 })).toBe(0.5);
    expect(availableShare({ available: -1, total: 7 })).toBe(0);
    expect(availableShare({ available: 0, total: 0 })).toBe(0);
  });
});

describe("formatDays()", () => {
  it("prints whole and half days", () => {
    expect(formatDays(7)).toBe("7");
    expect(formatDays(3.5)).toBe("3.5");
    expect(formatDays(-1.5)).toBe("-1.5");
  });
});

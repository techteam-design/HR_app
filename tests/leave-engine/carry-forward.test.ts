import { describe, expect, it } from "vitest";

import { computeCarryForward } from "@/lib/leave-engine/carry-forward";

const POLICY: { carryForwardEnabled: boolean; carryForwardCap: number | null; carryForwardExpiryMonths: number | null } = {
  carryForwardEnabled: true,
  carryForwardCap: 3,
  carryForwardExpiryMonths: null,
};
const START = "2026-06-15";

function carry(previous: { entitled: number; carriedForward?: number; adjustments?: number; used: number }, policy = POLICY) {
  return computeCarryForward({
    previous: { carriedForward: 0, adjustments: 0, ...previous },
    policy,
    newPeriodStart: START,
  });
}

describe("computeCarryForward()", () => {
  it("carries everything under the cap", () => {
    expect(carry({ entitled: 9, used: 7 })).toEqual({ unused: 2, carried: 2, forfeited: 0, expiresOn: null });
  });

  it("carries exactly the cap", () => {
    expect(carry({ entitled: 9, used: 6 })).toEqual({ unused: 3, carried: 3, forfeited: 0, expiresOn: null });
  });

  it("forfeits days above the cap", () => {
    expect(carry({ entitled: 9, used: 1.5 })).toEqual({ unused: 7.5, carried: 3, forfeited: 4.5, expiresOn: null });
  });

  it("counts carried-forward days and adjustments of the previous period", () => {
    expect(carry({ entitled: 8, carriedForward: 3, adjustments: -2, used: 8 })).toEqual({
      unused: 1,
      carried: 1,
      forfeited: 0,
      expiresOn: null,
    });
  });

  it("clamps negative unused days to 0", () => {
    expect(carry({ entitled: 7, adjustments: -1, used: 8 })).toEqual({ unused: 0, carried: 0, forfeited: 0, expiresOn: null });
  });

  it("forfeits everything when carry-forward is disabled", () => {
    expect(carry({ entitled: 9, used: 7 }, { ...POLICY, carryForwardEnabled: false })).toEqual({
      unused: 2,
      carried: 0,
      forfeited: 2,
      expiresOn: null,
    });
  });

  it("sets the expiry date when the policy has one", () => {
    expect(carry({ entitled: 9, used: 7 }, { ...POLICY, carryForwardExpiryMonths: 3 }).expiresOn).toBe("2026-09-14");
  });

  it("sets no expiry date when nothing is carried", () => {
    expect(carry({ entitled: 9, used: 9 }, { ...POLICY, carryForwardExpiryMonths: 3 }).expiresOn).toBeNull();
  });
});

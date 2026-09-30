import { describe, expect, it } from "vitest";

import { carryForwardCorrection, carryForwardCorrectionNote } from "@/lib/leave-engine/carry-forward-correction";

const policy = { carryForwardEnabled: true, carryForwardCap: 3, carryForwardExpiryMonths: null };
const previous = (used: number) => ({ entitled: 9, carriedForward: 0, adjustments: 0, used });

describe("carryForwardCorrection()", () => {
  it("late approval lowers the carry-forward when the unused days drop below the cap", () => {
    // Stored at rollover: 9 − 7 = 2 unused, carried 2. A late approval of 1
    // day: 1 unused, carried 1 → correction −1.
    expect(
      carryForwardCorrection({ previous: previous(8), policy, newPeriodStart: "2026-10-01", storedCarried: 2, earlierCorrections: 0 }),
    ).toBe(-1);
  });

  it("late cancellation raises it (up to the cap)", () => {
    // Stored: 9 − 8 = 1 carried. Cancelling 4 approved days: 5 unused, carried 3 → +2.
    expect(
      carryForwardCorrection({ previous: previous(4), policy, newPeriodStart: "2026-10-01", storedCarried: 1, earlierCorrections: 0 }),
    ).toBe(2);
  });

  it("is 0 while the unused days stay above the cap", () => {
    // 9 − 2 = 7 unused, capped at 3 before and after one more day.
    expect(
      carryForwardCorrection({ previous: previous(3), policy, newPeriodStart: "2026-10-01", storedCarried: 3, earlierCorrections: 0 }),
    ).toBe(0);
  });

  it("counts earlier corrections, so repeated changes never double-correct", () => {
    // Stored 2, an earlier correction of −1 → effective 1. Now 0 unused → −1 more.
    expect(
      carryForwardCorrection({ previous: previous(9), policy, newPeriodStart: "2026-10-01", storedCarried: 2, earlierCorrections: -1 }),
    ).toBe(-1);
  });

  it("half days are exact", () => {
    expect(
      carryForwardCorrection({ previous: previous(7.5), policy, newPeriodStart: "2026-10-01", storedCarried: 2, earlierCorrections: 0 }),
    ).toBe(-0.5);
  });

  it("is 0 when carry-forward is off", () => {
    expect(
      carryForwardCorrection({
        previous: previous(1),
        policy: { ...policy, carryForwardEnabled: false },
        newPeriodStart: "2026-10-01",
        storedCarried: 0,
        earlierCorrections: 0,
      }),
    ).toBe(0);
  });

  it("the note names the event and the dates", () => {
    expect(carryForwardCorrectionNote("approval", "3 – 5 Sep 2026")).toBe(
      "Carry-forward recalculated after approval of annual leave 3 – 5 Sep 2026 in the previous leave year.",
    );
  });
});

import { describe, expect, it } from "vitest";

import { HALF_DAY_PORTION, halfDaySlotsFor, slotTime } from "@/lib/leave-engine/half-day";

describe("half-day slots", () => {
  it("uses the local staff hours", () => {
    expect(halfDaySlotsFor("local")).toEqual([
      { slot: "morning", label: "Morning", time: "8:30 AM – 12:30 PM" },
      { slot: "afternoon", label: "Afternoon", time: "1:30 PM – 5:30 PM" },
    ]);
  });

  it("uses the foreign staff hours", () => {
    expect(slotTime("foreign", "morning")).toBe("9:30 AM – 1:30 PM");
    expect(slotTime("foreign", "afternoon")).toBe("2:30 PM – 6:30 PM");
  });

  it("deducts half a day", () => {
    expect(HALF_DAY_PORTION).toBe(0.5);
  });
});

import { describe, expect, it } from "vitest";

import { addMonths, addYears } from "@/lib/leave-engine/iso-date";
import {
  anniversary,
  calendarPeriod,
  currentAnnualPeriod,
  nextPeriodStart,
  previousAnnualPeriod,
} from "@/lib/leave-engine/leave-year";

describe("currentAnnualPeriod()", () => {
  const join = "2023-06-15";

  it("is service year 1 from the join date", () => {
    expect(currentAnnualPeriod(join, "2023-06-15")).toEqual({ start: "2023-06-15", end: "2024-06-14", serviceYear: 1 });
    expect(currentAnnualPeriod(join, "2023-12-31")).toEqual({ start: "2023-06-15", end: "2024-06-14", serviceYear: 1 });
  });

  it("stays in the same year on the day before the anniversary", () => {
    expect(currentAnnualPeriod(join, "2026-06-14")).toEqual({ start: "2025-06-15", end: "2026-06-14", serviceYear: 3 });
  });

  it("starts the next service year on the exact anniversary day", () => {
    expect(currentAnnualPeriod(join, "2026-06-15")).toEqual({ start: "2026-06-15", end: "2027-06-14", serviceYear: 4 });
  });

  it("handles a date early in the calendar year (anniversary not reached yet)", () => {
    expect(currentAnnualPeriod(join, "2026-01-10")).toEqual({ start: "2025-06-15", end: "2026-06-14", serviceYear: 3 });
  });

  it("returns null before the join date", () => {
    expect(currentAnnualPeriod(join, "2023-06-14")).toBeNull();
  });

  describe("29 February joiner", () => {
    const leapJoin = "2024-02-29";

    it("has the anniversary on 28 February in non-leap years", () => {
      expect(anniversary(leapJoin, 1)).toBe("2025-02-28");
      expect(anniversary(leapJoin, 4)).toBe("2028-02-29");
    });

    it("rolls over on 28 February in a non-leap year", () => {
      expect(currentAnnualPeriod(leapJoin, "2025-02-27")).toEqual({ start: "2024-02-29", end: "2025-02-27", serviceYear: 1 });
      expect(currentAnnualPeriod(leapJoin, "2025-02-28")).toEqual({ start: "2025-02-28", end: "2026-02-27", serviceYear: 2 });
    });

    it("rolls over on 29 February in a leap year", () => {
      expect(currentAnnualPeriod(leapJoin, "2028-02-28")).toEqual({ start: "2027-02-28", end: "2028-02-28", serviceYear: 4 });
      expect(currentAnnualPeriod(leapJoin, "2028-02-29")).toEqual({ start: "2028-02-29", end: "2029-02-27", serviceYear: 5 });
    });
  });

  it("covers every day with exactly one period (no gaps or overlaps)", () => {
    const leapJoin = "2024-02-29";
    let previous = currentAnnualPeriod(leapJoin, "2024-02-29")!;
    for (let year = 2025; year <= 2033; year += 1) {
      const next = currentAnnualPeriod(leapJoin, nextPeriodStart(previous))!;
      expect(next.serviceYear).toBe(previous.serviceYear + 1);
      expect(next.start > previous.end).toBe(true);
      previous = next;
    }
  });
});

describe("previousAnnualPeriod()", () => {
  it("is null in service year 1", () => {
    expect(previousAnnualPeriod("2026-01-05", currentAnnualPeriod("2026-01-05", "2026-03-01")!)).toBeNull();
  });

  it("is the period just before the current one", () => {
    const current = currentAnnualPeriod("2023-06-15", "2026-07-01")!;
    expect(previousAnnualPeriod("2023-06-15", current)).toEqual({ start: "2025-06-15", end: "2026-06-14", serviceYear: 3 });
  });
});

describe("calendarPeriod()", () => {
  it("runs from 1 January to 31 December", () => {
    expect(calendarPeriod("2026-09-25")).toEqual({ start: "2026-01-01", end: "2026-12-31" });
    expect(calendarPeriod("2027-01-01")).toEqual({ start: "2027-01-01", end: "2027-12-31" });
  });
});

describe("iso-date helpers", () => {
  it("clamps month ends", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-10-31", 1)).toBe("2026-11-30");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(addYears("2024-02-29", 1)).toBe("2025-02-28");
  });
});

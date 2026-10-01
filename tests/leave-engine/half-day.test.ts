import { describe, expect, it } from "vitest";

import {
  DEFAULT_HALF_DAY_TIMINGS,
  formatClock,
  HALF_DAY_PORTION,
  halfDayLabel,
  halfDaySlotsFor,
  halfDayTimingIssues,
  slotTime,
  toClock,
  type HalfDayTimings,
} from "@/lib/leave-engine/half-day";

const withTimes = (change: (timings: HalfDayTimings) => void): HalfDayTimings => {
  const timings = structuredClone(DEFAULT_HALF_DAY_TIMINGS);
  change(timings);
  return timings;
};

describe("half-day slots", () => {
  it("uses the local staff hours by default", () => {
    expect(halfDaySlotsFor(DEFAULT_HALF_DAY_TIMINGS.local)).toEqual([
      { slot: "morning", label: "Morning", time: "8:30 AM – 12:30 PM", start: "08:30", end: "12:30" },
      { slot: "afternoon", label: "Afternoon", time: "1:30 PM – 5:30 PM", start: "13:30", end: "17:30" },
    ]);
  });

  it("uses the foreign staff hours by default", () => {
    expect(slotTime(DEFAULT_HALF_DAY_TIMINGS, "foreign", "morning")).toBe("9:30 AM – 1:30 PM");
    expect(slotTime(DEFAULT_HALF_DAY_TIMINGS, "foreign", "afternoon")).toBe("2:30 PM – 6:30 PM");
  });

  it("uses the configured times, not the defaults", () => {
    const timings = withTimes((t) => {
      t.local.morning = { start: "08:00", end: "12:00" };
    });
    expect(halfDaySlotsFor(timings.local)[0].time).toBe("8:00 AM – 12:00 PM");
    expect(slotTime(timings, "local", "morning")).toBe("8:00 AM – 12:00 PM");
  });

  it("deducts half a day", () => {
    expect(HALF_DAY_PORTION).toBe(0.5);
  });
});

describe("clock formatting", () => {
  it("formats 24-hour times for display", () => {
    expect(formatClock("08:30")).toBe("8:30 AM");
    expect(formatClock("12:00")).toBe("12:00 PM");
    expect(formatClock("13:05")).toBe("1:05 PM");
    expect(formatClock("00:15")).toBe("12:15 AM");
  });

  it("drops the seconds Postgres returns", () => {
    expect(toClock("08:30:00")).toBe("08:30");
    expect(formatClock("17:30:00")).toBe("5:30 PM");
  });

  it("labels a booked half day with its stored times", () => {
    expect(halfDayLabel("morning", "08:30", "12:30")).toBe("Morning, 8:30 AM – 12:30 PM");
    expect(halfDayLabel("afternoon", null, null)).toBe("Afternoon");
  });
});

describe("halfDayTimingIssues()", () => {
  it("accepts the defaults", () => {
    expect(halfDayTimingIssues(DEFAULT_HALF_DAY_TIMINGS)).toEqual([]);
  });

  it("accepts a morning that ends exactly when the afternoon starts", () => {
    const timings = withTimes((t) => {
      t.local.morning.end = "13:00";
      t.local.afternoon.start = "13:00";
    });
    expect(halfDayTimingIssues(timings)).toEqual([]);
  });

  it("refuses invalid times", () => {
    const timings = withTimes((t) => {
      t.foreign.morning.start = "25:00";
      t.foreign.afternoon.end = "";
    });
    expect(halfDayTimingIssues(timings)).toEqual([
      { path: "foreign.morning.start", message: "Enter a valid time" },
      { path: "foreign.afternoon.end", message: "Enter a valid time" },
    ]);
  });

  it("refuses a slot that does not end after it starts", () => {
    const timings = withTimes((t) => {
      t.local.afternoon = { start: "17:30", end: "17:30" };
    });
    expect(halfDayTimingIssues(timings)).toContainEqual({
      path: "local.afternoon.end",
      message: "Local afternoon must end after it starts",
    });
  });

  it("refuses an afternoon that starts before the morning ends", () => {
    const timings = withTimes((t) => {
      t.foreign.morning.end = "15:00";
    });
    expect(halfDayTimingIssues(timings)).toEqual([
      { path: "foreign.afternoon.start", message: "Foreign afternoon can't start before the morning ends" },
    ]);
  });
});

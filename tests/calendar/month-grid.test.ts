import { describe, expect, it } from "vitest";

import {
  groupByDate,
  monthLabel,
  monthRange,
  monthWeeks,
  parseMonth,
  peopleCountByDate,
  shiftMonth,
} from "@/lib/calendar/month-grid";

describe("month helpers", () => {
  it("parseMonth falls back to today's month for anything invalid", () => {
    expect(parseMonth("2026-10", "2026-09-29")).toBe("2026-10");
    expect(parseMonth("2026-13", "2026-09-29")).toBe("2026-09");
    expect(parseMonth(undefined, "2026-09-29")).toBe("2026-09");
  });

  it("monthRange, including February in a leap year", () => {
    expect(monthRange("2026-09")).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    expect(monthRange("2028-02")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });

  it("shiftMonth across year ends", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-09", 0)).toBe("2026-09");
  });

  it("monthLabel", () => {
    expect(monthLabel("2026-10")).toBe("October 2026");
  });
});

describe("monthWeeks()", () => {
  it("whole Monday-to-Sunday weeks covering the month", () => {
    // 1 Sep 2026 is a Tuesday; 30 Sep a Wednesday.
    const weeks = monthWeeks("2026-09");
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toEqual({ date: "2026-08-31", inMonth: false });
    expect(weeks[0][1]).toEqual({ date: "2026-09-01", inMonth: true });
    expect(weeks[4][6]).toEqual({ date: "2026-10-04", inMonth: false });
    for (const week of weeks) expect(week).toHaveLength(7);
  });

  it("a month starting on Monday has no leading days", () => {
    // 1 Jun 2026 is a Monday.
    expect(monthWeeks("2026-06")[0][0]).toEqual({ date: "2026-06-01", inMonth: true });
  });
});

describe("grouping", () => {
  const entries = [
    { date: "2026-10-12", employeeId: "priya" },
    { date: "2026-10-12", employeeId: "siti" },
    { date: "2026-10-13", employeeId: "priya" },
    // Two half days of the same person on one date count once.
    { date: "2026-10-12", employeeId: "priya" },
  ];

  it("groupByDate keeps the order", () => {
    expect(groupByDate(entries).get("2026-10-12")).toHaveLength(3);
    expect([...groupByDate(entries).keys()]).toEqual(["2026-10-12", "2026-10-13"]);
  });

  it("peopleCountByDate counts each person once per date", () => {
    expect(peopleCountByDate(entries)).toEqual(
      new Map([
        ["2026-10-12", 2],
        ["2026-10-13", 1],
      ]),
    );
  });
});

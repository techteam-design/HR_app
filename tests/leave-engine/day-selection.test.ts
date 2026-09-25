import { describe, expect, it } from "vitest";

import { computeBalance } from "@/lib/leave-engine/balance";
import {
  buildDayOptions,
  MAX_REQUEST_RANGE_DAYS,
  rangeLength,
  sumDaysInPeriod,
  totalDays,
  weekdayOf,
} from "@/lib/leave-engine/day-selection";

describe("buildDayOptions()", () => {
  it("lists every date in the range, all ticked, with weekday names", () => {
    expect(buildDayOptions({ start: "2026-10-12", end: "2026-10-18" })).toEqual([
      { date: "2026-10-12", weekday: "Mon", selected: true },
      { date: "2026-10-13", weekday: "Tue", selected: true },
      { date: "2026-10-14", weekday: "Wed", selected: true },
      { date: "2026-10-15", weekday: "Thu", selected: true },
      { date: "2026-10-16", weekday: "Fri", selected: true },
      { date: "2026-10-17", weekday: "Sat", selected: true },
      { date: "2026-10-18", weekday: "Sun", selected: true },
    ]);
  });

  it("handles a single date and month / year ends", () => {
    expect(buildDayOptions({ start: "2026-10-14", end: "2026-10-14" })).toHaveLength(1);
    expect(buildDayOptions({ start: "2026-12-30", end: "2027-01-02" }).map((o) => o.date)).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
    expect(buildDayOptions({ start: "2028-02-28", end: "2028-03-01" })).toHaveLength(3); // leap year
  });

  it("returns nothing for a reversed range or one longer than 60 days", () => {
    expect(buildDayOptions({ start: "2026-10-14", end: "2026-10-13" })).toEqual([]);
    expect(MAX_REQUEST_RANGE_DAYS).toBe(60);
    expect(buildDayOptions({ start: "2026-10-01", end: "2026-11-29" })).toHaveLength(60);
    expect(buildDayOptions({ start: "2026-10-01", end: "2026-11-30" })).toEqual([]);
  });
});

describe("rangeLength() and weekdayOf()", () => {
  it("counts both ends", () => {
    expect(rangeLength("2026-10-14", "2026-10-14")).toBe(1);
    expect(rangeLength("2026-10-01", "2026-10-31")).toBe(31);
    expect(rangeLength("2026-10-02", "2026-10-01")).toBe(0);
  });

  it("names the weekday", () => {
    expect(weekdayOf("2026-09-25")).toBe("Fri");
    expect(weekdayOf("2027-01-01")).toBe("Fri");
  });
});

describe("totalDays()", () => {
  it("counts a full day as 1 and a half day as 0.5", () => {
    expect(totalDays([])).toBe(0);
    expect(totalDays([{ date: "2026-10-14", portion: 0.5 }])).toBe(0.5);
    expect(
      totalDays([
        { date: "2026-10-12", portion: 1 },
        { date: "2026-10-13", portion: 1 },
        { date: "2026-10-15", portion: 1 },
      ]),
    ).toBe(3);
  });
});

describe("balances from per-date rows", () => {
  const period = { start: "2026-09-25", end: "2027-09-24" };
  const row = { entitled: 10, carriedForward: 2, adjustments: 0 };
  const balanceFrom = (days: { date: string; portion: number; status: string }[]) => {
    const usage = sumDaysInPeriod(days, period);
    return computeBalance({ ...row, approvedDays: usage.approved, pendingDays: usage.pending });
  };

  // Mon 12 – Fri 16 Oct with Wed 14 unticked (a rostered off day): 4 days.
  const submitted = ["2026-10-12", "2026-10-13", "2026-10-15", "2026-10-16"].map((date) => ({
    date,
    portion: 1,
    status: "pending",
  }));

  it("counts a submitted request as pending, only for its ticked dates", () => {
    const balance = balanceFrom(submitted);
    expect(balance.pending).toBe(4);
    expect(balance.available).toBe(12);
    expect(balance.availableAfterPending).toBe(8);
  });

  it("restores the balance when the request is cancelled", () => {
    const balance = balanceFrom(submitted.map((day) => ({ ...day, status: "cancelled" })));
    expect(balance.pending).toBe(0);
    expect(balance.availableAfterPending).toBe(12);
  });

  it("counts approved days as used, and a half day as 0.5", () => {
    const balance = balanceFrom([
      ...submitted.map((day) => ({ ...day, status: "approved" })),
      { date: "2026-11-02", portion: 0.5, status: "pending" },
      { date: "2026-11-03", portion: 1, status: "rejected" },
    ]);
    expect(balance.used).toBe(4);
    expect(balance.pending).toBe(0.5);
    expect(balance.availableAfterPending).toBe(7.5);
  });

  it("only counts dates inside the period", () => {
    expect(
      sumDaysInPeriod(
        [
          { date: "2026-09-24", portion: 1, status: "approved" },
          { date: "2026-09-25", portion: 1, status: "approved" },
          { date: "2027-09-24", portion: 1, status: "pending" },
          { date: "2027-09-25", portion: 1, status: "pending" },
        ],
        period,
      ),
    ).toEqual({ approved: 1, pending: 1 });
  });
});

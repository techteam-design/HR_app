import { describe, expect, it } from "vitest";

import {
  daysBetween,
  dueReminders,
  parseMinDaysOverride,
  reminderThreshold,
  waitingSince,
  type WaitingRequest,
} from "@/lib/approvals/reminders";
import { todayIsoInBrunei } from "@/lib/utils/dates";

const at = (iso: string) => new Date(iso);
const request = (overrides: Partial<WaitingRequest>): WaitingRequest => ({
  id: "a",
  approverId: "daniel",
  currentLevel: 1,
  submittedAt: at("2026-09-28T02:00:00Z"),
  level1ApprovedAt: null,
  reassignedAt: null,
  ...overrides,
});
const brunei = (time: Date) => todayIsoInBrunei(time);

describe("waitingSince()", () => {
  it("is the submission at level 1", () => {
    expect(waitingSince(request({}))).toEqual(at("2026-09-28T02:00:00Z"));
  });

  it("is the level 1 approval at level 2", () => {
    const since = waitingSince(request({ currentLevel: 2, level1ApprovedAt: at("2026-09-30T01:00:00Z") }));
    expect(since).toEqual(at("2026-09-30T01:00:00Z"));
  });

  it("restarts after a reassignment at the current level", () => {
    const since = waitingSince(request({ reassignedAt: at("2026-10-01T03:00:00Z") }));
    expect(since).toEqual(at("2026-10-01T03:00:00Z"));
  });
});

describe("daysBetween()", () => {
  it("counts whole calendar days", () => {
    expect(daysBetween("2026-09-28", "2026-10-01")).toBe(3);
    expect(daysBetween("2026-10-01", "2026-10-01")).toBe(0);
  });
});

describe("dueReminders()", () => {
  it("groups requests waiting at least N Brunei days by approver, longest first", () => {
    const due = dueReminders(
      [
        request({ id: "old", submittedAt: at("2026-09-27T02:00:00Z") }),
        request({ id: "fresh", submittedAt: at("2026-09-30T02:00:00Z") }),
        request({ id: "two", submittedAt: at("2026-09-29T02:00:00Z") }),
        request({ id: "other", approverId: "boss", submittedAt: at("2026-09-28T02:00:00Z") }),
      ],
      "2026-10-01",
      2,
      brunei,
    );
    expect(due.get("daniel")?.map((r) => [r.id, r.waitingDays])).toEqual([
      ["old", 4],
      ["two", 2],
    ]);
    expect(due.get("boss")?.map((r) => r.id)).toEqual(["other"]);
  });

  it("uses the Brunei date: 23:30 UTC on 28 Sep is already 29 Sep in Brunei", () => {
    const due = dueReminders([request({ submittedAt: at("2026-09-28T23:30:00Z") })], "2026-10-01", 3, brunei);
    expect(due.size).toBe(0);
  });

  it("a threshold of 0 (testing override only) includes a request submitted today", () => {
    const due = dueReminders([request({ submittedAt: at("2026-10-01T01:00:00Z") })], "2026-10-01", 0, brunei);
    expect(due.get("daniel")?.map((r) => r.waitingDays)).toEqual([0]);
  });
});

describe("reminderThreshold()", () => {
  it("the setting 0 means reminders are OFF, never 'remind immediately'", () => {
    expect(reminderThreshold(0, null)).toBeNull();
  });

  it("uses the setting when there is no override", () => {
    expect(reminderThreshold(2, null)).toBe(2);
  });

  it("a testing override replaces the setting, even when reminders are off", () => {
    expect(reminderThreshold(0, 0)).toBe(0);
    expect(reminderThreshold(5, 1)).toBe(1);
  });
});

describe("parseMinDaysOverride()", () => {
  it("absent means no override (also in production)", () => {
    expect(parseMinDaysOverride(null, false)).toEqual({ ok: true, minDays: null });
    expect(parseMinDaysOverride(null, true)).toEqual({ ok: true, minDays: null });
  });

  it("accepts whole numbers from 0 to 30 outside production", () => {
    expect(parseMinDaysOverride("0", false)).toEqual({ ok: true, minDays: 0 });
    expect(parseMinDaysOverride("30", false)).toEqual({ ok: true, minDays: 30 });
  });

  it("refuses anything else", () => {
    for (const raw of ["", "-1", "31", "1.5", "abc", "007"]) {
      expect(parseMinDaysOverride(raw, false).ok).toBe(false);
    }
  });

  it("is refused in production", () => {
    expect(parseMinDaysOverride("0", true)).toEqual({ ok: false, error: "minDays is only accepted outside production." });
  });
});

import { describe, expect, it } from "vitest";

import { addDays } from "@/lib/leave-engine/iso-date";
import { activityText, groupBy, nextDays, recentActivity, type ActivityEvent } from "@/lib/overview/activity";

const event = (overrides: Partial<ActivityEvent>): ActivityEvent => ({
  kind: "submitted",
  at: new Date("2026-09-29T02:00:00Z"),
  applicationId: "a",
  employeeName: "Priya Nair",
  actorName: null,
  level: null,
  code: "mc",
  startDate: "2026-09-30",
  endDate: "2026-09-30",
  ...overrides,
});

describe("activity", () => {
  it("recentActivity: newest first, limited", () => {
    const events = [
      event({ applicationId: "old", at: new Date("2026-09-01T00:00:00Z") }),
      event({ applicationId: "new", at: new Date("2026-09-28T00:00:00Z") }),
      event({ applicationId: "mid", at: new Date("2026-09-15T00:00:00Z") }),
    ];
    expect(recentActivity(events, 2).map((e) => e.applicationId)).toEqual(["new", "mid"]);
  });

  it("activityText includes the leave type and dates", () => {
    expect(activityText(event({}))).toBe("Priya Nair requested MC · 30 Sep");
    const annual = { code: "annual" as const, startDate: "2026-10-19", endDate: "2026-10-20" };
    expect(activityText(event({ ...annual, actorName: "Vaidik Dubey" }))).toBe(
      "Vaidik Dubey requested annual leave for Priya Nair · 19–20 Oct",
    );
    expect(
      activityText(event({ ...annual, kind: "approved", employeeName: "Maria Santos", actorName: "Daniel Tan", level: 1 })),
    ).toBe("Daniel Tan approved Maria Santos's annual leave · 19–20 Oct (level 1)");
    expect(activityText(event({ kind: "rejected", actorName: "Daniel Tan" }))).toBe(
      "Daniel Tan rejected Priya Nair's MC · 30 Sep",
    );
    expect(
      activityText(
        event({ kind: "cancelled", code: "unpaid", actorName: "Vaidik Dubey", employeeName: "Kelvin Ong", startDate: "2026-10-30", endDate: "2026-11-02" }),
      ),
    ).toBe("Vaidik Dubey cancelled Kelvin Ong's unpaid leave · 30 Oct – 2 Nov");
    expect(activityText(event({ kind: "approved" }))).toBe("Someone approved Priya Nair's MC · 30 Sep");
  });

  it("groupBy keeps first-seen order", () => {
    const groups = groupBy(["b1", "a1", "b2"], (value) => value[0]);
    expect([...groups]).toEqual([
      ["b", ["b1", "b2"]],
      ["a", ["a1"]],
    ]);
  });

  it("nextDays: the days after today", () => {
    expect(nextDays("2026-12-30", 3, addDays)).toEqual(["2026-12-31", "2027-01-01", "2027-01-02"]);
  });
});

describe("activityText() for overrides", () => {
  it("names the admin and what was overridden", () => {
    expect(
      activityText(event({ kind: "approval_revoked", actorName: "Vaidik Dubey", employeeName: "Maria Santos", code: "annual" })),
    ).toBe("Vaidik Dubey revoked the approval of Maria Santos's annual leave · 30 Sep");
    expect(activityText(event({ kind: "rejection_overridden", actorName: "Vaidik Dubey", employeeName: "Siti Rahman" }))).toBe(
      "Vaidik Dubey overrode the rejection of Siti Rahman's MC · 30 Sep",
    );
  });
});

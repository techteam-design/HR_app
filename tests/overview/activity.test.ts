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

  it("activityText", () => {
    expect(activityText(event({}))).toBe("Priya Nair requested leave");
    expect(activityText(event({ actorName: "Vaidik Dubey" }))).toBe("Vaidik Dubey requested leave for Priya Nair");
    expect(activityText(event({ kind: "approved", actorName: "Daniel Tan", level: 1 }))).toBe(
      "Daniel Tan approved Priya Nair's request (level 1)",
    );
    expect(activityText(event({ kind: "rejected", actorName: "Daniel Tan" }))).toBe(
      "Daniel Tan rejected Priya Nair's request",
    );
    expect(activityText(event({ kind: "cancelled", actorName: "Priya Nair" }))).toBe(
      "Priya Nair cancelled Priya Nair's leave",
    );
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

import { describe, expect, it } from "vitest";

import { finalApprovalIssues } from "@/lib/leave-engine/final-approval";

const base = {
  leaveType: "annual" as const,
  employeeName: "Priya Nair",
  requestedDays: 3,
  available: 5,
  clashingDates: [],
};

describe("finalApprovalIssues()", () => {
  it("passes when the request still fits and nothing overlaps", () => {
    expect(finalApprovalIssues(base)).toEqual([]);
    expect(finalApprovalIssues({ ...base, requestedDays: 5 })).toEqual([]);
  });

  it("blocks when the balance no longer covers the request", () => {
    const [issue] = finalApprovalIssues({ ...base, available: 2 });
    expect(issue).toContain("Not enough balance");
    expect(issue).toContain("2 days");
    expect(issue).toContain("3 days");
  });

  it("shows 0 (not a negative number) when the balance is already below zero", () => {
    expect(finalApprovalIssues({ ...base, available: -1 })[0]).toContain("has 0 days of annual leave");
  });

  it("half days are compared exactly", () => {
    expect(finalApprovalIssues({ ...base, requestedDays: 0.5, available: 0.5 })).toEqual([]);
    expect(finalApprovalIssues({ ...base, requestedDays: 1, available: 0.5 })).toHaveLength(1);
  });

  it("blocks when the period has no balance at all", () => {
    expect(finalApprovalIssues({ ...base, available: null })[0]).toContain("no annual leave balance");
  });

  it("blocks an overlap with the employee's other pending or approved leave", () => {
    const issues = finalApprovalIssues({ ...base, clashingDates: ["2026-10-14", "2026-10-12", "2026-10-14"] });
    expect(issues).toEqual([
      "Priya Nair already has other leave on 12 Oct 2026, 14 Oct 2026. Reject this request or cancel the other one.",
    ]);
  });

  it("reports both problems at once", () => {
    expect(finalApprovalIssues({ ...base, available: 0, clashingDates: ["2026-10-12"] })).toHaveLength(2);
  });
});

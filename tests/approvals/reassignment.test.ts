import { describe, expect, it } from "vitest";

import { planReassignment, type ReassignableApplication } from "@/lib/approvals/reassignment";
import type { ResolvedRoute } from "@/lib/approvals/route-resolution";

const pending: ReassignableApplication = {
  id: "app",
  status: "pending",
  currentLevel: 1,
  approvalMode: "two_level",
  level1ApproverId: "daniel",
  level2ApproverId: "admin",
};

const ok = (mode: "single" | "two_level", level1: string, level2: string | null = null): ResolvedRoute => ({
  status: "ok",
  source: "override",
  mode,
  level1ApproverId: level1,
  level2ApproverId: level2,
});

describe("planReassignment()", () => {
  it("at level 1 the request takes the whole new route", () => {
    expect(planReassignment(pending, ok("two_level", "chua", "admin"))).toEqual({
      applicationId: "app",
      expected: { currentLevel: 1, level1ApproverId: "daniel", level2ApproverId: "admin" },
      next: { approvalMode: "two_level", level1ApproverId: "chua", level2ApproverId: "admin" },
      records: [{ level: 1, fromApproverId: "daniel", toApproverId: "chua" }],
    });
  });

  it("at level 1, two levels to single removes level 2 (recorded)", () => {
    const plan = planReassignment(pending, ok("single", "chua"));
    expect(plan?.next).toEqual({ approvalMode: "single", level1ApproverId: "chua", level2ApproverId: null });
    expect(plan?.records).toEqual([
      { level: 1, fromApproverId: "daniel", toApproverId: "chua" },
      { level: 2, fromApproverId: "admin", toApproverId: null },
    ]);
  });

  it("at level 1, single to two levels adds level 2 (recorded)", () => {
    const single = { ...pending, approvalMode: "single" as const, level2ApproverId: null };
    expect(planReassignment(single, ok("two_level", "daniel", "admin"))?.records).toEqual([
      { level: 2, fromApproverId: null, toApproverId: "admin" },
    ]);
  });

  it("at level 2, level 1's decision stands and level 2 goes to the new route's final approver", () => {
    const atLevel2 = { ...pending, currentLevel: 2 };
    expect(planReassignment(atLevel2, ok("two_level", "chua", "boss"))).toMatchObject({
      next: { approvalMode: "two_level", level1ApproverId: "daniel", level2ApproverId: "boss" },
      records: [{ level: 2, fromApproverId: "admin", toApproverId: "boss" }],
    });
    // A single-level new route: its only approver takes level 2, even if it
    // is the person who approved level 1.
    expect(planReassignment(atLevel2, ok("single", "daniel"))).toMatchObject({
      next: { approvalMode: "two_level", level1ApproverId: "daniel", level2ApproverId: "daniel" },
      records: [{ level: 2, fromApproverId: "admin", toApproverId: "daniel" }],
    });
  });

  it("nothing to move when the approvers are unchanged", () => {
    expect(planReassignment(pending, ok("two_level", "daniel", "admin"))).toBeNull();
    expect(planReassignment({ ...pending, currentLevel: 2 }, ok("single", "admin"))).toBeNull();
  });

  it("an invalid new route moves nothing", () => {
    expect(
      planReassignment(pending, { status: "problem", source: "branch_default", problem: "own_approver", message: "" }),
    ).toBeNull();
    expect(planReassignment(pending, { status: "not_required" })).toBeNull();
  });

  it("decided requests never move", () => {
    for (const status of ["approved", "rejected", "cancelled"] as const) {
      expect(planReassignment({ ...pending, status }, ok("single", "chua"))).toBeNull();
    }
  });
});

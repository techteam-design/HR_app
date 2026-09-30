import { describe, expect, it } from "vitest";

import {
  currentApproverId,
  decisionRole,
  levelLabel,
  nextState,
  type DecisionApplication,
} from "@/lib/approvals/decision";

const single: DecisionApplication = {
  employeeId: "priya",
  status: "pending",
  approvalMode: "single",
  currentLevel: 1,
  level1ApproverId: "daniel",
  level2ApproverId: null,
};

const twoLevel: DecisionApplication = {
  ...single,
  employeeId: "maria",
  approvalMode: "two_level",
  level2ApproverId: "admin",
};

const atLevel2: DecisionApplication = { ...twoLevel, currentLevel: 2 };

describe("decisionRole()", () => {
  it("the current level's approver decides", () => {
    expect(decisionRole({ id: "daniel", isAdmin: false }, single)).toBe("assigned");
    expect(decisionRole({ id: "daniel", isAdmin: false }, twoLevel)).toBe("assigned");
    expect(decisionRole({ id: "admin", isAdmin: true }, atLevel2)).toBe("assigned");
  });

  it("the level 2 approver cannot decide while the request is at level 1", () => {
    expect(decisionRole({ id: "admin", isAdmin: false }, twoLevel)).toBeNull();
  });

  it("a level 1 approver cannot decide level 2", () => {
    expect(decisionRole({ id: "daniel", isAdmin: false }, atLevel2)).toBeNull();
  });

  it("an admin may decide any pending request at its current level", () => {
    expect(decisionRole({ id: "admin", isAdmin: true }, twoLevel)).toBe("admin");
    expect(decisionRole({ id: "other-admin", isAdmin: true }, atLevel2)).toBe("admin");
  });

  it("nobody decides their own request, and decided requests are closed", () => {
    expect(decisionRole({ id: "priya", isAdmin: true }, single)).toBeNull();
    expect(decisionRole({ id: "daniel", isAdmin: false }, { ...single, status: "approved" })).toBeNull();
    expect(decisionRole({ id: "admin", isAdmin: true }, { ...single, status: "cancelled" })).toBeNull();
  });

  it("someone unrelated cannot decide", () => {
    expect(decisionRole({ id: "chua", isAdmin: false }, single)).toBeNull();
  });
});

describe("nextState()", () => {
  it("single level: approve is the final approval", () => {
    expect(nextState(single, "approve")).toEqual({ status: "approved", currentLevel: 1, finalApproval: true });
  });

  it("two levels: level 1 approval moves to level 2 without using the balance", () => {
    expect(nextState(twoLevel, "approve")).toEqual({ status: "pending", currentLevel: 2, finalApproval: false });
  });

  it("two levels: level 2 approval is the final approval", () => {
    expect(nextState(atLevel2, "approve")).toEqual({ status: "approved", currentLevel: 2, finalApproval: true });
  });

  it("a level 1 rejection ends the request (it never reaches level 2)", () => {
    expect(nextState(twoLevel, "reject")).toEqual({ status: "rejected", currentLevel: 1, finalApproval: false });
    expect(nextState(atLevel2, "reject")).toEqual({ status: "rejected", currentLevel: 2, finalApproval: false });
  });
});

describe("labels and current approver", () => {
  it("levelLabel", () => {
    expect(levelLabel(single)).toBe("Level 1 of 1");
    expect(levelLabel(twoLevel)).toBe("Level 1 of 2");
    expect(levelLabel(atLevel2)).toBe("Level 2 of 2");
  });

  it("currentApproverId", () => {
    expect(currentApproverId(twoLevel)).toBe("daniel");
    expect(currentApproverId(atLevel2)).toBe("admin");
  });
});

import { describe, expect, it } from "vitest";

import { approvalProgress, type ProgressApplication } from "@/lib/approvals/progress";

const approvers = [
  { level: 1, id: "chua", name: "Chua Mei Ling" },
  { level: 2, id: "daniel", name: "Daniel Tan" },
];

const twoLevel = (overrides: Partial<ProgressApplication> = {}): ProgressApplication => ({
  status: "pending",
  approvalMode: "two_level",
  currentLevel: 1,
  approvers,
  ...overrides,
});

describe("approvalProgress()", () => {
  it("waiting at level 1", () => {
    expect(approvalProgress(twoLevel(), []).summary).toBe("Waiting for Chua Mei Ling (level 1)");
  });

  it("approved at level 1, waiting for level 2, with remarks", () => {
    const progress = approvalProgress(twoLevel({ currentLevel: 2 }), [
      { level: 1, action: "approved", approverId: "chua", approverName: "Chua Mei Ling", remarks: "Fine by me" },
    ]);
    expect(progress.summary).toBe("Approved by Chua Mei Ling (level 1), waiting for Daniel Tan (level 2)");
    expect(progress.lines[0]).toEqual({ text: "Approved by Chua Mei Ling (level 1)", remarks: "Fine by me" });
  });

  it("an admin deciding in place of the assigned approver is named as admin", () => {
    const progress = approvalProgress(twoLevel({ currentLevel: 2 }), [
      { level: 1, action: "approved", approverId: "vaidik", approverName: "Vaidik Dubey", remarks: null },
    ]);
    expect(progress.lines[0].text).toBe("Approved by Vaidik Dubey (admin, level 1)");
  });

  it("fully approved and rejected requests have no waiting line", () => {
    const approved = approvalProgress(twoLevel({ status: "approved", currentLevel: 2 }), [
      { level: 1, action: "approved", approverId: "chua", approverName: "Chua Mei Ling", remarks: null },
      { level: 2, action: "approved", approverId: "daniel", approverName: "Daniel Tan", remarks: null },
    ]);
    expect(approved.summary).toBe("Approved by Chua Mei Ling (level 1), approved by Daniel Tan (level 2)");

    const rejected = approvalProgress(twoLevel({ status: "rejected" }), [
      { level: 1, action: "rejected", approverId: "chua", approverName: "Chua Mei Ling", remarks: "Busy week" },
    ]);
    expect(rejected.summary).toBe("Rejected by Chua Mei Ling (level 1)");
    expect(rejected.lines[0].remarks).toBe("Busy week");
  });

  it("single level leaves the level out", () => {
    const single: ProgressApplication = {
      status: "approved",
      approvalMode: "single",
      currentLevel: 1,
      approvers: [{ level: 1, id: "daniel", name: "Daniel Tan" }],
    };
    expect(
      approvalProgress(single, [
        { level: 1, action: "approved", approverId: "daniel", approverName: "Daniel Tan", remarks: null },
      ]).summary,
    ).toBe("Approved by Daniel Tan");
    expect(
      approvalProgress(single, [
        { level: 1, action: "approved", approverId: "vaidik", approverName: "Vaidik Dubey", remarks: null },
      ]).summary,
    ).toBe("Approved by Vaidik Dubey (admin)");
    expect(approvalProgress({ ...single, status: "pending" }, []).summary).toBe("Waiting for Daniel Tan");
  });

  it("a cancelled request shows only its decisions", () => {
    expect(approvalProgress(twoLevel({ status: "cancelled" }), []).lines).toEqual([]);
  });
});

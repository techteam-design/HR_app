import { describe, expect, it } from "vitest";

import { checkRouteConfig } from "@/lib/approvals/route-config";
import type { ApproverInfo } from "@/lib/approvals/route-resolution";

const approvers = new Map<string, ApproverInfo>([
  ["admin", { role: "admin", status: "active" }],
  ["daniel", { role: "manager", status: "active" }],
  ["gone", { role: "manager", status: "inactive" }],
  ["priya", { role: "employee", status: "active" }],
]);

describe("checkRouteConfig()", () => {
  it("accepts a valid single-level and two-level route", () => {
    expect(
      checkRouteConfig({
        route: { mode: "single", level1ApproverId: "daniel", level2ApproverId: null },
        ownerId: null,
        approvers,
      }),
    ).toEqual({});
    expect(
      checkRouteConfig({
        route: { mode: "two_level", level1ApproverId: "daniel", level2ApproverId: "admin" },
        ownerId: "priya",
        approvers,
      }),
    ).toEqual({});
  });

  it("approvers must be active managers or admins", () => {
    const errors = checkRouteConfig({
      route: { mode: "two_level", level1ApproverId: "priya", level2ApproverId: "gone" },
      ownerId: null,
      approvers,
    });
    expect(errors.level1ApproverId).toBe("Choose an active manager or admin");
    expect(errors.level2ApproverId).toBe("Choose an active manager or admin");
  });

  it("two levels need a different level 2 approver", () => {
    expect(
      checkRouteConfig({
        route: { mode: "two_level", level1ApproverId: "daniel", level2ApproverId: null },
        ownerId: null,
        approvers,
      }).level2ApproverId,
    ).toBe("Choose the level 2 approver");
    expect(
      checkRouteConfig({
        route: { mode: "two_level", level1ApproverId: "daniel", level2ApproverId: "daniel" },
        ownerId: null,
        approvers,
      }).level2ApproverId,
    ).toBe("Level 1 and level 2 must be different people");
  });

  it("an override can never name its own employee", () => {
    expect(
      checkRouteConfig({
        route: { mode: "single", level1ApproverId: "daniel", level2ApproverId: null },
        ownerId: "daniel",
        approvers,
      }).level1ApproverId,
    ).toBe("Nobody can approve their own leave");
    expect(
      checkRouteConfig({
        route: { mode: "two_level", level1ApproverId: "admin", level2ApproverId: "daniel" },
        ownerId: "daniel",
        approvers,
      }).level2ApproverId,
    ).toBe("Nobody can approve their own leave");
  });

  it("a branch default may include someone of that branch (they get a warning instead)", () => {
    expect(
      checkRouteConfig({
        route: { mode: "single", level1ApproverId: "daniel", level2ApproverId: null },
        ownerId: null,
        approvers,
      }),
    ).toEqual({});
  });

  it("a single-level route has no level 2", () => {
    expect(
      checkRouteConfig({
        route: { mode: "single", level1ApproverId: "daniel", level2ApproverId: "admin" },
        ownerId: null,
        approvers,
      }).level2ApproverId,
    ).toBe("A single-level route has no level 2 approver");
  });
});

import { describe, expect, it } from "vitest";

import { overrideDecision, overrideFor } from "@/lib/approvals/override";
import type { ApplicationStatus } from "@/lib/leave-engine/cancellation";

const STATUSES: ApplicationStatus[] = ["pending", "approved", "rejected", "cancelled", "revoked"];

describe("overrideDecision()", () => {
  it("revokes approved leave only", () => {
    expect(overrideDecision({ status: "approved", action: "revoke", isAdmin: true })).toEqual({
      allowed: true,
      kind: "approval_revoked",
      from: "approved",
      to: "revoked",
    });
    for (const status of STATUSES.filter((s) => s !== "approved")) {
      expect(overrideDecision({ status, action: "revoke", isAdmin: true }).allowed).toBe(false);
    }
  });

  it("approves rejected requests only", () => {
    expect(overrideDecision({ status: "rejected", action: "approve", isAdmin: true })).toEqual({
      allowed: true,
      kind: "rejection_overridden",
      from: "rejected",
      to: "approved",
    });
    for (const status of STATUSES.filter((s) => s !== "rejected")) {
      expect(overrideDecision({ status, action: "approve", isAdmin: true }).allowed).toBe(false);
    }
  });

  it("keeps a revoked request final", () => {
    expect(overrideDecision({ status: "revoked", action: "approve", isAdmin: true })).toEqual({
      allowed: false,
      reason: "A revoked request is final. The employee can apply again, or you can apply on their behalf.",
    });
  });

  it("sends pending requests to the normal decision", () => {
    expect(overrideDecision({ status: "pending", action: "revoke", isAdmin: true })).toEqual({
      allowed: false,
      reason: "This request is still pending. Approve or reject it in Approvals.",
    });
  });

  it("is admin only", () => {
    expect(overrideDecision({ status: "approved", action: "revoke", isAdmin: false })).toEqual({
      allowed: false,
      reason: "Only an admin can override a decision.",
    });
  });
});

describe("overrideFor()", () => {
  it("offers Revoke approval on approved and Approve anyway on rejected, to admins only", () => {
    expect(overrideFor("approved", true)).toBe("revoke");
    expect(overrideFor("rejected", true)).toBe("approve");
    for (const status of ["pending", "cancelled", "revoked"] as const) expect(overrideFor(status, true)).toBeNull();
    for (const status of STATUSES) expect(overrideFor(status, false)).toBeNull();
  });
});

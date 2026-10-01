import { describe, expect, it } from "vitest";

import {
  APPROVED_OWNER_REFUSAL,
  canCancelAsApproverOrAdmin,
  cancelDecision,
  canEmployeeCancel,
} from "@/lib/leave-engine/cancellation";

const owner = { isOwner: true, isApprover: false, isAdmin: false } as const;
const approver = { isOwner: false, isApprover: true, isAdmin: false } as const;
const admin = { isOwner: false, isApprover: false, isAdmin: true } as const;
const stranger = { isOwner: false, isApprover: false, isAdmin: false } as const;

describe("cancelDecision(): the employee's own requests", () => {
  it("allows a pending request, including one already approved at level 1", () => {
    expect(cancelDecision({ ...owner, status: "pending" })).toEqual({ allowed: true, as: "owner", noteRequired: false });
  });

  it("refuses approved leave, even before it starts (Sprint 3 rule)", () => {
    expect(cancelDecision({ ...owner, status: "approved" })).toEqual({ allowed: false, reason: APPROVED_OWNER_REFUSAL });
  });

  it("refuses rejected and cancelled requests", () => {
    expect(cancelDecision({ ...owner, status: "rejected" })).toEqual({
      allowed: false,
      reason: "This request is already rejected.",
    });
    expect(cancelDecision({ ...owner, status: "cancelled" }).allowed).toBe(false);
  });
});

describe("cancelDecision(): approvers on the request's route", () => {
  it("cancel approved leave at any time, with a note", () => {
    expect(cancelDecision({ ...approver, status: "approved" })).toEqual({
      allowed: true,
      as: "approver",
      noteRequired: true,
    });
  });

  it("reject pending requests instead of cancelling them", () => {
    const decision = cancelDecision({ ...approver, status: "pending" });
    expect(decision.allowed).toBe(false);
    expect(decision).toMatchObject({ reason: expect.stringContaining("Reject") });
  });

  it("cannot cancel rejected or cancelled requests", () => {
    expect(cancelDecision({ ...approver, status: "rejected" }).allowed).toBe(false);
    expect(cancelDecision({ ...approver, status: "cancelled" }).allowed).toBe(false);
  });
});

describe("cancelDecision(): admins and others", () => {
  it("lets an admin cancel any pending or approved request, with a note", () => {
    expect(cancelDecision({ ...admin, status: "pending" })).toEqual({ allowed: true, as: "admin", noteRequired: true });
    expect(cancelDecision({ ...admin, status: "approved" })).toEqual({ allowed: true, as: "admin", noteRequired: true });
    expect(cancelDecision({ ...admin, status: "rejected" }).allowed).toBe(false);
  });

  it("refuses someone else's request for anyone else", () => {
    expect(cancelDecision({ ...stranger, status: "pending" })).toEqual({
      allowed: false,
      reason: "You can only cancel your own requests.",
    });
    expect(cancelDecision({ ...stranger, status: "approved" }).allowed).toBe(false);
  });
});

describe("button helpers", () => {
  it("canEmployeeCancel: pending only", () => {
    expect(canEmployeeCancel("pending")).toBe(true);
    expect(canEmployeeCancel("approved")).toBe(false);
    expect(canEmployeeCancel("rejected")).toBe(false);
    expect(canEmployeeCancel("cancelled")).toBe(false);
  });

  it("canCancelAsApproverOrAdmin: approved for approvers, pending too for admins", () => {
    expect(canCancelAsApproverOrAdmin("approved", false)).toBe(true);
    expect(canCancelAsApproverOrAdmin("pending", false)).toBe(false);
    expect(canCancelAsApproverOrAdmin("pending", true)).toBe(true);
    expect(canCancelAsApproverOrAdmin("rejected", true)).toBe(false);
  });
});

describe("cancelDecision(): revoked requests", () => {
  it("are final for everyone", () => {
    for (const actor of [owner, approver, admin]) {
      expect(cancelDecision({ ...actor, status: "revoked" })).toEqual({
        allowed: false,
        reason: "This request's approval was revoked.",
      });
    }
    expect(canEmployeeCancel("revoked")).toBe(false);
    expect(canCancelAsApproverOrAdmin("revoked", true)).toBe(false);
  });
});

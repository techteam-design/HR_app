import { describe, expect, it } from "vitest";

import { cancelDecision, canEmployeeCancel } from "@/lib/leave-engine/cancellation";

const TODAY = "2026-10-01";
const base = { today: TODAY, firstDate: "2026-10-12", isOwner: true, isAdmin: false } as const;

describe("cancelDecision(): the employee's own requests", () => {
  it("allows a pending request at any time, even after it started", () => {
    expect(cancelDecision({ ...base, status: "pending" })).toEqual({ allowed: true, asAdmin: false, noteRequired: false });
    expect(cancelDecision({ ...base, status: "pending", firstDate: "2026-09-20" }).allowed).toBe(true);
  });

  it("allows an approved request only before its first selected date", () => {
    expect(cancelDecision({ ...base, status: "approved", firstDate: "2026-10-02" }).allowed).toBe(true);
    const onTheDay = cancelDecision({ ...base, status: "approved", firstDate: TODAY });
    expect(onTheDay).toEqual({
      allowed: false,
      reason: "Approved leave can only be cancelled before its first day. Please contact HR.",
    });
    expect(cancelDecision({ ...base, status: "approved", firstDate: "2026-09-30" }).allowed).toBe(false);
  });

  it("refuses rejected and cancelled requests", () => {
    expect(cancelDecision({ ...base, status: "rejected" })).toEqual({
      allowed: false,
      reason: "This request is already rejected.",
    });
    expect(cancelDecision({ ...base, status: "cancelled" }).allowed).toBe(false);
  });
});

describe("cancelDecision(): admins and others", () => {
  const other = { ...base, isOwner: false };

  it("lets an admin cancel any pending or approved request, with a note", () => {
    const admin = { ...other, isAdmin: true };
    expect(cancelDecision({ ...admin, status: "pending" })).toEqual({ allowed: true, asAdmin: true, noteRequired: true });
    expect(cancelDecision({ ...admin, status: "approved", firstDate: "2026-09-01" })).toEqual({
      allowed: true,
      asAdmin: true,
      noteRequired: true,
    });
    expect(cancelDecision({ ...admin, status: "rejected" }).allowed).toBe(false);
  });

  it("needs the admin note even for the admin's own started approved leave", () => {
    const decision = cancelDecision({ ...base, isAdmin: true, status: "approved", firstDate: "2026-09-01" });
    expect(decision).toEqual({ allowed: true, asAdmin: true, noteRequired: true });
  });

  it("refuses someone else's request for non-admins", () => {
    expect(cancelDecision({ ...other, status: "pending" })).toEqual({
      allowed: false,
      reason: "You can only cancel your own requests.",
    });
  });
});

describe("canEmployeeCancel()", () => {
  it("matches the employee rules", () => {
    expect(canEmployeeCancel("pending", "2026-09-01", TODAY)).toBe(true);
    expect(canEmployeeCancel("approved", "2026-10-02", TODAY)).toBe(true);
    expect(canEmployeeCancel("approved", TODAY, TODAY)).toBe(false);
    expect(canEmployeeCancel("rejected", "2026-10-02", TODAY)).toBe(false);
    expect(canEmployeeCancel("cancelled", "2026-10-02", TODAY)).toBe(false);
  });
});

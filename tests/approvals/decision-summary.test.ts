import { describe, expect, it } from "vitest";

import { monthOf, pageOf, summariseDecisions } from "@/lib/approvals/decision-summary";

describe("summariseDecisions()", () => {
  it("counts decisions, overrides and waiting requests per approver, sorted by name", () => {
    const rows = summariseDecisions({
      approvers: [
        { id: "daniel", name: "Daniel Tan" },
        { id: "boss", name: "Admin Owner" },
        { id: "idle", name: "Zara Idle" },
      ],
      names: new Map([["former", "Former Manager"]]),
      decisions: [
        { approverId: "daniel", action: "approved" },
        { approverId: "daniel", action: "approved" },
        { approverId: "daniel", action: "rejected" },
        { approverId: "boss", action: "approved" },
        { approverId: "former", action: "rejected" },
      ],
      overrides: [{ adminId: "boss" }, { adminId: "boss" }],
      waiting: [
        { approverId: "daniel", count: 3 },
        { approverId: "boss", count: 1 },
      ],
    });
    expect(rows).toEqual([
      { id: "boss", name: "Admin Owner", approved: 1, rejected: 0, overrides: 2, waiting: 1 },
      { id: "daniel", name: "Daniel Tan", approved: 2, rejected: 1, overrides: 0, waiting: 3 },
      // Not a current approver, but decided in the range.
      { id: "former", name: "Former Manager", approved: 0, rejected: 1, overrides: 0, waiting: 0 },
      // A current approver with nothing to count still gets a row.
      { id: "idle", name: "Zara Idle", approved: 0, rejected: 0, overrides: 0, waiting: 0 },
    ]);
  });
});

describe("monthOf()", () => {
  it("is the month containing today", () => {
    expect(monthOf("2026-10-01")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(monthOf("2028-02-15")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
});

describe("pageOf()", () => {
  const items = Array.from({ length: 45 }, (_, i) => i);

  it("returns the requested page", () => {
    expect(pageOf(items, 2)).toEqual({ items: items.slice(20, 40), page: 2, pages: 3, total: 45 });
  });

  it("clamps to the pages that exist", () => {
    expect(pageOf(items, 9).page).toBe(3);
    expect(pageOf(items, 9).items).toEqual(items.slice(40));
    expect(pageOf([], 4)).toEqual({ items: [], page: 1, pages: 1, total: 0 });
  });
});

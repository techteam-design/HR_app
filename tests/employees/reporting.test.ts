import { describe, expect, it } from "vitest";

import { wouldCreateReportingCycle, type ManagerMap } from "@/lib/employees/reporting";

// Chain: E reports to D, D to C, C to B, B to A, A to nobody. X is separate.
const chain: ManagerMap = new Map([
  ["A", null],
  ["B", "A"],
  ["C", "B"],
  ["D", "C"],
  ["E", "D"],
  ["X", null],
]);

describe("wouldCreateReportingCycle()", () => {
  it("allows no manager", () => {
    expect(wouldCreateReportingCycle("C", null, chain)).toBe(false);
  });

  it("blocks reporting to yourself", () => {
    expect(wouldCreateReportingCycle("A", "A", chain)).toBe(true);
  });

  it("blocks a direct two-person loop (A reports to B while B reports to A)", () => {
    expect(wouldCreateReportingCycle("A", "B", chain)).toBe(true);
  });

  it("blocks a longer loop (A reports to E, E is under A)", () => {
    expect(wouldCreateReportingCycle("A", "E", chain)).toBe(true);
    expect(wouldCreateReportingCycle("B", "D", chain)).toBe(true);
  });

  it("allows moving someone under an unrelated manager", () => {
    expect(wouldCreateReportingCycle("C", "X", chain)).toBe(false);
  });

  it("allows moving someone higher up their own chain", () => {
    expect(wouldCreateReportingCycle("E", "A", chain)).toBe(false);
  });

  it("allows a manager who is not in the map (e.g. a new employee)", () => {
    expect(wouldCreateReportingCycle("NEW", "E", chain)).toBe(false);
  });

  it("terminates on an existing loop elsewhere in the data", () => {
    const broken: ManagerMap = new Map([
      ["P", "Q"],
      ["Q", "P"],
      ["Z", null],
    ]);
    expect(wouldCreateReportingCycle("Z", "P", broken)).toBe(false);
  });
});

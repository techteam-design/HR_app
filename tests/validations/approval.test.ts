import { describe, expect, it } from "vitest";

import {
  bulkRouteSchema,
  calendarFilterSchema,
  decisionSchema,
  queueViewSchema,
  routeSchema,
  setupFilterSchema,
} from "@/validations/approval";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("routeSchema", () => {
  it("single level drops any level 2", () => {
    expect(routeSchema.parse({ mode: "single", level1ApproverId: A, level2ApproverId: B })).toEqual({
      mode: "single",
      level1ApproverId: A,
      level2ApproverId: null,
    });
  });

  it("two levels need a different level 2", () => {
    expect(routeSchema.safeParse({ mode: "two_level", level1ApproverId: A, level2ApproverId: "" }).success).toBe(false);
    expect(routeSchema.safeParse({ mode: "two_level", level1ApproverId: A, level2ApproverId: A }).success).toBe(false);
    expect(routeSchema.parse({ mode: "two_level", level1ApproverId: A, level2ApproverId: B }).level2ApproverId).toBe(B);
  });

  it("rejects a bad mode or id", () => {
    expect(routeSchema.safeParse({ mode: "three", level1ApproverId: A }).success).toBe(false);
    expect(routeSchema.safeParse({ mode: "single", level1ApproverId: "x" }).success).toBe(false);
  });
});

describe("decisionSchema", () => {
  it("remarks are optional to approve and trimmed", () => {
    expect(decisionSchema.parse({ action: "approve", remarks: "  ", expectedLevel: 1 }).remarks).toBeNull();
    expect(decisionSchema.parse({ action: "approve", remarks: " ok ", expectedLevel: 2 }).remarks).toBe("ok");
  });

  it("remarks are required to reject", () => {
    const result = decisionSchema.safeParse({ action: "reject", remarks: " ", expectedLevel: 1 });
    expect(result.success).toBe(false);
    expect(decisionSchema.safeParse({ action: "reject", remarks: "Too busy", expectedLevel: 1 }).success).toBe(true);
  });

  it("the expected level is 1 or 2", () => {
    expect(decisionSchema.safeParse({ action: "approve", expectedLevel: 3 }).success).toBe(false);
  });
});

describe("bulkRouteSchema", () => {
  it("set needs a route; ids are de-duplicated", () => {
    const parsed = bulkRouteSchema.parse({
      action: "set",
      employeeIds: [A, A, B],
      route: { mode: "single", level1ApproverId: A },
    });
    expect(parsed.employeeIds).toEqual([A, B]);
  });

  it("reset needs at least one employee", () => {
    expect(bulkRouteSchema.safeParse({ action: "reset", employeeIds: [] }).success).toBe(false);
  });
});

describe("query filters", () => {
  it("invalid values mean 'all'", () => {
    expect(setupFilterSchema.parse({ departmentId: "x", problems: "yes" })).toEqual({
      departmentId: undefined,
      branchId: undefined,
      problems: false,
    });
    expect(setupFilterSchema.parse({ problems: "1" }).problems).toBe(true);
    expect(calendarFilterSchema.parse({ month: "2026-13" }).month).toBeUndefined();
    expect(calendarFilterSchema.parse({ branchId: "all" }).branchId).toBe("all");
    expect(calendarFilterSchema.parse({ branchId: "nope" }).branchId).toBeUndefined();
    expect(queueViewSchema.parse("bogus")).toBe("mine");
  });
});

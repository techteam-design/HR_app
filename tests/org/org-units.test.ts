import { describe, expect, it } from "vitest";

import {
  checkUnitDeactivation,
  findNameConflict,
  normalizeUnitName,
  unitNameKey,
} from "@/lib/org/org-units";
import { createOrgUnitSchema, updateOrgUnitSchema } from "@/validations/department";
import { createBranchSchema } from "@/validations/branch";

describe("normalizeUnitName()", () => {
  it("trims and collapses repeated spaces", () => {
    expect(normalizeUnitName("  Front   desk ")).toBe("Front desk");
    expect(normalizeUnitName("Spa\tTherapy")).toBe("Spa Therapy");
  });

  it("keeps the admin's capitalisation", () => {
    expect(normalizeUnitName("HQ Admin")).toBe("HQ Admin");
  });
});

describe("unitNameKey() / findNameConflict()", () => {
  const existing = [
    { id: "1", name: "Front desk" },
    { id: "2", name: "Spa Therapy" },
  ];

  it("treats names that differ only in case or spacing as the same", () => {
    expect(unitNameKey("front  DESK ")).toBe(unitNameKey("Front desk"));
    expect(findNameConflict("front desk", existing)).toEqual({ id: "1", name: "Front desk" });
    expect(findNameConflict(" SPA   therapy", existing)?.id).toBe("2");
  });

  it("allows a new, different name", () => {
    expect(findNameConflict("Front office", existing)).toBeNull();
  });

  it("lets a unit change only its own capitalisation when renaming", () => {
    expect(findNameConflict("FRONT DESK", existing, "1")).toBeNull();
  });

  it("still blocks renaming to another unit's name", () => {
    expect(findNameConflict("front desk", existing, "2")?.id).toBe("1");
  });
});

describe("checkUnitDeactivation()", () => {
  const staff = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ fullName: `Person ${i + 1}`, employeeCode: `E${i + 1}` }));

  it("allows deactivation when nobody active is assigned", () => {
    expect(checkUnitDeactivation([])).toEqual({ allowed: true });
  });

  it("blocks deactivation and names who is still assigned", () => {
    expect(checkUnitDeactivation(staff(2))).toEqual({
      allowed: false,
      details: ["Person 1 (E1)", "Person 2 (E2)"],
    });
  });

  it("names exactly 10 without an 'and more' line", () => {
    const result = checkUnitDeactivation(staff(10));
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.details).toHaveLength(10);
      expect(result.details.at(-1)).toBe("Person 10 (E10)");
    }
  });

  it("names the first 10, then 'and N more'", () => {
    const result = checkUnitDeactivation(staff(13));
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.details).toHaveLength(11);
      expect(result.details[9]).toBe("Person 10 (E10)");
      expect(result.details[10]).toBe("and 3 more");
    }
  });
});

describe("department and branch name validation", () => {
  it("normalises the name", () => {
    expect(createOrgUnitSchema.parse({ name: "  Front   desk  " })).toEqual({ name: "Front desk" });
  });

  it("needs 2 to 60 characters after trimming", () => {
    expect(createOrgUnitSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(createOrgUnitSchema.safeParse({ name: " A " }).success).toBe(false);
    expect(createOrgUnitSchema.safeParse({ name: "HQ" }).success).toBe(true);
    expect(createOrgUnitSchema.safeParse({ name: "x".repeat(60) }).success).toBe(true);
    expect(createOrgUnitSchema.safeParse({ name: "x".repeat(61) }).success).toBe(false);
  });

  it("gives a clear message for a missing name", () => {
    const result = createOrgUnitSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("Name is required");
  });

  it("branches use the same rules", () => {
    expect(createBranchSchema.parse({ name: " Orchard  Road " })).toEqual({ name: "Orchard Road" });
    expect(createBranchSchema.safeParse({ name: "A" }).success).toBe(false);
  });

  it("an update must rename, change status, or both", () => {
    expect(updateOrgUnitSchema.safeParse({}).success).toBe(false);
    expect(updateOrgUnitSchema.parse({ isActive: false })).toEqual({ isActive: false });
    expect(updateOrgUnitSchema.parse({ name: " Spa " })).toEqual({ name: "Spa" });
    expect(updateOrgUnitSchema.safeParse({ isActive: "no" }).success).toBe(false);
  });
});

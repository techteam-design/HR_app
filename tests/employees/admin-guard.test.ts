import { describe, expect, it } from "vitest";

import { checkAdminChange } from "@/lib/employees/admin-guard";

describe("checkAdminChange()", () => {
  it("blocks an admin deactivating themself", () => {
    expect(
      checkAdminChange({
        actorId: "a1",
        targetId: "a1",
        activeAdminIds: ["a1", "a2"],
        next: { role: "admin", status: "inactive" },
      }),
    ).toMatch(/cannot deactivate your own/);
  });

  it("blocks an admin removing their own admin role", () => {
    expect(
      checkAdminChange({
        actorId: "a1",
        targetId: "a1",
        activeAdminIds: ["a1", "a2"],
        next: { role: "manager", status: "active" },
      }),
    ).toMatch(/cannot remove your own admin role/);
  });

  it("allows an admin editing their own profile while staying admin", () => {
    expect(
      checkAdminChange({
        actorId: "a1",
        targetId: "a1",
        activeAdminIds: ["a1"],
        next: { role: "admin", status: "active" },
      }),
    ).toBeNull();
  });

  it("blocks removing the last active admin (role change)", () => {
    expect(
      checkAdminChange({
        actorId: "x",
        targetId: "a1",
        activeAdminIds: ["a1"],
        next: { role: "employee", status: "active" },
      }),
    ).toMatch(/At least one active admin/);
  });

  it("blocks deactivating the last active admin", () => {
    expect(
      checkAdminChange({
        actorId: "x",
        targetId: "a1",
        activeAdminIds: ["a1"],
        next: { role: "admin", status: "inactive" },
      }),
    ).toMatch(/At least one active admin/);
  });

  it("allows demoting an admin when another active admin remains", () => {
    expect(
      checkAdminChange({
        actorId: "a2",
        targetId: "a1",
        activeAdminIds: ["a1", "a2"],
        next: { role: "manager", status: "active" },
      }),
    ).toBeNull();
  });

  it("treats probation admins as active", () => {
    expect(
      checkAdminChange({
        actorId: "a2",
        targetId: "a1",
        activeAdminIds: ["a1", "a2"],
        next: { role: "admin", status: "probation" },
      }),
    ).toBeNull();
  });

  it("allows changes to non-admins", () => {
    expect(
      checkAdminChange({
        actorId: "a1",
        targetId: "e1",
        activeAdminIds: ["a1"],
        next: { role: "employee", status: "inactive" },
      }),
    ).toBeNull();
  });

  it("allows promoting someone to admin", () => {
    expect(
      checkAdminChange({
        actorId: "a1",
        targetId: "e1",
        activeAdminIds: ["a1"],
        next: { role: "admin", status: "active" },
      }),
    ).toBeNull();
  });
});

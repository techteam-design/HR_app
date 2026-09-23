import { describe, expect, it } from "vitest";

import {
  createEmployeeSchema,
  employeeListQuerySchema,
  fieldErrorsOf,
  photoUploadRequestSchema,
  updateEmployeeSchema,
} from "@/validations/employee";

const TODAY = "2026-09-23";
const DEPT = "3f1c2a4e-8b7d-4c1a-9e2f-0a1b2c3d4e5f";
const BRANCH = "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d";
const MANAGER = "7c8d9e0f-1a2b-4c3d-8e4f-5a6b7c8d9e0f";

const valid = {
  fullName: "  Maria Santos ",
  employeeCode: " SBC-010 ",
  email: "  Maria.Santos@Example.TEST ",
  phone: "",
  dateOfBirth: "1991-03-30",
  gender: "female",
  joinDate: "2023-09-23",
  designation: "Beauty Therapist",
  departmentId: DEPT,
  branchId: BRANCH,
  classification: "foreign",
  reportingManagerId: MANAGER,
  role: "employee",
  status: "active",
};

describe("createEmployeeSchema()", () => {
  const schema = createEmployeeSchema(TODAY);

  it("accepts a valid employee and normalises it", () => {
    const result = schema.parse(valid);
    expect(result.fullName).toBe("Maria Santos");
    expect(result.employeeCode).toBe("SBC-010");
    expect(result.email).toBe("maria.santos@example.test");
    expect(result.phone).toBeNull();
    expect(result.createLogin).toBe(true);
  });

  it("turns an empty reporting manager into null", () => {
    expect(schema.parse({ ...valid, reportingManagerId: "" }).reportingManagerId).toBeNull();
  });

  it("respects createLogin: false", () => {
    expect(schema.parse({ ...valid, createLogin: false }).createLogin).toBe(false);
  });

  it("reports clear field errors", () => {
    const result = schema.safeParse({
      ...valid,
      fullName: " ",
      email: "not-an-email",
      departmentId: "",
      gender: "other",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const errors = fieldErrorsOf(result.error);
    expect(errors.fullName).toBe("Full name is required");
    expect(errors.email).toBe("Enter a valid email address");
    expect(errors.departmentId).toBe("Choose a department");
    expect(errors.gender).toBe("Choose a gender");
  });

  it("requires employees to be at least 16", () => {
    const result = schema.safeParse({ ...valid, dateOfBirth: "2010-09-24" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrorsOf(result.error).dateOfBirth).toMatch(/at least 16/);
    }
    expect(schema.safeParse({ ...valid, dateOfBirth: "2010-09-23" }).success).toBe(true);
  });

  it("blocks a join date more than 90 days ahead", () => {
    expect(schema.safeParse({ ...valid, joinDate: "2026-12-22" }).success).toBe(true);
    const result = schema.safeParse({ ...valid, joinDate: "2026-12-23" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrorsOf(result.error).joinDate).toMatch(/90 days/);
    }
  });

  it("rejects impossible dates", () => {
    const result = schema.safeParse({ ...valid, joinDate: "2026-02-30" });
    expect(result.success).toBe(false);
  });

  it("does not allow setting status to inactive", () => {
    expect(schema.safeParse({ ...valid, status: "inactive" }).success).toBe(false);
  });
});

describe("updateEmployeeSchema()", () => {
  const schema = updateEmployeeSchema(TODAY);

  it("accepts the same profile fields", () => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  it("ignores createLogin (not part of an edit)", () => {
    const result = schema.parse({ ...valid, createLogin: true });
    expect("createLogin" in result).toBe(false);
  });

  it("requires every profile field", () => {
    const { designation: _designation, ...missing } = valid;
    void _designation;
    expect(schema.safeParse(missing).success).toBe(false);
  });
});

describe("employeeListQuerySchema", () => {
  it("defaults to name ascending, page 1", () => {
    expect(employeeListQuerySchema.parse({})).toMatchObject({ sort: "name", dir: "asc", page: 1 });
  });

  it("drops empty filters and falls back on bad values", () => {
    const result = employeeListQuerySchema.parse({ q: "", status: "", sort: "salary", page: "-3" });
    expect(result.q).toBeUndefined();
    expect(result.status).toBeUndefined();
    expect(result.sort).toBe("name");
    expect(result.page).toBe(1);
  });
});

describe("photoUploadRequestSchema", () => {
  const base = { employeeId: DEPT, contentType: "image/png", size: 1000 };

  it("accepts JPEG, PNG and WebP up to 2 MB", () => {
    for (const contentType of ["image/jpeg", "image/png", "image/webp"]) {
      expect(photoUploadRequestSchema.safeParse({ ...base, contentType }).success).toBe(true);
    }
    expect(photoUploadRequestSchema.safeParse({ ...base, size: 2 * 1024 * 1024 }).success).toBe(true);
  });

  it("rejects other types and files over 2 MB", () => {
    expect(photoUploadRequestSchema.safeParse({ ...base, contentType: "image/gif" }).success).toBe(false);
    expect(photoUploadRequestSchema.safeParse({ ...base, size: 2 * 1024 * 1024 + 1 }).success).toBe(false);
  });
});

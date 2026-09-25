import { z } from "zod";

import {
  isAtLeastAge,
  isJoinDateAllowed,
  isValidIsoDate,
  MAX_JOIN_DAYS_AHEAD,
  MIN_EMPLOYEE_AGE,
} from "@/lib/employees/profile-rules";

// Shared by the API routes (server) and the employee form (client).
// `today` is today's date in Asia/Brunei (todayIsoInBrunei()).

const trimmed = (max: number, label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

// "" or whitespace becomes null.
const optionalText = (max: number, label: string) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || null : (value ?? null)),
    z.string().max(max, `${label} must be at most ${max} characters`).nullable(),
  );

const isoDate = (label: string) =>
  z
    .string({ error: `${label} is required` })
    .refine(isValidIsoDate, `Enter a valid ${label.toLowerCase()}`);

const requiredId = (label: string) => z.uuid(`Choose a ${label.toLowerCase()}`);

export const employeeEmailSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
  z.email("Enter a valid email address").max(254, "Email is too long"),
);

export const GENDERS = ["male", "female"] as const;
export const CLASSIFICATIONS = ["local", "foreign"] as const;
export const EMPLOYEE_ROLES = ["employee", "manager", "admin", "hr_viewer"] as const;
// Inactive is only set through deactivate, never through the form.
export const EDITABLE_STATUSES = ["active", "probation"] as const;

export function employeeFieldsSchema(today: string) {
  return z.object({
    fullName: trimmed(120, "Full name"),
    employeeCode: trimmed(30, "Employee code"),
    email: employeeEmailSchema,
    phone: optionalText(30, "Phone"),
    dateOfBirth: isoDate("Date of birth").refine(
      (value) => !isValidIsoDate(value) || isAtLeastAge(value, today),
      `Employee must be at least ${MIN_EMPLOYEE_AGE} years old`,
    ),
    gender: z.enum(GENDERS, { error: "Choose a gender" }),
    joinDate: isoDate("Join date").refine(
      (value) => !isValidIsoDate(value) || isJoinDateAllowed(value, today),
      `Join date cannot be more than ${MAX_JOIN_DAYS_AHEAD} days in the future`,
    ),
    designation: trimmed(100, "Designation"),
    departmentId: requiredId("Department"),
    branchId: requiredId("Branch"),
    classification: z.enum(CLASSIFICATIONS, { error: "Choose local or foreign" }),
    reportingManagerId: z.preprocess(
      (value) => (value === "" || value === undefined ? null : value),
      z.uuid("Choose a valid reporting manager").nullable(),
    ),
    role: z.enum(EMPLOYEE_ROLES, { error: "Choose a role" }),
    status: z.enum(EDITABLE_STATUSES, { error: "Choose active or probation" }),
  });
}

export function createEmployeeSchema(today: string) {
  return employeeFieldsSchema(today).extend({
    createLogin: z.boolean().default(true),
  });
}

// PATCH sends the full profile (every editable field).
export function updateEmployeeSchema(today: string) {
  return employeeFieldsSchema(today);
}

export type EmployeeFieldsInput = z.infer<ReturnType<typeof employeeFieldsSchema>>;
export type CreateEmployeeInput = z.infer<ReturnType<typeof createEmployeeSchema>>;

export const EMPLOYEE_PAGE_SIZE = 20;

const optionalFilter = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

export const employeeListQuerySchema = z.object({
  q: optionalFilter(z.string().trim().max(100)),
  department: optionalFilter(z.uuid()),
  branch: optionalFilter(z.uuid()),
  status: optionalFilter(z.enum(["active", "inactive", "probation"])),
  role: optionalFilter(z.enum(EMPLOYEE_ROLES)),
  classification: optionalFilter(z.enum(CLASSIFICATIONS)),
  sort: z.enum(["name", "joinDate"]).catch("name"),
  dir: z.enum(["asc", "desc"]).catch("asc"),
  page: z.coerce.number().int().min(1).catch(1),
});

export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;

// Photo uploads.
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const PHOTO_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
export type PhotoContentType = keyof typeof PHOTO_TYPES;

// The file being uploaded. Unknown keys (such as an employeeId sent to the
// self-service route) are stripped, never used.
export const photoFileSchema = z.object({
  contentType: z.enum(Object.keys(PHOTO_TYPES) as [PhotoContentType, ...PhotoContentType[]], {
    error: "Photo must be a JPEG, PNG or WebP image",
  }),
  size: z
    .number()
    .int()
    .positive("Photo is empty")
    .max(PHOTO_MAX_BYTES, "Photo must be 2 MB or smaller"),
});

// Admin upload for any employee.
export const photoUploadRequestSchema = photoFileSchema.extend({
  employeeId: z.uuid("Invalid employee"),
});

export const photoConfirmSchema = z.object({
  key: z.string().min(1).max(200),
});

// Turns a Zod error into { field: firstMessage }.
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    result[field] ??= issue.message;
  }
  return result;
}

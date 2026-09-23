import {
  boolean,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps } from "./columns";
import {
  employeeClassificationEnum,
  employeeRoleEnum,
  employeeStatusEnum,
  genderEnum,
} from "./enums";

export const branches = pgTable("branches", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

export const departments = pgTable("departments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

// Employees are never hard-deleted (deactivate instead), so foreign keys that
// point at employees use onDelete "restrict" to block accidental deletes.
export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable: the employee record can exist before a login is created.
    userId: text("user_id")
      .unique()
      .references(() => user.id, { onDelete: "set null" }),
    // The client's own employee ID.
    employeeCode: text("employee_code").notNull().unique(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull().unique(),
    phone: text("phone"),
    dateOfBirth: date("date_of_birth").notNull(),
    gender: genderEnum("gender").notNull(),
    joinDate: date("join_date").notNull(),
    designation: text("designation").notNull(),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "restrict" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    classification: employeeClassificationEnum("classification").notNull(),
    reportingManagerId: uuid("reporting_manager_id").references(
      (): AnyPgColumn => employees.id,
      { onDelete: "restrict" },
    ),
    role: employeeRoleEnum("role").notNull().default("employee"),
    status: employeeStatusEnum("status").notNull().default("active"),
    // R2 object key (not a full URL); URLs are presigned on demand.
    photoKey: text("photo_key"),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("employees_reporting_manager_id_idx").on(table.reportingManagerId),
    index("employees_department_id_idx").on(table.departmentId),
    index("employees_branch_id_idx").on(table.branchId),
    index("employees_status_idx").on(table.status),
  ],
);

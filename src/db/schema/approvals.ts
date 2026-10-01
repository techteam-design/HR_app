import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./columns";
import { branches, employees } from "./employees";
import {
  approvalActionEnum,
  approvalModeEnum,
  approvalOverrideKindEnum,
  approvalReassignmentCauseEnum,
  leaveApplicationStatusEnum,
} from "./enums";
import { leaveApplications } from "./leave";

// Approval routes are resolved in this order (src/lib/approvals):
//   per-employee override > managers' rule > branch default > no route.
// Admins take no leave and need no route. Approvers must be active managers
// or admins; that rule needs other rows, so it lives in Zod and the services.

// Company-wide approval settings: exactly one row (id = 1).
export const approvalSettings = pgTable(
  "approval_settings",
  {
    id: integer("id").primaryKey().default(1),
    // Approves every manager's leave (single level). Must be an active admin.
    // Null: fall back to the only active admin, if there is exactly one.
    managersApproverId: uuid("managers_approver_id").references(() => employees.id, {
      onDelete: "restrict",
    }),
    // Daily reminder to approvers about requests waiting at least this many
    // days at their current level. 0 = no reminders.
    reminderAfterDays: integer("reminder_after_days").notNull().default(2),
    updatedBy: uuid("updated_by").references(() => employees.id, {
      onDelete: "restrict",
    }),
    ...timestamps,
  },
  (table) => [
    check("approval_settings_single_row_check", sql`${table.id} = 1`),
    check(
      "approval_settings_reminder_after_days_check",
      sql`${table.reminderAfterDays} BETWEEN 0 AND 30`,
    ),
  ],
);

// Default route for employees and HR viewers of a branch. No row: the branch
// has no default.
export const branchApprovalRoutes = pgTable(
  "branch_approval_routes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .unique()
      .references(() => branches.id, { onDelete: "restrict" }),
    mode: approvalModeEnum("mode").notNull(),
    level1ApproverId: uuid("level1_approver_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    level2ApproverId: uuid("level2_approver_id").references(() => employees.id, {
      onDelete: "restrict",
    }),
    updatedBy: uuid("updated_by").references(() => employees.id, {
      onDelete: "restrict",
    }),
    ...timestamps,
  },
  (table) => [
    check(
      "branch_approval_routes_mode_check",
      sql`(${table.mode} = 'single' AND ${table.level2ApproverId} IS NULL) OR (${table.mode} = 'two_level' AND ${table.level2ApproverId} IS NOT NULL)`,
    ),
    check(
      "branch_approval_routes_distinct_approvers_check",
      sql`${table.level2ApproverId} IS NULL OR ${table.level2ApproverId} <> ${table.level1ApproverId}`,
    ),
  ],
);

// Per-employee route that replaces the managers' rule and the branch default.
// "Reset to default" deletes the row.
export const approvalRouteOverrides = pgTable(
  "approval_route_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .unique()
      .references(() => employees.id, { onDelete: "restrict" }),
    mode: approvalModeEnum("mode").notNull(),
    level1ApproverId: uuid("level1_approver_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    level2ApproverId: uuid("level2_approver_id").references(() => employees.id, {
      onDelete: "restrict",
    }),
    updatedBy: uuid("updated_by").references(() => employees.id, {
      onDelete: "restrict",
    }),
    ...timestamps,
  },
  (table) => [
    check(
      "approval_route_overrides_mode_check",
      sql`(${table.mode} = 'single' AND ${table.level2ApproverId} IS NULL) OR (${table.mode} = 'two_level' AND ${table.level2ApproverId} IS NOT NULL)`,
    ),
    check(
      "approval_route_overrides_distinct_approvers_check",
      sql`${table.level2ApproverId} IS NULL OR ${table.level2ApproverId} <> ${table.level1ApproverId}`,
    ),
    // Nobody approves their own leave.
    check(
      "approval_route_overrides_not_own_approver_check",
      sql`${table.employeeId} <> ${table.level1ApproverId} AND (${table.level2ApproverId} IS NULL OR ${table.employeeId} <> ${table.level2ApproverId})`,
    ),
  ],
);

// Append-only audit trail of approval decisions. approver_id is who actually
// acted: an admin deciding in place of the assigned approver is recorded as
// the admin.
export const approvalActions = pgTable(
  "approval_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => leaveApplications.id, { onDelete: "cascade" }),
    approverId: uuid("approver_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    level: integer("level").notNull(),
    action: approvalActionEnum("action").notNull(),
    remarks: text("remarks"),
    actedAt: timestamp("acted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (table) => [
    // One decision per level per application: blocks double-approval from
    // concurrent clicks. Also serves lookups by application_id.
    uniqueIndex("approval_actions_application_id_level_uidx").on(
      table.applicationId,
      table.level,
    ),
    // "Decided by me", newest first.
    index("approval_actions_approver_id_acted_at_idx").on(table.approverId, table.actedAt),
    check("approval_actions_level_check", sql`${table.level} IN (1, 2)`),
    check(
      "approval_actions_reject_remarks_check",
      sql`${table.action} <> 'rejected' OR length(btrim(coalesce(${table.remarks}, ''))) > 0`,
    ),
  ],
);

// Append-only record of a pending application moving to a different approver
// at a level not yet decided (route change). A null approver means the level
// was added (from) or removed (to), e.g. when the mode changes.
export const approvalReassignments = pgTable(
  "approval_reassignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => leaveApplications.id, { onDelete: "cascade" }),
    level: integer("level").notNull(),
    fromApproverId: uuid("from_approver_id").references(() => employees.id, {
      onDelete: "restrict",
    }),
    toApproverId: uuid("to_approver_id").references(() => employees.id, {
      onDelete: "restrict",
    }),
    cause: approvalReassignmentCauseEnum("cause").notNull(),
    // The admin whose change caused the move.
    changedBy: uuid("changed_by")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("approval_reassignments_application_id_idx").on(table.applicationId),
    check("approval_reassignments_level_check", sql`${table.level} IN (1, 2)`),
    check(
      "approval_reassignments_changed_check",
      sql`${table.fromApproverId} IS DISTINCT FROM ${table.toApproverId}`,
    ),
  ],
);

// Append-only record of an admin overriding a decision after the fact:
// "Revoke approval" (approved -> revoked) or "Approve anyway" (rejected ->
// approved). The original decision in approval_actions is never changed, so
// its unique (application_id, level) index keeps blocking double decisions.
export const approvalOverrides = pgTable(
  "approval_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => leaveApplications.id, { onDelete: "cascade" }),
    kind: approvalOverrideKindEnum("kind").notNull(),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    fromStatus: leaveApplicationStatusEnum("from_status").notNull(),
    toStatus: leaveApplicationStatusEnum("to_status").notNull(),
    actedAt: timestamp("acted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("approval_overrides_application_id_idx").on(table.applicationId),
    // The admin's overrides in "Decided by me" and "All decisions".
    index("approval_overrides_admin_id_acted_at_idx").on(table.adminId, table.actedAt),
    check(
      "approval_overrides_reason_check",
      sql`length(btrim(${table.reason})) > 0`,
    ),
    // The status each kind starts from. (to_status 'revoked' is set by the
    // service: a CHECK cannot use an enum value added in the same migration.)
    check(
      "approval_overrides_kind_check",
      sql`(${table.kind} = 'approval_revoked' AND ${table.fromStatus} = 'approved') OR (${table.kind} = 'rejection_overridden' AND ${table.fromStatus} = 'rejected' AND ${table.toStatus} = 'approved')`,
    ),
  ],
);

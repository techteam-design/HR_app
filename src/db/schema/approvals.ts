import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./columns";
import { employees } from "./employees";
import { approvalActionEnum, approvalModeEnum } from "./enums";
import { leaveApplications } from "./leave";

// One row per employee. level2ApproverId is required when mode is two_level;
// that rule is enforced in Zod validation.
export const approvalWorkflows = pgTable("approval_workflows", {
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
});

// Append-only audit trail of approval decisions.
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
    check("approval_actions_level_check", sql`${table.level} IN (1, 2)`),
  ],
);

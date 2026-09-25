import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { dayCount, timestamps } from "./columns";
import { employees } from "./employees";
import {
  adjustmentReasonEnum,
  approvalModeEnum,
  halfDaySlotEnum,
  leaveApplicationStatusEnum,
  leavePeriodBasisEnum,
  leaveTypeCodeEnum,
  prorateRoundingEnum,
} from "./enums";

export const leaveTypes = pgTable("leave_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: leaveTypeCodeEnum("code").notNull().unique(),
  name: text("name").notNull(),
  isPaid: boolean("is_paid").notNull(),
  periodBasis: leavePeriodBasisEnum("period_basis").notNull(),
  ...timestamps,
});

// Annual leave entitlement by service year. The row with the highest
// serviceYear applies to every later year (e.g. 14 days from year 8 onward).
export type EntitlementTable = { serviceYear: number; days: number }[];

// One row per leave type.
export const leavePolicies = pgTable("leave_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  leaveTypeId: uuid("leave_type_id")
    .notNull()
    .unique()
    .references(() => leaveTypes.id, { onDelete: "restrict" }),
  entitlementTable: jsonb("entitlement_table").$type<EntitlementTable>(),
  fixedDays: dayCount("fixed_days"),
  eligibilityMonthsLocal: integer("eligibility_months_local").notNull(),
  eligibilityMonthsForeign: integer("eligibility_months_foreign").notNull(),
  advanceNoticeDaysForeign: integer("advance_notice_days_foreign")
    .notNull()
    .default(0),
  carryForwardEnabled: boolean("carry_forward_enabled").notNull(),
  carryForwardCap: dayCount("carry_forward_cap"),
  carryForwardExpiryMonths: integer("carry_forward_expiry_months"),
  prorateOnJoin: boolean("prorate_on_join").notNull(),
  // Still to be confirmed by the client, so nullable for now.
  prorateRounding: prorateRoundingEnum("prorate_rounding"),
  updatedBy: uuid("updated_by").references(() => employees.id, {
    onDelete: "restrict",
  }),
  ...timestamps,
});

// One row per employee, per leave type, per period.
// Days taken are NOT stored: they are always calculated from approved
// leave_applications, so balances can never drift.
export const leaveEntitlements = pgTable(
  "leave_entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id, { onDelete: "restrict" }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    entitledDays: dayCount("entitled_days").notNull(),
    // Unused days brought in from the previous period (capped).
    carriedForwardDays: dayCount("carried_forward_days").notNull().default("0"),
    // Unused days from the previous period above the cap, recorded when this
    // period's row is created.
    forfeitedDays: dayCount("forfeited_days").notNull().default("0"),
    carryForwardExpiresOn: date("carry_forward_expires_on"),
    ...timestamps,
  },
  (table) => [
    // Makes the entitlement cron idempotent. Also serves lookups by employee.
    unique("leave_entitlements_employee_type_period_unique").on(
      table.employeeId,
      table.leaveTypeId,
      table.periodStart,
    ),
    // Target of the leave_adjustments composite foreign key, so an adjustment's
    // employee and leave type must match its entitlement period.
    unique("leave_entitlements_id_employee_type_unique").on(
      table.id,
      table.employeeId,
      table.leaveTypeId,
    ),
    check(
      "leave_entitlements_period_check",
      sql`${table.periodEnd} >= ${table.periodStart}`,
    ),
    check(
      "leave_entitlements_days_non_negative_check",
      sql`${table.entitledDays} >= 0 AND ${table.carriedForwardDays} >= 0 AND ${table.forfeitedDays} >= 0`,
    ),
  ],
);

// Admin-only, append-only balance adjustments. Never edit or delete a row;
// fix a wrong adjustment by adding an offsetting one.
// Balance = entitled_days + carried_forward_days + sum(adjustments)
//           - sum(approved application days)
export const leaveAdjustments = pgTable(
  "leave_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id, { onDelete: "restrict" }),
    // The entitlement period this adjustment belongs to. Enforced by the
    // composite foreign key below, together with employee_id and leave_type_id.
    entitlementId: uuid("entitlement_id").notNull(),
    // Positive adds days, negative removes days.
    days: dayCount("days").notNull(),
    reason: adjustmentReasonEnum("reason").notNull(),
    note: text("note").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    index("leave_adjustments_employee_id_leave_type_id_idx").on(
      table.employeeId,
      table.leaveTypeId,
    ),
    foreignKey({
      name: "leave_adjustments_entitlement_fk",
      columns: [table.entitlementId, table.employeeId, table.leaveTypeId],
      foreignColumns: [
        leaveEntitlements.id,
        leaveEntitlements.employeeId,
        leaveEntitlements.leaveTypeId,
      ],
    }).onDelete("restrict"),
    check("leave_adjustments_days_non_zero_check", sql`${table.days} <> 0`),
  ],
);

export const leaveApplications = pgTable(
  "leave_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id, { onDelete: "restrict" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    isHalfDay: boolean("is_half_day").notNull().default(false),
    halfDaySlot: halfDaySlotEnum("half_day_slot"),
    totalDays: dayCount("total_days").notNull(),
    reason: text("reason"),
    status: leaveApplicationStatusEnum("status").notNull().default("pending"),
    currentLevel: integer("current_level").notNull().default(1),
    // Approval route is snapshotted at submission so later config changes
    // do not affect in-flight requests.
    approvalMode: approvalModeEnum("approval_mode").notNull(),
    level1ApproverId: uuid("level1_approver_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    level2ApproverId: uuid("level2_approver_id").references(
      () => employees.id,
      { onDelete: "restrict" },
    ),
    // Admin override of the foreign-staff advance notice rule.
    noticeOverridden: boolean("notice_overridden").notNull().default(false),
    overrideBy: uuid("override_by").references(() => employees.id, {
      onDelete: "restrict",
    }),
    overrideReason: text("override_reason"),
    lastReminderSentAt: timestamp("last_reminder_sent_at", {
      withTimezone: true,
    }),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by").references(() => employees.id, {
      onDelete: "restrict",
    }),
    // Required when an admin cancels someone else's request.
    cancellationNote: text("cancellation_note"),
    // The admin who applied on the employee's behalf; null when the employee
    // applied themself.
    submittedBy: uuid("submitted_by").references(() => employees.id, {
      onDelete: "restrict",
    }),
    ...timestamps,
  },
  (table) => [
    index("leave_applications_employee_id_status_idx").on(
      table.employeeId,
      table.status,
    ),
    index("leave_applications_status_current_level_idx").on(
      table.status,
      table.currentLevel,
    ),
    index("leave_applications_start_date_idx").on(table.startDate),
    // Approver inbox lookups.
    index("leave_applications_level1_approver_id_idx").on(
      table.level1ApproverId,
    ),
    index("leave_applications_level2_approver_id_idx").on(
      table.level2ApproverId,
    ),
    check(
      "leave_applications_date_range_check",
      sql`${table.endDate} >= ${table.startDate}`,
    ),
    check("leave_applications_total_days_check", sql`${table.totalDays} > 0`),
    check(
      "leave_applications_current_level_check",
      sql`${table.currentLevel} IN (1, 2)`,
    ),
    // A half day is a single date with a slot and deducts 0.5 day.
    // A full-day application has no slot.
    check(
      "leave_applications_half_day_check",
      sql`(${table.isHalfDay} AND ${table.halfDaySlot} IS NOT NULL AND ${table.startDate} = ${table.endDate} AND ${table.totalDays} = 0.5) OR (NOT ${table.isHalfDay} AND ${table.halfDaySlot} IS NULL)`,
    ),
    check(
      "leave_applications_cancelled_at_check",
      sql`${table.status} <> 'cancelled' OR (${table.cancelledAt} IS NOT NULL AND ${table.cancelledBy} IS NOT NULL)`,
    ),
  ],
);

// The exact dates an application covers: the dates the employee ticked, so
// their rostered off days are left out. start_date / end_date on the
// application are the first and last of these. Balances ("used" and
// "pending") are summed from these rows by date.
export const leaveApplicationDays = pgTable(
  "leave_application_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => leaveApplications.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    // 1.0 for a full day, 0.5 for a half day.
    portion: numeric("portion", { precision: 2, scale: 1 }).notNull(),
    ...timestamps,
  },
  (table) => [
    unique("leave_application_days_application_id_date_unique").on(
      table.applicationId,
      table.date,
    ),
    // Overlap checks and calendar lookups by date.
    index("leave_application_days_date_idx").on(table.date),
    check(
      "leave_application_days_portion_check",
      sql`${table.portion} IN (0.5, 1.0)`,
    ),
  ],
);

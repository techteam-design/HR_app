import { pgEnum } from "drizzle-orm/pg-core";

// All enums live here so schema files can share them without circular imports.

export const genderEnum = pgEnum("gender", ["male", "female"]);

export const employeeClassificationEnum = pgEnum("employee_classification", [
  "local",
  "foreign",
]);

export const employeeRoleEnum = pgEnum("employee_role", [
  "employee",
  "manager",
  "admin",
  "hr_viewer",
]);

export const employeeStatusEnum = pgEnum("employee_status", [
  "active",
  "inactive",
  "probation",
]);

export const leaveTypeCodeEnum = pgEnum("leave_type_code", [
  "annual",
  "mc",
  "unpaid",
]);

export const leavePeriodBasisEnum = pgEnum("leave_period_basis", [
  "anniversary",
  "calendar",
]);

export const prorateRoundingEnum = pgEnum("prorate_rounding", [
  "up",
  "down",
  "nearest",
]);

export const halfDaySlotEnum = pgEnum("half_day_slot", [
  "morning",
  "afternoon",
]);

export const leaveApplicationStatusEnum = pgEnum("leave_application_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
  // An admin revoked an approval (approval_overrides). Final, like cancelled.
  "revoked",
]);

export const adjustmentReasonEnum = pgEnum("adjustment_reason", [
  "opening_balance",
  "correction",
  // System adjustment: carry-forward recalculated after a late approval or
  // cancellation of leave in the previous annual period.
  "carry_forward_recalculation",
]);

export const approvalModeEnum = pgEnum("approval_mode", ["single", "two_level"]);

export const approvalActionEnum = pgEnum("approval_action", [
  "approved",
  "rejected",
]);

// Why a pending application moved to a different approver.
export const approvalReassignmentCauseEnum = pgEnum("approval_reassignment_cause", [
  "branch_default",
  "override",
  "override_reset",
  "employee_change",
  "manager_approver",
]);

// An admin overriding a decision after the fact (approval_overrides).
export const approvalOverrideKindEnum = pgEnum("approval_override_kind", [
  // approved -> revoked ("Revoke approval")
  "approval_revoked",
  // rejected -> approved ("Approve anyway")
  "rejection_overridden",
]);

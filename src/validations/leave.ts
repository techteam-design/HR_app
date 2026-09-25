import { z } from "zod";

import { LEAVE_TYPE_CODES, PRORATE_ROUNDINGS } from "@/lib/leave-engine/constants";
import { MAX_REQUEST_RANGE_DAYS } from "@/lib/leave-engine/day-selection";
import { HALF_DAY_SLOTS } from "@/lib/leave-engine/half-day";
import { parseIsoDate, toIsoDate } from "@/lib/leave-engine/iso-date";

// Shared by the API routes (server) and the leave forms (client).

export const ADJUSTMENT_REASONS = ["opening_balance", "correction"] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export const MAX_ADJUSTMENT_DAYS = 100;

const isHalfStep = (value: number) => Number.isInteger(value * 2);

// Accepts a number or a numeric string from a form field.
const dayNumber = (label: string) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? Number(value) : value),
    z
      .number({ error: `${label} is required` })
      .finite(`${label} must be a number`)
      .refine(isHalfStep, `${label} must be in steps of 0.5`),
  );

const wholeNumber = (label: string, min: number, max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? Number(value) : value),
    z
      .number({ error: `${label} is required` })
      .int(`${label} must be a whole number`)
      .min(min, `${label} must be at least ${min}`)
      .max(max, `${label} must be at most ${max}`),
  );

// Empty string or null means "not set".
const optionalWholeNumber = (label: string, min: number, max: number) =>
  z.preprocess(
    (value) => (value === "" || value === undefined ? null : value),
    wholeNumber(label, min, max).nullable(),
  );

export const adjustmentSchema = z.object({
  leaveType: z.enum(LEAVE_TYPE_CODES, { error: "Choose a leave type" }),
  days: dayNumber("Days")
    .refine((value) => value !== 0, "Days cannot be 0")
    .refine(
      (value) => Math.abs(value) <= MAX_ADJUSTMENT_DAYS,
      `Days must be between -${MAX_ADJUSTMENT_DAYS} and ${MAX_ADJUSTMENT_DAYS}`,
    ),
  reason: z.enum(ADJUSTMENT_REASONS, { error: "Choose a reason" }),
  note: z
    .string({ error: "A note is required" })
    .trim()
    .min(3, "A note is required (at least 3 characters)")
    .max(500, "Note must be at most 500 characters"),
});

export type AdjustmentInput = z.infer<typeof adjustmentSchema>;

// ---------------------------------------------------------------------------
// Leave policies
// ---------------------------------------------------------------------------

// The editable annual table covers service years 1–8; year 8 applies to
// every later year.
export const ANNUAL_TABLE_YEARS = 8;
export const MAX_POLICY_DAYS = 60;

const policyDays = (label: string, min: number) =>
  dayNumber(label).refine(
    (value) => value >= min && value <= MAX_POLICY_DAYS,
    `${label} must be between ${min} and ${MAX_POLICY_DAYS}`,
  );

const eligibilityMonths = (label: string) => wholeNumber(label, 0, 24);

export const annualPolicySchema = z
  .object({
    code: z.literal("annual"),
    entitlementDays: z
      .array(policyDays("Days", 0))
      .length(ANNUAL_TABLE_YEARS, `Enter days for years 1 to ${ANNUAL_TABLE_YEARS}`)
      .refine(
        (days) => days.every((value, index) => index === 0 || value >= days[index - 1]),
        "Days cannot go down as service years increase",
      ),
    eligibilityMonthsLocal: eligibilityMonths("Local eligibility months"),
    eligibilityMonthsForeign: eligibilityMonths("Foreign eligibility months"),
    advanceNoticeDaysForeign: wholeNumber("Advance notice days", 0, 90),
    carryForwardEnabled: z.boolean(),
    carryForwardCap: z.preprocess(
      (value) => (value === "" || value === undefined ? null : value),
      policyDays("Carry-forward cap", 0.5).nullable(),
    ),
    carryForwardExpiryMonths: optionalWholeNumber("Expiry months", 1, 24),
  })
  .superRefine((value, context) => {
    if (value.carryForwardEnabled && value.carryForwardCap === null) {
      context.addIssue({
        code: "custom",
        path: ["carryForwardCap"],
        message: "Enter a carry-forward cap",
      });
    }
  })
  .transform((value) =>
    // With carry-forward off, the cap and expiry are cleared.
    value.carryForwardEnabled ? value : { ...value, carryForwardCap: null, carryForwardExpiryMonths: null },
  );

export const mcPolicySchema = z.object({
  code: z.literal("mc"),
  fixedDays: policyDays("Days per year", 0.5),
  eligibilityMonthsLocal: eligibilityMonths("Local eligibility months"),
  eligibilityMonthsForeign: eligibilityMonths("Foreign eligibility months"),
  // null = not decided yet (the provisional default applies).
  prorateRounding: z.preprocess(
    (value) => (value === "" || value === undefined ? null : value),
    z.enum(PRORATE_ROUNDINGS, { error: "Choose a rounding rule" }).nullable(),
  ),
});

export const unpaidPolicySchema = z.object({
  code: z.literal("unpaid"),
  fixedDays: policyDays("Days per year", 0),
});

export const policyUpdateSchema = z.discriminatedUnion("code", [
  annualPolicySchema,
  mcPolicySchema,
  unpaidPolicySchema,
]);

export type PolicyUpdateInput = z.infer<typeof policyUpdateSchema>;

// ---------------------------------------------------------------------------
// Leave applications
// ---------------------------------------------------------------------------

export const APPLICATION_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export type ApplicationStatusFilter = (typeof APPLICATION_STATUSES)[number];

const isRealDate = (value: string) => {
  try {
    const [year, month, day] = parseIsoDate(value);
    return toIsoDate(year, month, day) === value;
  } catch {
    return false;
  }
};

const isoDate = (message: string) =>
  z.string({ error: message }).refine(isRealDate, message);

// Empty or whitespace-only text becomes null.
const optionalText = (label: string, max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || null : (value ?? null)),
    z.string().max(max, `${label} must be at most ${max} characters`).nullable(),
  );

// The business rules (balance, notice, overlap, one period...) are checked
// by validateApplication in src/lib/leave-engine/validation.ts; this schema
// only checks the shape of the request.
export const applicationSchema = z.object({
  leaveType: z.enum(LEAVE_TYPE_CODES, { error: "Choose a leave type" }),
  startDate: isoDate("Choose a start date"),
  endDate: isoDate("Choose an end date"),
  dayType: z.enum(["full", "half"], { error: "Choose full days or a half day" }),
  halfDaySlot: z.preprocess(
    (value) => (value === "" || value === undefined ? null : value),
    z.enum(HALF_DAY_SLOTS, { error: "Choose morning or afternoon" }).nullable(),
  ),
  // The ticked dates only.
  dates: z
    .array(isoDate("Invalid date"), { error: "Select at least one day" })
    .max(MAX_REQUEST_RANGE_DAYS, `A request can cover at most ${MAX_REQUEST_RANGE_DAYS} days`),
  reason: optionalText("Reason", 500),
});

export type ApplicationInput = z.infer<typeof applicationSchema>;

// Admin applying on an employee's behalf: may override the foreign
// advance-notice rule, with a reason.
export const onBehalfApplicationSchema = applicationSchema
  .extend({
    noticeOverride: z.boolean().default(false),
    overrideReason: optionalText("Override reason", 500),
  })
  .superRefine((value, context) => {
    if (value.noticeOverride && (value.overrideReason?.length ?? 0) < 3) {
      context.addIssue({
        code: "custom",
        path: ["overrideReason"],
        message: "Give a reason for the override (at least 3 characters)",
      });
    }
  });

export type OnBehalfApplicationInput = z.infer<typeof onBehalfApplicationSchema>;

// The note is required when an admin cancels someone else's request; the
// service decides whether it is needed.
export const cancelApplicationSchema = z.object({
  note: optionalText("Note", 500),
});

export type CancelApplicationInput = z.infer<typeof cancelApplicationSchema>;

export const MIN_CANCEL_NOTE_LENGTH = 3;

// History filters from the query string; anything invalid means "all".
export const historyFilterSchema = z.object({
  type: z.enum(LEAVE_TYPE_CODES).optional().catch(undefined),
  status: z.enum(APPLICATION_STATUSES).optional().catch(undefined),
  year: z.coerce.number().int().min(2000).max(2100).optional().catch(undefined),
});

export type HistoryFilter = z.infer<typeof historyFilterSchema>;

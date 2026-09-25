import { z } from "zod";

import { LEAVE_TYPE_CODES, PRORATE_ROUNDINGS } from "@/lib/leave-engine/constants";

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

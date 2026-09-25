// Shared leave-engine constants. Pure: safe to import anywhere.

export const LEAVE_TYPE_CODES = ["annual", "mc", "unpaid"] as const;
export type LeaveTypeCode = (typeof LEAVE_TYPE_CODES)[number];

export const PRORATE_ROUNDINGS = ["up", "down", "nearest"] as const;
export type ProrateRounding = (typeof PRORATE_ROUNDINGS)[number];

// PROVISIONAL: the client has not yet decided how MC pro-rating rounds
// (leave_policies.prorate_rounding is null). Until an admin sets it on the
// Leave policies page, pro-rated MC is rounded to the nearest half day.
export const PROVISIONAL_MC_ROUNDING: ProrateRounding = "nearest";

export type Classification = "local" | "foreign";

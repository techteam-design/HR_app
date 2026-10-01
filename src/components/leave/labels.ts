import type { ArchTint } from "@/components/ui/card";
import type { LeaveTypeCode } from "@/lib/leave-engine/constants";
import { halfDayLabel, type HalfDaySlot } from "@/lib/leave-engine/half-day";

export const LEAVE_LABELS: Record<LeaveTypeCode, string> = {
  annual: "Annual leave",
  mc: "MC",
  unpaid: "Unpaid leave",
};

export const LEAVE_TINTS: Record<LeaveTypeCode, ArchTint> = {
  annual: "lilac",
  mc: "blush",
  unpaid: "sage",
};

export const ADJUSTMENT_REASON_LABELS = {
  opening_balance: "Opening balance",
  correction: "Correction",
  // System adjustment; admins cannot choose it.
  carry_forward_recalculation: "Carry-forward recalculated",
} as const;

// "1 day", "3.5 days".
export function daysLabel(days: string, count: number): string {
  return `${days} ${Math.abs(count) === 1 ? "day" : "days"}`;
}

// "Kelvin Ong", or "Siti Rahman, then Daniel Lim" for two-level approval.
export function approverRoute(approvers: readonly { level: number; name: string }[]): string {
  const sorted = [...approvers].sort((a, b) => a.level - b.level);
  return sorted.map((approver) => approver.name).join(", then ");
}

type HalfDayFields = {
  isHalfDay: boolean;
  halfDaySlot: HalfDaySlot | null;
  // The times stored when the half day was booked.
  halfDayStart: string | null;
  halfDayEnd: string | null;
};

// " (morning, 8:30 AM – 12:30 PM)" after the dates of a half day; "" for full days.
export function halfDaySuffix(item: HalfDayFields): string {
  if (!item.isHalfDay || !item.halfDaySlot) return "";
  const label = halfDayLabel(item.halfDaySlot, item.halfDayStart, item.halfDayEnd);
  return ` (${label.charAt(0).toLowerCase()}${label.slice(1)})`;
}

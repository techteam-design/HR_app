import type { ArchTint } from "@/components/ui/card";
import type { LeaveTypeCode } from "@/lib/leave-engine/constants";

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

export const HALF_DAY_SLOT_LABELS = { morning: "Morning", afternoon: "Afternoon" } as const;

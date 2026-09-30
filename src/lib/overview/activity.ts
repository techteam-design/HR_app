// Company leave overview helpers (admin and HR viewer dashboard). Pure.

import type { LeaveTypeCode } from "@/lib/leave-engine/constants";
import type { IsoDate } from "@/lib/leave-engine/iso-date";
import { formatShortDateRange } from "@/lib/utils/dates";

export type ActivityKind = "submitted" | "approved" | "rejected" | "cancelled";

export type ActivityEvent = {
  kind: ActivityKind;
  at: Date;
  applicationId: string;
  employeeName: string;
  // Who acted: the approver, the canceller, or (for a submission made on
  // someone's behalf) the admin.
  actorName: string | null;
  // Level of an approval decision on a two-level route.
  level: number | null;
  code: LeaveTypeCode;
  startDate: IsoDate;
  endDate: IsoDate;
};

// Newest first, at most `limit` events.
export function recentActivity(events: readonly ActivityEvent[], limit: number): ActivityEvent[] {
  return [...events].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

// The leave type inside a sentence.
export const ACTIVITY_TYPE_TEXT: Record<LeaveTypeCode, string> = {
  annual: "annual leave",
  mc: "MC",
  unpaid: "unpaid leave",
};

// "Priya Nair requested MC · 30 Sep",
// "Vaidik Dubey requested annual leave for Priya Nair · 19–20 Oct",
// "Daniel Tan approved Maria Santos's annual leave · 19–20 Oct (level 1)",
// "Vaidik Dubey cancelled Kelvin Ong's unpaid leave · 2 Nov".
export function activityText(event: ActivityEvent): string {
  const type = ACTIVITY_TYPE_TEXT[event.code];
  const dates = formatShortDateRange(event.startDate, event.endDate);
  if (event.kind === "submitted") {
    return event.actorName
      ? `${event.actorName} requested ${type} for ${event.employeeName} · ${dates}`
      : `${event.employeeName} requested ${type} · ${dates}`;
  }
  const actor = event.actorName ?? "Someone";
  const level = event.level ? ` (level ${event.level})` : "";
  return `${actor} ${event.kind} ${event.employeeName}'s ${type} · ${dates}${level}`;
}

// Groups items by a key in first-seen order (e.g. by branch or by date).
export function groupBy<T, K>(items: readonly T[], keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

// The dates after `today` up to and including `today + days`.
export function nextDays(today: IsoDate, days: number, addDays: (date: IsoDate, n: number) => IsoDate): IsoDate[] {
  return Array.from({ length: days }, (_, index) => addDays(today, index + 1));
}

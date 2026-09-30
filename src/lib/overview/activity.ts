// Company leave overview helpers (admin and HR viewer dashboard). Pure.

import type { IsoDate } from "@/lib/leave-engine/iso-date";

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
};

// Newest first, at most `limit` events.
export function recentActivity(events: readonly ActivityEvent[], limit: number): ActivityEvent[] {
  return [...events].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

const VERBS: Record<ActivityKind, string> = {
  submitted: "requested leave",
  approved: "approved",
  rejected: "rejected",
  cancelled: "cancelled",
};

// "Priya Nair requested leave", "Daniel Tan approved Priya Nair's request
// (level 1)", "Vaidik Dubey cancelled Kelvin Ong's leave".
export function activityText(event: ActivityEvent): string {
  if (event.kind === "submitted") {
    return event.actorName
      ? `${event.actorName} requested leave for ${event.employeeName}`
      : `${event.employeeName} ${VERBS.submitted}`;
  }
  const actor = event.actorName ?? "Someone";
  const object = event.kind === "cancelled" ? `${event.employeeName}'s leave` : `${event.employeeName}'s request`;
  const level = event.level ? ` (level ${event.level})` : "";
  return `${actor} ${VERBS[event.kind]} ${object}${level}`;
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

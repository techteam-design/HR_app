// "All decisions" (admin): counts per approver and paging. Pure.

import type { IsoDate } from "@/lib/leave-engine/iso-date";
import { daysInMonth, parseIsoDate, toIsoDate } from "@/lib/leave-engine/iso-date";

export type ApproverSummary = {
  id: string;
  name: string;
  // Decisions in the date range.
  approved: number;
  rejected: number;
  // The admin's "Revoke approval" and "Approve anyway" in the date range.
  overrides: number;
  // Requests waiting for them now (not limited to the date range).
  waiting: number;
};

// One row per approver: every current approver (active managers and admins)
// plus anyone who decided, overrode or has requests waiting, e.g. a former
// manager. Sorted by name.
export function summariseDecisions({
  approvers,
  names,
  decisions,
  overrides,
  waiting,
}: {
  approvers: readonly { id: string; name: string }[];
  // Names of everyone else who appears below.
  names: ReadonlyMap<string, string>;
  decisions: readonly { approverId: string; action: "approved" | "rejected" }[];
  overrides: readonly { adminId: string }[];
  waiting: readonly { approverId: string; count: number }[];
}): ApproverSummary[] {
  const rows = new Map<string, ApproverSummary>();
  const row = (id: string, name?: string) => {
    let found = rows.get(id);
    if (!found) {
      found = { id, name: name ?? names.get(id) ?? "Unknown", approved: 0, rejected: 0, overrides: 0, waiting: 0 };
      rows.set(id, found);
    }
    return found;
  };
  for (const approver of approvers) row(approver.id, approver.name);
  for (const decision of decisions) row(decision.approverId)[decision.action] += 1;
  for (const override of overrides) row(override.adminId).overrides += 1;
  for (const item of waiting) row(item.approverId).waiting += item.count;
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// The default range: the month containing `today`.
export function monthOf(today: IsoDate): { from: IsoDate; to: IsoDate } {
  const [year, month] = parseIsoDate(today);
  return { from: toIsoDate(year, month, 1), to: toIsoDate(year, month, daysInMonth(year, month)) };
}

export const DECISIONS_PAGE_SIZE = 20;

export type Page<T> = { items: T[]; page: number; pages: number; total: number };

// The requested page (1-based), clamped to the pages that exist.
export function pageOf<T>(items: readonly T[], page = 1, size = DECISIONS_PAGE_SIZE): Page<T> {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return { items: items.slice((current - 1) * size, current * size), page: current, pages, total: items.length };
}

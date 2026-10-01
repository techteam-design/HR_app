// Which pending requests the daily reminder includes. Pure.
//
// A request waits at its current level since the latest of: its submission,
// (at level 2) the level 1 approval, and the latest reassignment at the
// current level (the new approver's clock restarts; they were just emailed).
// It is due once it has waited at least `afterDays` whole Brunei days, and
// stays due every day until it is decided. One digest per approver per day.
//
// The setting (approval_settings.reminder_after_days) is 0 = OFF, never
// "remind immediately". For testing outside production only, the cron route
// accepts ?minDays=N, which replaces the setting for that one run (0 there
// includes requests submitted today).

import { parseIsoDate, type IsoDate } from "@/lib/leave-engine/iso-date";

export const MAX_REMINDER_AFTER_DAYS = 30;

// The minimum waiting days for this run, or null when reminders are off.
export function reminderThreshold(settingDays: number, minDaysOverride: number | null): number | null {
  if (minDaysOverride !== null) return minDaysOverride;
  return settingDays > 0 ? settingDays : null;
}

export type MinDaysOverride = { ok: true; minDays: number | null } | { ok: false; error: string };

// The cron route's ?minDays= value. Absent = no override. Refused in
// production; otherwise a whole number from 0 to MAX_REMINDER_AFTER_DAYS.
export function parseMinDaysOverride(raw: string | null, production: boolean): MinDaysOverride {
  if (raw === null) return { ok: true, minDays: null };
  if (production) return { ok: false, error: "minDays is only accepted outside production." };
  if (!/^\d{1,2}$/.test(raw) || Number(raw) > MAX_REMINDER_AFTER_DAYS) {
    return { ok: false, error: `minDays must be a whole number from 0 to ${MAX_REMINDER_AFTER_DAYS}.` };
  }
  return { ok: true, minDays: Number(raw) };
}

export type WaitingRequest = {
  id: string;
  // The approver of the current level.
  approverId: string;
  currentLevel: number;
  submittedAt: Date;
  level1ApprovedAt: Date | null;
  // Latest reassignment at the current level.
  reassignedAt: Date | null;
};

export function waitingSince(request: WaitingRequest): Date {
  const times = [request.submittedAt, request.currentLevel === 2 ? request.level1ApprovedAt : null, request.reassignedAt];
  return new Date(Math.max(...times.filter((time): time is Date => time !== null).map((time) => time.getTime())));
}

// Whole days from `from` to `to` (DATE values).
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const utc = (value: IsoDate) => {
    const [year, month, day] = parseIsoDate(value);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

// The due requests per approver, longest waiting first. `minWaitingDays`
// comes from reminderThreshold() (the caller handles "off"); 0 includes
// requests that started waiting today. `businessDate` turns a timestamp into
// its Brunei date (todayIsoInBrunei).
export function dueReminders<T extends WaitingRequest>(
  requests: readonly T[],
  today: IsoDate,
  minWaitingDays: number,
  businessDate: (time: Date) => IsoDate,
): Map<string, (T & { waitingDays: number })[]> {
  const due = new Map<string, (T & { waitingDays: number })[]>();
  for (const request of requests) {
    const waitingDays = daysBetween(businessDate(waitingSince(request)), today);
    if (waitingDays < minWaitingDays) continue;
    const list = due.get(request.approverId) ?? [];
    list.push({ ...request, waitingDays });
    due.set(request.approverId, list);
  }
  for (const list of due.values()) list.sort((a, b) => b.waitingDays - a.waitingDays);
  return due;
}

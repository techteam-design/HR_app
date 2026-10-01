// Half-day slots and their times. Pure: no database.
// A half day deducts 0.5 day and is allowed only on a single-date request.
//
// The slot times are admin-editable (half_day_settings, Leave policies page).
// Each half-day application stores the times it was booked with, so history
// always shows the times that applied then. Times are 24-hour "HH:MM".

import type { Classification } from "./constants";

export const HALF_DAY_SLOTS = ["morning", "afternoon"] as const;
export type HalfDaySlot = (typeof HALF_DAY_SLOTS)[number];

export const HALF_DAY_PORTION = 0.5;

export type SlotTimes = { start: string; end: string };
export type ClassificationTimings = Record<HalfDaySlot, SlotTimes>;
export type HalfDayTimings = Record<Classification, ClassificationTimings>;

// The timings before any admin change (inserted by migration 0004 and the
// config seed): local staff work 8:30 AM – 5:30 PM, foreign staff 9:30 AM – 6:30 PM.
export const DEFAULT_HALF_DAY_TIMINGS: HalfDayTimings = {
  local: {
    morning: { start: "08:30", end: "12:30" },
    afternoon: { start: "13:30", end: "17:30" },
  },
  foreign: {
    morning: { start: "09:30", end: "13:30" },
    afternoon: { start: "14:30", end: "18:30" },
  },
};

export const SLOT_NAMES: Record<HalfDaySlot, string> = { morning: "Morning", afternoon: "Afternoon" };

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isClockTime(value: string): boolean {
  return CLOCK.test(value);
}

// Postgres returns time columns as "HH:MM:SS"; the app uses "HH:MM".
export function toClock(value: string): string {
  return value.slice(0, 5);
}

// "13:30" -> "1:30 PM", "08:30" -> "8:30 AM", "12:00" -> "12:00 PM".
export function formatClock(value: string): string {
  const [hours, minutes] = toClock(value).split(":").map(Number);
  const suffix = hours < 12 ? "AM" : "PM";
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

// "8:30 AM – 12:30 PM"
export function formatSlotTimes(start: string, end: string): string {
  return `${formatClock(start)} – ${formatClock(end)}`;
}

// "Morning, 8:30 AM – 12:30 PM"; just "Morning" when the times are unknown.
export function halfDayLabel(slot: HalfDaySlot, start: string | null, end: string | null): string {
  return start && end ? `${SLOT_NAMES[slot]}, ${formatSlotTimes(start, end)}` : SLOT_NAMES[slot];
}

export type HalfDaySlotOption = { slot: HalfDaySlot; label: string; time: string; start: string; end: string };

// e.g. { slot: "morning", label: "Morning", time: "8:30 AM – 12:30 PM", start: "08:30", end: "12:30" }
export function halfDaySlotsFor(timings: ClassificationTimings): HalfDaySlotOption[] {
  return HALF_DAY_SLOTS.map((slot) => {
    const { start, end } = timings[slot];
    return { slot, label: SLOT_NAMES[slot], time: formatSlotTimes(start, end), start, end };
  });
}

export function slotTime(timings: HalfDayTimings, classification: Classification, slot: HalfDaySlot): string {
  const { start, end } = timings[classification][slot];
  return formatSlotTimes(start, end);
}

export type TimingIssue = {
  // e.g. "local.morning.end"
  path: `${Classification}.${HalfDaySlot}.${"start" | "end"}`;
  message: string;
};

const CLASSIFICATION_NAMES: Record<Classification, string> = { local: "Local", foreign: "Foreign" };

// Every rule the timings break: valid times, each slot starts before it
// ends, and the morning ends no later than the afternoon starts.
export function halfDayTimingIssues(timings: HalfDayTimings): TimingIssue[] {
  const issues: TimingIssue[] = [];
  for (const classification of ["local", "foreign"] as const) {
    const name = CLASSIFICATION_NAMES[classification];
    const slots = timings[classification];
    let valid = true;
    for (const slot of HALF_DAY_SLOTS) {
      for (const field of ["start", "end"] as const) {
        if (!isClockTime(slots[slot][field])) {
          valid = false;
          issues.push({ path: `${classification}.${slot}.${field}`, message: "Enter a valid time" });
        }
      }
    }
    if (!valid) continue;
    for (const slot of HALF_DAY_SLOTS) {
      if (slots[slot].start >= slots[slot].end) {
        issues.push({
          path: `${classification}.${slot}.end`,
          message: `${name} ${slot} must end after it starts`,
        });
      }
    }
    if (slots.morning.end > slots.afternoon.start) {
      issues.push({
        path: `${classification}.afternoon.start`,
        message: `${name} afternoon can't start before the morning ends`,
      });
    }
  }
  return issues;
}

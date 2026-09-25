// Half-day slots by classification. Pure: no database.
// A half day deducts 0.5 day and is allowed only on a single-date request.

import type { Classification } from "./constants";

export const HALF_DAY_SLOTS = ["morning", "afternoon"] as const;
export type HalfDaySlot = (typeof HALF_DAY_SLOTS)[number];

export const HALF_DAY_PORTION = 0.5;

type SlotTimes = { start: string; end: string };

// Local staff work 8:30 AM – 5:30 PM, foreign staff 9:30 AM – 6:30 PM.
export const HALF_DAY_TIMES: Record<Classification, Record<HalfDaySlot, SlotTimes>> = {
  local: {
    morning: { start: "8:30 AM", end: "12:30 PM" },
    afternoon: { start: "1:30 PM", end: "5:30 PM" },
  },
  foreign: {
    morning: { start: "9:30 AM", end: "1:30 PM" },
    afternoon: { start: "2:30 PM", end: "6:30 PM" },
  },
};

const SLOT_NAMES: Record<HalfDaySlot, string> = { morning: "Morning", afternoon: "Afternoon" };

export type HalfDaySlotOption = { slot: HalfDaySlot; label: string; time: string };

// e.g. { slot: "morning", label: "Morning", time: "8:30 AM – 12:30 PM" }
export function halfDaySlotsFor(classification: Classification): HalfDaySlotOption[] {
  return HALF_DAY_SLOTS.map((slot) => ({ slot, label: SLOT_NAMES[slot], time: slotTime(classification, slot) }));
}

export function slotTime(classification: Classification, slot: HalfDaySlot): string {
  const times = HALF_DAY_TIMES[classification][slot];
  return `${times.start} – ${times.end}`;
}

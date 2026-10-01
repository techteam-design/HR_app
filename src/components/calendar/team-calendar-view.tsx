"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

import { CancelApplicationButton } from "@/components/leave/cancel-application-button";
import { daysLabel, halfDaySuffix, LEAVE_LABELS } from "@/components/leave/labels";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  cellEntries,
  defaultLayout,
  entryLabel,
  halfDayText,
  LEAVE_CODES,
  shortName,
  type CalendarEntry,
  type CalendarLayout,
  type CalendarScope,
} from "@/lib/calendar/entries";
import { groupByDate, monthWeeks, peopleCountByDate, WEEKDAY_HEADERS, type YearMonth } from "@/lib/calendar/month-grid";
import { formatDays } from "@/lib/leave-engine/balance";
import type { LeaveTypeCode } from "@/lib/leave-engine/constants";
import { cn } from "@/lib/utils/cn";
import { formatDateRange, formatWeekdayDate } from "@/lib/utils/dates";
import type { CalendarApplication } from "@/server/team-calendar.service";

// ---------------------------------------------------------------------------
// Month | List choice, remembered for the browser session. Without a choice,
// narrow screens (under 640px) start on List. Storage may be unavailable
// (private windows): the choice then lives in memory for this page.
// ---------------------------------------------------------------------------

const LAYOUT_KEY = "team-calendar-layout";
const NARROW = "(max-width: 639px)";
const layoutListeners = new Set<() => void>();
let memoryLayout: CalendarLayout | null = null;

function storedLayout(): string | null {
  try {
    return window.sessionStorage.getItem(LAYOUT_KEY) ?? memoryLayout;
  } catch {
    return memoryLayout;
  }
}

function subscribeLayout(listener: () => void) {
  layoutListeners.add(listener);
  return () => {
    layoutListeners.delete(listener);
  };
}

function chooseLayout(layout: CalendarLayout) {
  memoryLayout = layout;
  try {
    window.sessionStorage.setItem(LAYOUT_KEY, layout);
  } catch {
    // Kept in memory only.
  }
  for (const listener of layoutListeners) listener();
}

function useCalendarLayout(): CalendarLayout {
  return useSyncExternalStore(
    subscribeLayout,
    () => defaultLayout(storedLayout(), window.matchMedia(NARROW).matches),
    () => "month",
  );
}

// ---------------------------------------------------------------------------
// Colours: the balance card tints (annual lilac, MC blush, unpaid sage).
// Approved = solid, pending = outlined. Employees see one neutral style.
// ---------------------------------------------------------------------------

const TYPE_STYLES: Record<LeaveTypeCode, { solid: string; outline: string; chip: string; ring: string }> = {
  annual: {
    solid: "bg-lilac-50 border-lilac-50",
    outline: "bg-surface border-dashed border-plum-500",
    chip: "text-plum-700",
    ring: "border-plum-500",
  },
  mc: {
    solid: "bg-blush-50 border-blush-50",
    outline: "bg-surface border-dashed border-blush-500",
    chip: "text-blush-700",
    ring: "border-blush-500",
  },
  unpaid: {
    solid: "bg-sage-50 border-sage-50",
    outline: "bg-surface border-dashed border-sage-500",
    chip: "text-sage-700",
    ring: "border-sage-500",
  },
};

const NEUTRAL = { entry: "bg-bg border-input-border", chip: "text-plum-700", ring: "border-input-border" };

function entryStyle(entry: CalendarEntry): string {
  if (!entry.leave) return NEUTRAL.entry;
  const style = TYPE_STYLES[entry.leave.code];
  return entry.leave.status === "pending" ? style.outline : style.solid;
}

function CodeChip({ entry, className }: { entry: CalendarEntry; className?: string }) {
  const tint = entry.leave ? TYPE_STYLES[entry.leave.code] : NEUTRAL;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-surface px-1.5 font-semibold whitespace-nowrap",
        tint.chip,
        className,
      )}
    >
      {entryLabel(entry)}
    </span>
  );
}

function PendingMarker({ className }: { className?: string }) {
  return (
    <span className={cn("font-semibold whitespace-nowrap text-status-pending-text", className)}>Pending</span>
  );
}

// ---------------------------------------------------------------------------

export function TeamCalendarView({
  month,
  today,
  scope,
  entries,
  applications,
}: {
  month: YearMonth;
  today: string;
  scope: CalendarScope;
  entries: CalendarEntry[];
  applications: CalendarApplication[];
}) {
  const layout = useCalendarLayout();
  const [openId, setOpenId] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const weeks = useMemo(() => monthWeeks(month), [month]);
  const byDate = useMemo(() => groupByDate(entries), [entries]);
  const counts = useMemo(() => peopleCountByDate(entries), [entries]);
  const byId = useMemo(() => new Map(applications.map((a) => [a.id, a])), [applications]);
  const open = openId ? byId.get(openId) : undefined;
  const daysWithLeave = weeks.flat().filter((cell) => cell.inMonth && byDate.has(cell.date));
  const detailed = scope !== "company";

  // Only managers, HR viewers and admins can open a request's details.
  const selectFor = (entry: CalendarEntry) =>
    detailed && entry.applicationId ? () => setOpenId(entry.applicationId) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <LayoutToggle layout={layout} />
        <Legend detailed={detailed} />
      </div>

      {entries.length === 0 && <p className="text-[15px] text-muted">Nobody is on leave this month.</p>}

      {layout === "month" ? (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="grid grid-cols-7 border-b border-border bg-lilac-50">
            {WEEKDAY_HEADERS.map((day) => (
              <div key={day} className="eyebrow px-1 py-2 text-center text-plum-700 sm:px-2 sm:text-left">
                {day}
              </div>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week[0].date} className="grid grid-cols-7 border-b border-border last:border-b-0">
              {week.map((cell) => {
                const list = cell.inMonth ? (byDate.get(cell.date) ?? []) : [];
                const { shown, more } = cellEntries(list);
                const count = counts.get(cell.date) ?? 0;
                const dayNumber = (
                  <span
                    className={cn(
                      "inline-flex size-7 items-center justify-center rounded-full text-[13px] font-semibold",
                      cell.date === today ? "bg-plum-900 text-surface" : cell.inMonth ? "text-plum-900" : "text-muted",
                    )}
                  >
                    {Number(cell.date.slice(8))}
                  </span>
                );
                return (
                  <div
                    key={cell.date}
                    className={cn(
                      "min-h-20 min-w-0 border-r border-border p-1 last:border-r-0 sm:min-h-32 sm:p-2",
                      !cell.inMonth && "bg-bg",
                    )}
                  >
                    {/* Narrow screens: avatars only; tap the day for the list. */}
                    <div className="sm:hidden">
                      {list.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setOpenDay(cell.date)}
                          aria-label={`${formatWeekdayDate(cell.date)}: ${count} on leave`}
                          className="flex w-full flex-col items-center gap-1 rounded-input focus-visible:outline-2 focus-visible:outline-plum-700"
                        >
                          {dayNumber}
                          {shown.map((entry) => (
                            <span
                              key={entry.key}
                              className={cn(
                                "rounded-full border-2 p-px",
                                entry.leave ? TYPE_STYLES[entry.leave.code].ring : NEUTRAL.ring,
                                entry.leave?.status === "pending" && "border-dashed",
                              )}
                            >
                              <Avatar name={entry.fullName} src={entry.photoUrl} size="xs" />
                            </span>
                          ))}
                          {more > 0 && <span className="text-[11px] font-semibold text-plum-700">+{more}</span>}
                        </button>
                      ) : (
                        <div className="flex justify-center">{dayNumber}</div>
                      )}
                    </div>

                    {/* Wider screens: photo, short name and chips. */}
                    <div className="hidden sm:block">
                      <div className="flex items-center justify-between gap-1">
                        {dayNumber}
                        {count > 0 && <span className="text-[12px] font-semibold text-plum-700">{count} off</span>}
                      </div>
                      {list.length > 0 && (
                        <ul className="mt-1 space-y-1">
                          {shown.map((entry) => (
                            <li key={entry.key}>
                              <MonthEntry entry={entry} onSelect={selectFor(entry)} />
                            </li>
                          ))}
                          {more > 0 && (
                            <li>
                              <button
                                type="button"
                                onClick={() => setOpenDay(cell.date)}
                                className="min-h-7 text-[12px] font-semibold text-plum-700 hover:underline focus-visible:outline-2 focus-visible:outline-plum-700"
                              >
                                +{more} more
                              </button>
                            </li>
                          )}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {daysWithLeave.map((cell) => (
            <section key={cell.date} className="rounded-card border border-border bg-surface p-4">
              <h3 className="flex items-center justify-between gap-2 text-sm font-semibold text-plum-900">
                <span>
                  {formatWeekdayDate(cell.date)}
                  {cell.date === today && <span className="ml-2 text-plum-700">Today</span>}
                </span>
                <span className="text-[13px] text-plum-700">{counts.get(cell.date)} off</span>
              </h3>
              <ul className="mt-2 divide-y divide-border">
                {(byDate.get(cell.date) ?? []).map((entry) => (
                  <li key={entry.key}>
                    <ListRow entry={entry} detailed={detailed} onSelect={selectFor(entry)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Everyone on one day ("+N more", or a day tapped on a narrow screen) */}
      <Dialog open={openDay !== null} onClose={() => setOpenDay(null)} title={openDay ? formatWeekdayDate(openDay) : ""}>
        <ul className="divide-y divide-border">
          {(openDay ? (byDate.get(openDay) ?? []) : []).map((entry) => {
            const select = selectFor(entry);
            return (
              <li key={entry.key}>
                <ListRow
                  entry={entry}
                  detailed={detailed}
                  onSelect={
                    select &&
                    (() => {
                      setOpenDay(null);
                      select();
                    })
                  }
                />
              </li>
            );
          })}
        </ul>
      </Dialog>

      <Dialog open={!!open} onClose={() => setOpenId(null)} title={open ? open.employeeName : ""}>
        {open && <ApplicationDetail application={open} />}
      </Dialog>
    </div>
  );
}

function LayoutToggle({ layout }: { layout: CalendarLayout }) {
  const options: { value: CalendarLayout; label: string }[] = [
    { value: "month", label: "Month" },
    { value: "list", label: "List" },
  ];
  return (
    <div role="group" aria-label="Calendar view" className="inline-flex rounded-full border border-border bg-surface p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={layout === option.value}
          onClick={() => chooseLayout(option.value)}
          className={cn(
            "min-h-11 rounded-full px-5 text-sm font-semibold transition-colors duration-150",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-700",
            layout === option.value ? "bg-plum-900 text-surface" : "text-plum-700 hover:bg-lilac-50",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Legend({ detailed }: { detailed: boolean }) {
  return (
    <ul aria-label="Legend" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-plum-900">
      {detailed && (
        <>
          {(Object.keys(LEAVE_CODES) as LeaveTypeCode[]).map((code) => (
            <li key={code} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-1.5 text-[12px] font-semibold",
                  TYPE_STYLES[code].solid,
                  TYPE_STYLES[code].chip,
                )}
              >
                {LEAVE_CODES[code]}
              </span>
              {LEAVE_LABELS[code]}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-4 w-6 rounded-md border border-lilac-50 bg-lilac-50" />
            Approved
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-4 w-6 rounded-md border border-dashed border-plum-500 bg-surface" />
            Pending
          </li>
        </>
      )}
      <li>½ = half day</li>
    </ul>
  );
}

// One entry in a month cell: photo and short name, then the chips.
function MonthEntry({ entry, onSelect }: { entry: CalendarEntry; onSelect?: () => void }) {
  const half = halfDayText(entry.portion, entry.halfDaySlot);
  const content = (
    <>
      <span className="flex items-center gap-1.5">
        <Avatar name={entry.fullName} src={entry.photoUrl} size="xs" />
        <span className="min-w-0 text-[12px] leading-tight font-semibold break-words text-plum-900">
          <span aria-hidden="true">{shortName(entry.fullName)}</span>
          <span className="sr-only">{entry.fullName}</span>
        </span>
      </span>
      <span className="mt-1 flex flex-wrap items-center gap-1 text-[11px] leading-tight">
        <CodeChip entry={entry} />
        {half && <span className="font-semibold whitespace-nowrap text-plum-900">{half}</span>}
        {entry.leave?.status === "pending" && <PendingMarker />}
      </span>
    </>
  );
  const className = cn("block w-full min-w-0 rounded-input border p-1 text-left", entryStyle(entry));
  if (!onSelect) return <div className={className}>{content}</div>;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        className,
        "transition-colors duration-150 hover:border-plum-500",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-plum-700",
      )}
    >
      {content}
    </button>
  );
}

// One person in the List view and the day dialog.
function ListRow({ entry, detailed, onSelect }: { entry: CalendarEntry; detailed: boolean; onSelect?: () => void }) {
  const half = halfDayText(entry.portion, entry.halfDaySlot);
  const content = (
    <>
      <Avatar name={entry.fullName} src={entry.photoUrl} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold break-words text-plum-900">{entry.fullName}</span>
        <span className="block text-[13px] break-words text-muted">
          {entry.departmentName} · {entry.branchName}
        </span>
      </span>
      <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 text-[12px]">
        <span className={cn("inline-flex rounded-full border px-0.5 py-0.5", entryStyle(entry))}>
          <CodeChip entry={entry} className="border-0 bg-transparent" />
        </span>
        {half && <span className="font-semibold text-plum-900">{half}</span>}
        {detailed && entry.leave && <StatusBadge status={entry.leave.status} />}
      </span>
    </>
  );
  const className = "flex w-full items-center gap-3 py-2 text-left";
  if (!onSelect) return <div className={className}>{content}</div>;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        className,
        "min-h-11 rounded-input transition-colors duration-150 hover:bg-lilac-50",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-plum-700",
      )}
    >
      {content}
    </button>
  );
}

function ApplicationDetail({ application }: { application: CalendarApplication }) {
  const range = formatDateRange(application.startDate, application.endDate);
  const days = daysLabel(formatDays(application.totalDays), application.totalDays);
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted">
        {application.departmentName} · {application.branchName}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-plum-900">{LEAVE_LABELS[application.code]}</span>
        {application.code === "unpaid" && <StatusBadge status="unpaid" />}
        <StatusBadge status={application.status} />
      </div>
      <p className="text-[15px] text-plum-900">
        {range} · {days}
        {halfDaySuffix(application)}
      </p>
      {application.progress && <p className="text-[13px] text-plum-900">{application.progress}</p>}
      {application.reason && <p className="text-[13px] break-words text-muted">Reason: {application.reason}</p>}
      <ul className="flex flex-wrap gap-2">
        {application.days.map((day) => (
          <li key={day.date} className="rounded-full bg-lilac-50 px-3 py-1 text-[13px] text-plum-900">
            {formatWeekdayDate(day.date)}
            {day.portion === 0.5 && " · ½"}
          </li>
        ))}
      </ul>
      {application.canCancel && (
        <CancelApplicationButton
          applicationId={application.id}
          summary={`${application.employeeName} · ${LEAVE_LABELS[application.code]}, ${range} (${days})`}
          kind="leave"
        />
      )}
    </div>
  );
}

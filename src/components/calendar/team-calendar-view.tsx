"use client";

import { useMemo, useState } from "react";

import { CancelApplicationButton } from "@/components/leave/cancel-application-button";
import { daysLabel, HALF_DAY_SLOT_LABELS, LEAVE_LABELS } from "@/components/leave/labels";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { groupByDate, monthWeeks, peopleCountByDate, WEEKDAY_HEADERS, type YearMonth } from "@/lib/calendar/month-grid";
import { formatDays } from "@/lib/leave-engine/balance";
import { cn } from "@/lib/utils/cn";
import { formatDateRange, formatWeekdayDate } from "@/lib/utils/dates";
import type { CalendarApplication, CalendarEntry } from "@/server/team-calendar.service";

const MAX_CHIPS = 3;

// Month view: a grid on desktop, a list of days on small screens. Approved
// leave is solid, pending leave outlined and labelled "Pending"; half days
// are marked ½. Selecting an entry opens its details (with Cancel for those
// allowed to cancel it; the server enforces it).
export function TeamCalendarView({
  month,
  today,
  entries,
  applications,
}: {
  month: YearMonth;
  today: string;
  entries: CalendarEntry[];
  applications: CalendarApplication[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const weeks = useMemo(() => monthWeeks(month), [month]);
  const byDate = useMemo(() => groupByDate(entries), [entries]);
  const counts = useMemo(() => peopleCountByDate(entries), [entries]);
  const byId = useMemo(() => new Map(applications.map((a) => [a.id, a])), [applications]);
  const open = openId ? byId.get(openId) : undefined;
  const daysWithLeave = weeks.flat().filter((cell) => cell.inMonth && byDate.has(cell.date));

  return (
    <>
      {/* Desktop grid */}
      <div className="hidden overflow-hidden rounded-card border border-border bg-surface md:block">
        <div className="grid grid-cols-7 border-b border-border bg-lilac-50">
          {WEEKDAY_HEADERS.map((day) => (
            <div key={day} className="eyebrow px-3 py-2 text-plum-700">
              {day}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0].date} className="grid grid-cols-7 border-b border-border last:border-b-0">
            {week.map((cell) => {
              const list = byDate.get(cell.date) ?? [];
              const count = counts.get(cell.date) ?? 0;
              return (
                <div
                  key={cell.date}
                  className={cn(
                    "min-h-32 border-r border-border p-2 last:border-r-0",
                    !cell.inMonth && "bg-bg",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "inline-flex size-7 items-center justify-center rounded-full text-[13px] font-semibold",
                        cell.date === today ? "bg-plum-900 text-surface" : cell.inMonth ? "text-plum-900" : "text-muted",
                      )}
                    >
                      {Number(cell.date.slice(8))}
                    </span>
                    {cell.inMonth && count > 0 && (
                      <span className="text-[12px] font-semibold text-plum-700">{count} off</span>
                    )}
                  </div>
                  {cell.inMonth && (
                    <ul className="mt-1 space-y-1">
                      {list.slice(0, MAX_CHIPS).map((entry) => (
                        <li key={`${entry.applicationId}-${entry.date}`}>
                          <EntryChip entry={entry} onSelect={() => setOpenId(entry.applicationId)} compact />
                        </li>
                      ))}
                      {list.length > MAX_CHIPS && (
                        <li>
                          <button
                            type="button"
                            onClick={() => setOpenDay(cell.date)}
                            className="min-h-7 text-[12px] font-semibold text-plum-700 hover:underline focus-visible:outline-2 focus-visible:outline-plum-700"
                          >
                            +{list.length - MAX_CHIPS} more
                          </button>
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Mobile list */}
      <div className="space-y-3 md:hidden">
        {daysWithLeave.length === 0 ? (
          <p className="text-[15px] text-muted">Nobody is on leave this month.</p>
        ) : (
          daysWithLeave.map((cell) => (
            <section key={cell.date} className="rounded-card border border-border bg-surface p-4">
              <h3 className="flex items-center justify-between text-sm font-semibold text-plum-900">
                <span>
                  {formatWeekdayDate(cell.date)}
                  {cell.date === today && <span className="ml-2 text-plum-700">Today</span>}
                </span>
                <span className="text-[13px] text-plum-700">{counts.get(cell.date)} off</span>
              </h3>
              <ul className="mt-3 space-y-2">
                {(byDate.get(cell.date) ?? []).map((entry) => (
                  <li key={`${entry.applicationId}-${entry.date}`}>
                    <EntryChip entry={entry} onSelect={() => setOpenId(entry.applicationId)} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      {/* Everyone on one day (desktop "+N more") */}
      <Dialog open={openDay !== null} onClose={() => setOpenDay(null)} title={openDay ? formatWeekdayDate(openDay) : ""}>
        <ul className="space-y-2">
          {(openDay ? (byDate.get(openDay) ?? []) : []).map((entry) => (
            <li key={`${entry.applicationId}-${entry.date}`}>
              <EntryChip
                entry={entry}
                onSelect={() => {
                  setOpenDay(null);
                  setOpenId(entry.applicationId);
                }}
              />
            </li>
          ))}
        </ul>
      </Dialog>

      <Dialog open={!!open} onClose={() => setOpenId(null)} title={open ? open.employeeName : ""}>
        {open && <ApplicationDetail application={open} />}
      </Dialog>
    </>
  );
}

function EntryChip({ entry, onSelect, compact = false }: { entry: CalendarEntry; onSelect: () => void; compact?: boolean }) {
  const pending = entry.status === "pending";
  const half = entry.portion === 0.5 && entry.halfDaySlot ? ` · ½ ${entry.halfDaySlot === "morning" ? "AM" : "PM"}` : "";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-1 rounded-input px-2 text-left text-plum-900 transition-colors duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-plum-700",
        compact ? "min-h-7 text-[12px]" : "min-h-11 text-sm",
        pending ? "border border-dashed border-plum-500 bg-surface hover:bg-lilac-50" : "bg-lilac-100 hover:bg-lilac-200",
      )}
    >
      <span className="min-w-0 flex-1 truncate font-semibold">{entry.employeeName}</span>
      <span className="shrink-0">
        {LEAVE_LABELS[entry.code]}
        {half}
        {pending && " · Pending"}
      </span>
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
        {application.isHalfDay &&
          application.halfDaySlot &&
          ` (${HALF_DAY_SLOT_LABELS[application.halfDaySlot].toLowerCase()})`}
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
          noteRequired
          label={application.status === "approved" ? "Cancel leave" : "Cancel request"}
        />
      )}
    </div>
  );
}

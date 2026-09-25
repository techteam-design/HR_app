import { StatusBadge } from "@/components/ui/status-badge";
import { formatDays } from "@/lib/leave-engine/balance";
import { canEmployeeCancel } from "@/lib/leave-engine/cancellation";
import { cn } from "@/lib/utils/cn";
import { formatDateRange, formatDisplayDate, formatWeekdayDate, todayIsoInBrunei } from "@/lib/utils/dates";
import type { ApplicationItem } from "@/server/leave-application.service";

import { CancelApplicationButton } from "./cancel-application-button";
import { approverRoute, daysLabel, HALF_DAY_SLOT_LABELS, LEAVE_LABELS } from "./labels";

// A list of leave requests: on the employee's own history, and (for admins
// and HR viewers) on the employee detail page. Display only; cancelling is
// enforced by the server.
//   own:   the employee may cancel pending, or approved before the first day
//   admin: an admin may cancel any pending or approved request, with a note
//   view:  no actions (HR viewer)
export function ApplicationList({
  items,
  today,
  mode,
  emptyText,
}: {
  items: ApplicationItem[];
  today: string;
  mode: "own" | "admin" | "view";
  emptyText: string;
}) {
  if (items.length === 0) return <p className="text-[15px] text-muted">{emptyText}</p>;

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const range = formatDateRange(item.startDate, item.endDate);
        const days = daysLabel(formatDays(item.totalDays), item.totalDays);
        const cancellable =
          mode === "admin"
            ? item.status === "pending" || item.status === "approved"
            : mode === "own" && canEmployeeCancel(item.status, item.startDate, today);
        return (
          <li key={item.id} className="rounded-card border border-border bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-plum-900">{LEAVE_LABELS[item.code]}</span>
                  {item.code === "unpaid" && <StatusBadge status="unpaid" />}
                  <StatusBadge status={item.status} />
                </div>
                <p className="text-[15px] text-plum-900">
                  {range} · {days}
                  {item.isHalfDay && item.halfDaySlot && ` (${HALF_DAY_SLOT_LABELS[item.halfDaySlot].toLowerCase()})`}
                </p>
                <p className="text-[13px] text-muted">
                  Submitted {formatDisplayDate(todayIsoInBrunei(item.submittedAt))}
                  {item.submittedByName && ` by ${item.submittedByName}`} · Approval: {approverRoute(item.approvers)}
                </p>
                {item.noticeOverridden && <p className="text-[13px] text-muted">Notice rule overridden by an admin.</p>}
                {item.reason && <p className="text-[13px] break-words text-muted">Reason: {item.reason}</p>}
                {item.status === "cancelled" && item.cancelledAt && (
                  <p className="text-[13px] break-words text-muted">
                    Cancelled {formatDisplayDate(todayIsoInBrunei(item.cancelledAt))}
                    {item.cancelledByName && ` by ${item.cancelledByName}`}
                    {item.cancellationNote && `: ${item.cancellationNote}`}
                  </p>
                )}
              </div>
              {cancellable && (
                <CancelApplicationButton
                  applicationId={item.id}
                  summary={`${LEAVE_LABELS[item.code]}, ${range} (${days})`}
                  asAdmin={mode === "admin"}
                />
              )}
            </div>
            <details className="group mt-3">
              <summary
                className={cn(
                  "inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-plum-700",
                  "hover:underline focus-visible:outline-2 focus-visible:outline-plum-700",
                )}
              >
                <span className="group-open:hidden">Show dates ({item.days.length})</span>
                <span className="hidden group-open:inline">Hide dates</span>
              </summary>
              <ul className="mt-2 flex flex-wrap gap-2">
                {item.days.map((day) => (
                  <li key={day.date} className="rounded-full bg-lilac-50 px-3 py-1 text-[13px] text-plum-900">
                    {formatWeekdayDate(day.date)}
                    {day.portion === 0.5 && " · ½"}
                  </li>
                ))}
              </ul>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

// Compact list for the dashboard and My profile.
export function UpcomingLeaveList({ items }: { items: ApplicationItem[] }) {
  if (items.length === 0) return <p className="mt-3 text-[15px] text-muted">No upcoming leave</p>;
  return (
    <ul className="mt-3 divide-y divide-border">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-plum-900">
              {formatDateRange(item.startDate, item.endDate)}
            </span>
            <span className="block text-[13px] text-muted">
              {LEAVE_LABELS[item.code]} · {daysLabel(formatDays(item.totalDays), item.totalDays)}
            </span>
          </span>
          <StatusBadge status={item.status} />
        </li>
      ))}
    </ul>
  );
}

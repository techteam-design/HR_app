import { ApprovalProgress } from "@/components/leave/approval-progress";
import { CancelApplicationButton } from "@/components/leave/cancel-application-button";
import { daysLabel, halfDaySuffix, LEAVE_LABELS } from "@/components/leave/labels";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDays } from "@/lib/leave-engine/balance";
import { cn } from "@/lib/utils/cn";
import { formatDateRange, formatDisplayDate, formatWeekdayDate, todayIsoInBrunei } from "@/lib/utils/dates";
import type { QueueItem } from "@/server/approval.service";

import { DecisionButtons } from "./decision-buttons";

const MY_DECISION: Record<NonNullable<QueueItem["myDecision"]>["action"], string> = {
  approved: "You approved this",
  rejected: "You rejected this",
  approval_revoked: "You revoked the approval",
  rejection_overridden: "You overrode the rejection",
};

// One request in the approver queue. Display only: deciding and cancelling
// are enforced by the server.
export function RequestCard({ item }: { item: QueueItem }) {
  const range = formatDateRange(item.startDate, item.endDate);
  const days = daysLabel(formatDays(item.totalDays), item.totalDays);
  const summary = `${item.employee.fullName} · ${LEAVE_LABELS[item.code]}, ${range} (${days})`;
  const assigned = item.approvers.find((a) => a.level === item.currentLevel);
  const finalApproval = item.currentLevel >= (item.approvalMode === "two_level" ? 2 : 1);

  return (
    <li className="rounded-card border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <Avatar name={item.employee.fullName} src={item.employee.photoUrl} size="md" />
          <div className="min-w-0 space-y-1">
            <p className="font-semibold break-words text-plum-900">
              {item.employee.fullName}
              <span className="font-normal text-muted"> · {item.employee.branchName}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold text-plum-900">{LEAVE_LABELS[item.code]}</span>
              {item.code === "unpaid" && <StatusBadge status="unpaid" />}
              {item.status !== "pending" && <StatusBadge status={item.status} />}
              {item.status === "pending" && (
                <span className="rounded-full bg-lilac-50 px-3 py-1 text-xs font-semibold text-plum-900">
                  {item.levelLabel}
                </span>
              )}
            </div>
            <p className="text-[15px] text-plum-900">
              {range} · {days}
              {halfDaySuffix(item)}
            </p>
            {item.balance && (
              <p className={cn("text-[13px]", item.balance.after < 0 ? "text-status-rejected-text" : "text-muted")}>
                Balance {formatDays(item.balance.available)} → {formatDays(item.balance.after)} after this request
              </p>
            )}
            <p className="text-[13px] text-muted">
              Submitted {formatDisplayDate(todayIsoInBrunei(item.submittedAt))}
              {item.submittedByName && ` by ${item.submittedByName} on their behalf`}
            </p>
            {item.noticeOverridden && <p className="text-[13px] text-muted">Notice rule overridden by an admin.</p>}
            {item.reason && <p className="text-[13px] break-words text-muted">Reason: {item.reason}</p>}
            {item.myDecision && (
              <p className="text-[13px] text-plum-900">
                {MY_DECISION[item.myDecision.action]}
                {item.approvalMode === "two_level" && item.myDecision.level !== null
                  ? ` at level ${item.myDecision.level}`
                  : ""}{" "}
                on {formatDisplayDate(todayIsoInBrunei(item.myDecision.actedAt))}.
              </p>
            )}
            <ApprovalProgress progress={item.progress} />
            {item.status === "cancelled" && item.cancelledByName && (
              <p className="text-[13px] break-words text-muted">
                Cancelled by {item.cancelledByName}
                {item.cancellationNote && `: ${item.cancellationNote}`}
              </p>
            )}
          </div>
        </div>
        <div className="shrink-0">
          {item.decideAs && (
            <DecisionButtons
              applicationId={item.id}
              expectedLevel={item.currentLevel === 2 ? 2 : 1}
              summary={summary}
              finalApproval={finalApproval}
              asAdminFor={item.decideAs === "admin" ? (assigned?.name ?? null) : null}
            />
          )}
          {item.canCancel && !item.decideAs && (
            <CancelApplicationButton applicationId={item.id} summary={summary} kind="leave" />
          )}
        </div>
      </div>
      <details className="group mt-3">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-plum-700 hover:underline focus-visible:outline-2 focus-visible:outline-plum-700">
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
}

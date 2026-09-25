import { Card } from "@/components/ui/card";
import { formatDays } from "@/lib/leave-engine/balance";
import { cn } from "@/lib/utils/cn";
import { formatDisplayDate, todayIsoInSingapore } from "@/lib/utils/dates";
import type { AdjustmentHistoryItem, EmployeeBalances } from "@/server/leave-balance.service";

import { AdjustBalanceButton } from "./adjust-balance-dialog";
import { ADJUSTMENT_REASON_LABELS, LEAVE_LABELS } from "./labels";

const periodLabel = (start: string, end: string) => `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;
const signed = (days: number) => (days > 0 ? `+${formatDays(days)}` : formatDays(days));

// "Leave balances" on the employee detail page. admin + hr_viewer can view;
// only admins (canManage) see the Adjust balance action.
export function EmployeeLeaveBalances({
  employeeId,
  balances,
  adjustments,
  canManage,
}: {
  employeeId: string;
  balances: EmployeeBalances;
  adjustments: AdjustmentHistoryItem[];
  canManage: boolean;
}) {
  const adjustable =
    canManage && balances.status !== "inactive"
      ? balances.types.flatMap((type) =>
          type.balance && type.periodStart && type.periodEnd
            ? [{ code: type.code, available: type.balance.available, periodLabel: periodLabel(type.periodStart, type.periodEnd) }]
            : [],
        )
      : [];

  return (
    <Card className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-section-title font-medium text-plum-900">
          Leave <em>balances</em>
        </h2>
        {adjustable.length > 0 && <AdjustBalanceButton employeeId={employeeId} types={adjustable} />}
      </div>

      {!balances.started && (
        <p className="text-[15px] text-muted">
          Leave periods start on the join date, {formatDisplayDate(balances.joinDate)}.
        </p>
      )}

      {balances.started && (
        <div className="space-y-4">
          {balances.types.map((type) => (
            <section key={type.code} className="rounded-input border border-border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="font-semibold text-plum-900">{LEAVE_LABELS[type.code]}</h3>
                <p className="text-[13px] text-muted">
                  {type.periodStart && type.periodEnd ? periodLabel(type.periodStart, type.periodEnd) : "No current period"}
                </p>
              </div>
              {type.balance ? (
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                  {[
                    ["Entitled", formatDays(type.balance.entitled)],
                    ["Carried forward", formatDays(type.balance.carriedForward)],
                    ["Adjustments", signed(type.balance.adjustments)],
                    ["Used", formatDays(type.balance.used)],
                    ["Pending", formatDays(type.balance.pending)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="eyebrow text-plum-700">{label}</dt>
                      <dd className="mt-1 text-[15px] text-plum-900">{value}</dd>
                    </div>
                  ))}
                  <div>
                    <dt className="eyebrow text-plum-700">Available</dt>
                    <dd
                      className={cn(
                        "mt-1 text-[15px] font-semibold",
                        type.balance.available < 0 ? "text-status-rejected-text" : "text-plum-900",
                      )}
                    >
                      {formatDays(type.balance.available)}
                      {type.balance.available < 0 && " (below zero)"}
                    </dd>
                  </div>
                  {!type.eligible && (
                    <div className="col-span-2">
                      <dt className="eyebrow text-plum-700">Eligible from</dt>
                      <dd className="mt-1 text-[15px] text-plum-900">{formatDisplayDate(type.eligibleFrom)}</dd>
                    </div>
                  )}
                  {type.forfeitedDays > 0 && (
                    <div className="col-span-2">
                      <dt className="eyebrow text-plum-700">Forfeited last year</dt>
                      <dd className="mt-1 text-[15px] text-plum-900">{formatDays(type.forfeitedDays)}</dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="mt-3 text-[13px] text-muted">
                  {balances.status === "inactive"
                    ? "Inactive employees get no new leave periods."
                    : "No entitlement for the current period yet."}
                </p>
              )}
            </section>
          ))}
        </div>
      )}

      <div>
        <h3 className="font-semibold text-plum-900">Adjustment history</h3>
        {adjustments.length === 0 ? (
          <p className="mt-2 text-[15px] text-muted">No adjustments yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {adjustments.map((item) => (
              <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-semibold text-plum-900">
                    {signed(item.days)} {item.leaveTypeName}
                  </span>
                  <span className="text-[13px] text-muted">
                    {formatDisplayDate(todayIsoInSingapore(item.createdAt))} · {item.createdByName}
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-muted">
                  {ADJUSTMENT_REASON_LABELS[item.reason]} · period {periodLabel(item.periodStart, item.periodEnd)}
                </p>
                <p className="mt-1 text-[15px] break-words text-plum-900">{item.note}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

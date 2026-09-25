import { ArchCard, Card } from "@/components/ui/card";
import { availableShare, formatDays } from "@/lib/leave-engine/balance";
import { cn } from "@/lib/utils/cn";
import { formatDisplayDate } from "@/lib/utils/dates";
import type { EmployeeBalances, LeaveTypeBalance } from "@/server/leave-balance.service";

import { daysLabel, LEAVE_LABELS, LEAVE_TINTS } from "./labels";

// Display only: every number comes from the leave engine via the service.

function cardNote(type: LeaveTypeBalance): string | undefined {
  if (!type.balance) return undefined;
  if (!type.eligible) return `Available from ${formatDisplayDate(type.eligibleFrom)}`;
  if (type.balance.available < 0) return "Below zero: please contact HR";
  if (type.code === "annual" && type.balance.carriedForward > 0) {
    return `Includes ${daysLabel(formatDays(type.balance.carriedForward), type.balance.carriedForward)} carried forward`;
  }
  return undefined;
}

// The three arch cards on the dashboard (annual = lilac, MC = blush,
// unpaid = sage).
export function BalanceArchCards({ balances, className }: { balances: EmployeeBalances; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-3", className)}>
      {balances.types.map((type) => (
        <ArchCard
          key={type.code}
          tint={LEAVE_TINTS[type.code]}
          label={LEAVE_LABELS[type.code]}
          value={type.balance ? formatDays(type.balance.available) : "—"}
          caption={type.balance ? `of ${daysLabel(formatDays(type.balance.total), type.balance.total)}` : "No leave period yet"}
          note={cardNote(type)}
          progress={type.balance && type.eligible ? availableShare(type.balance) : undefined}
        />
      ))}
    </div>
  );
}

// The personal leave-year line beside the balances.
export function LeaveYearCard({ balances }: { balances: EmployeeBalances }) {
  const { annual } = balances;
  const carryLine = !annual.carryForwardEnabled
    ? "Unused annual leave does not carry forward."
    : annual.carryForwardCap === null
      ? "Unused annual leave carries forward."
      : `Up to ${daysLabel(formatDays(annual.carryForwardCap), annual.carryForwardCap)} carry forward.`;

  return (
    <Card>
      <p className="eyebrow text-plum-700">Your leave year</p>
      <p className="mt-3 text-[15px] text-plum-900">
        {annual.renewsOn ? `Leave year renews ${formatDisplayDate(annual.renewsOn)}. ` : ""}
        {carryLine}
      </p>
      {annual.advanceNoticeDays > 0 && (
        <p className="mt-2 text-[15px] text-plum-900">
          Apply for annual leave at least {annual.advanceNoticeDays} days ahead.
        </p>
      )}
    </Card>
  );
}

// Compact list for My profile.
export function CompactBalances({ balances }: { balances: EmployeeBalances }) {
  return (
    <Card>
      <h2 className="font-display text-section-title font-medium text-plum-900">
        Leave <em>balances</em>
      </h2>
      <ul className="mt-4 divide-y divide-border">
        {balances.types.map((type) => {
          const negative = !!type.balance && type.balance.available < 0;
          return (
            <li key={type.code} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
              <span className="font-semibold text-plum-900">{LEAVE_LABELS[type.code]}</span>
              {type.balance ? (
                <span className="text-[15px] text-plum-900">
                  <span className={cn("font-semibold", negative && "text-status-rejected-text")}>
                    {formatDays(type.balance.available)}
                  </span>{" "}
                  <span className="text-muted">of {daysLabel(formatDays(type.balance.total), type.balance.total)}</span>
                  {!type.eligible && (
                    <span className="block text-[13px] text-muted sm:inline sm:pl-2">
                      Available from {formatDisplayDate(type.eligibleFrom)}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-[13px] text-muted">No leave period yet</span>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

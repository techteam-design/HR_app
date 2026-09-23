import { cn } from "@/lib/utils/cn";

import { STATUS_LABELS, type EmployeeStatus } from "./labels";

const styles: Record<EmployeeStatus, string> = {
  active: "bg-status-approved-bg text-status-approved-text",
  probation: "bg-status-pending-bg text-status-pending-text",
  inactive: "bg-status-cancelled-bg text-status-cancelled-text",
};

export function EmployeeStatusBadge({ status, className }: { status: EmployeeStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
        styles[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

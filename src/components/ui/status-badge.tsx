import { cn } from "@/lib/utils/cn";

export type BadgeStatus = "approved" | "pending" | "rejected" | "cancelled" | "unpaid";

const styles: Record<BadgeStatus, { className: string; label: string }> = {
  approved: { className: "bg-status-approved-bg text-status-approved-text", label: "Approved" },
  pending: { className: "bg-status-pending-bg text-status-pending-text", label: "Pending" },
  rejected: { className: "bg-status-rejected-bg text-status-rejected-text", label: "Rejected" },
  cancelled: { className: "bg-status-cancelled-bg text-status-cancelled-text", label: "Cancelled" },
  unpaid: { className: "bg-sage-50 text-sage-700", label: "Unpaid" },
};

export function StatusBadge({ status, className }: { status: BadgeStatus; className?: string }) {
  const style = styles[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  );
}

import Link from "next/link";

import { approverRoute } from "@/components/leave/labels";
import { Card } from "@/components/ui/card";
import { ROUTE_PROBLEM_LABELS, ROUTE_SOURCE_LABELS, type ResolvedRoute } from "@/lib/approvals/route-resolution";
import { cn } from "@/lib/utils/cn";

const MODE_LABELS = { single: "Single level", two_level: "Two levels" } as const;

// The employee's resolved approval route, its source and any problem. For
// the employee detail page.
export function RouteSummary({
  resolved,
  approvers,
  canEdit,
}: {
  resolved: ResolvedRoute;
  approvers: { level: number; name: string }[];
  canEdit: boolean;
}) {
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-section-title font-medium text-plum-900">
          Approval <em>route</em>
        </h2>
        {resolved.status !== "not_required" && (
          <Link
            href="/admin/approval-config"
            className="min-h-11 content-center text-sm font-semibold text-plum-700 hover:underline"
          >
            {canEdit ? "Change in Approval setup" : "Approval setup"}
          </Link>
        )}
      </div>
      {resolved.status === "not_required" && (
        <p className="text-[15px] text-muted">Admins take no leave, so no approval route is needed.</p>
      )}
      {resolved.status === "ok" && (
        <>
          <p className="text-[15px] text-plum-900">
            {MODE_LABELS[resolved.mode]}: {approverRoute(approvers)}
          </p>
          <p className="text-[13px] text-muted">Source: {ROUTE_SOURCE_LABELS[resolved.source]}</p>
        </>
      )}
      {resolved.status === "problem" && (
        <div className={cn("rounded-input px-4 py-3 text-sm", "bg-status-rejected-bg text-status-rejected-text")} role="status">
          <p className="font-semibold">
            {resolved.problem === "no_route" ? "No approval route" : ROUTE_PROBLEM_LABELS[resolved.problem]}
          </p>
          <p className="mt-1">
            {resolved.message} They can&apos;t apply for leave until this is fixed.
            {resolved.source && ` (Source: ${ROUTE_SOURCE_LABELS[resolved.source]}.)`}
          </p>
        </div>
      )}
    </Card>
  );
}

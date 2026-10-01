import Link from "next/link";

import { daysLabel, halfDaySuffix, LEAVE_LABELS } from "@/components/leave/labels";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDays } from "@/lib/leave-engine/balance";
import { cn } from "@/lib/utils/cn";
import { formatDateRange, formatDisplayDate, todayIsoInBrunei } from "@/lib/utils/dates";
import type { AllDecisions, DecisionRow } from "@/server/approval-decisions.service";
import { DECISION_FILTER_ACTIONS, type DecisionFilterAction, type DecisionsFilter } from "@/validations/approval";

import { OverrideButton } from "./override-button";

// "All decisions" on /approvals (admin only). Display only: the filters are
// a plain GET form, overriding is enforced by the server.

const ACTION_LABELS: Record<DecisionFilterAction, string> = {
  approved: "Approved",
  rejected: "Rejected",
  approval_revoked: "Approval revoked",
  rejection_overridden: "Rejection overridden",
};

// "Approved by Daniel Tan (level 1)", "Approval revoked by Vaidik Dubey".
function decisionText(row: DecisionRow): string {
  const tags = [row.byAdmin ? "admin" : null, row.level ? `level ${row.level}` : null].filter(Boolean);
  return `${ACTION_LABELS[row.action]} by ${row.decidedByName}${tags.length ? ` (${tags.join(", ")})` : ""}`;
}

function pageHref(filter: DecisionsFilter, range: { from: string; to: string }, page: number): string {
  const params = new URLSearchParams({ view: "decisions", from: range.from, to: range.to });
  for (const key of ["approverId", "action", "branchId", "employeeId"] as const) {
    const value = filter[key];
    if (value) params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  return `/approvals?${params}`;
}

export function AllDecisionsView({ data, filter }: { data: AllDecisions; filter: DecisionsFilter }) {
  const { range, summary, page, options } = data;
  return (
    <div className="space-y-8">
      <form method="get" action="/approvals" className="space-y-4 rounded-card bg-lilac-50 p-4 sm:p-5">
        <input type="hidden" name="view" value="decisions" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="decisions-from">From</Label>
            <Input id="decisions-from" name="from" type="date" defaultValue={range.from} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="decisions-to">To</Label>
            <Input id="decisions-to" name="to" type="date" defaultValue={range.to} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="decisions-approver">Decided by</Label>
            <Select id="decisions-approver" name="approverId" defaultValue={filter.approverId ?? ""}>
              <option value="">Everyone</option>
              {options.approvers.map((approver) => (
                <option key={approver.id} value={approver.id}>
                  {approver.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="decisions-action">Action</Label>
            <Select id="decisions-action" name="action" defaultValue={filter.action ?? ""}>
              <option value="">All actions</option>
              {DECISION_FILTER_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {ACTION_LABELS[action]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="decisions-branch">Branch</Label>
            <Select id="decisions-branch" name="branchId" defaultValue={filter.branchId ?? ""}>
              <option value="">All branches</option>
              {options.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="decisions-employee">Employee</Label>
            <Select id="decisions-employee" name="employeeId" defaultValue={filter.employeeId ?? ""}>
              <option value="">Everyone</option>
              {options.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link
            href="/approvals?view=decisions"
            className="inline-flex min-h-11 items-center justify-center text-sm font-semibold text-plum-700 hover:underline focus-visible:outline-2 focus-visible:outline-plum-700"
          >
            Clear filters
          </Link>
          <Button type="submit">Show decisions</Button>
        </div>
      </form>

      <section className="space-y-3" aria-labelledby="decisions-summary">
        <h2 id="decisions-summary" className="font-display text-section-title font-medium text-plum-900">
          By <em>approver</em>
        </h2>
        <p className="text-[13px] text-muted">
          {formatDisplayDate(range.from)} – {formatDisplayDate(range.to)}. &ldquo;Waiting now&rdquo; is today&apos;s
          count, whatever the dates.
        </p>
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[480px] text-left text-[15px]">
            <thead className="text-[13px] text-muted">
              <tr className="border-b border-border">
                <th scope="col" className="px-4 py-3 font-semibold">Approver</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Approved</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Rejected</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Overrides</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Waiting now</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <th scope="row" className="px-4 py-3 font-semibold text-plum-900">{row.name}</th>
                  <td className="px-4 py-3 text-right text-plum-900">{row.approved}</td>
                  <td className="px-4 py-3 text-right text-plum-900">{row.rejected}</td>
                  <td className="px-4 py-3 text-right text-plum-900">{row.overrides}</td>
                  <td className="px-4 py-3 text-right text-plum-900">{row.waiting}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="decisions-list">
        <h2 id="decisions-list" className="font-display text-section-title font-medium text-plum-900">
          Every <em>decision</em>
        </h2>
        <p className="text-[13px] text-muted">
          {page.total === 0
            ? "No decisions match these filters."
            : `${page.total} ${page.total === 1 ? "decision" : "decisions"}, newest first.`}
        </p>
        {page.items.length > 0 && (
          <ul className="space-y-3">
            {page.items.map((row) => (
              <DecisionCard key={row.key} row={row} />
            ))}
          </ul>
        )}
        {page.pages > 1 && (
          <nav aria-label="Pages" className="flex items-center justify-between gap-3">
            <PageLink href={page.page > 1 ? pageHref(filter, range, page.page - 1) : null}>Previous</PageLink>
            <span className="text-[13px] text-muted">
              Page {page.page} of {page.pages}
            </span>
            <PageLink href={page.page < page.pages ? pageHref(filter, range, page.page + 1) : null}>Next</PageLink>
          </nav>
        )}
      </section>
    </div>
  );
}

function PageLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  const className = "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold";
  if (!href) return <span className={cn(className, "text-muted")}>{children}</span>;
  return (
    <Link
      href={href}
      className={cn(
        className,
        "bg-lilac-50 text-plum-900 hover:bg-lilac-100 focus-visible:outline-2 focus-visible:outline-plum-700",
      )}
    >
      {children}
    </Link>
  );
}

function DecisionCard({ row }: { row: DecisionRow }) {
  const range = formatDateRange(row.startDate, row.endDate);
  const days = daysLabel(formatDays(row.totalDays), row.totalDays);
  const isOverride = row.action === "approval_revoked" || row.action === "rejection_overridden";
  return (
    <li className="rounded-card border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="font-semibold break-words text-plum-900">
            <Link href={`/admin/employees/${row.employeeId}`} className="hover:underline">
              {row.employeeName}
            </Link>
            <span className="font-normal text-muted"> · {row.branchName}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-plum-900">{LEAVE_LABELS[row.code]}</span>
            {row.code === "unpaid" && <StatusBadge status="unpaid" />}
            <StatusBadge status={row.status} />
          </div>
          <p className="text-[15px] text-plum-900">
            {range} · {days}
            {halfDaySuffix(row)}
          </p>
          <p className={cn("text-[13px]", isOverride ? "font-semibold text-plum-900" : "text-plum-900")}>
            {decisionText(row)} · {formatDisplayDate(todayIsoInBrunei(row.actedAt))}
          </p>
          {row.remarks && (
            <p className="text-[13px] break-words text-muted">
              {isOverride ? "Reason" : "Remarks"}: &ldquo;{row.remarks}&rdquo;
            </p>
          )}
        </div>
        {row.override && (
          <div className="shrink-0">
            <OverrideButton
              applicationId={row.applicationId}
              action={row.override}
              summary={`${row.employeeName} · ${LEAVE_LABELS[row.code]}, ${range} (${days})`}
            />
          </div>
        )}
      </div>
    </li>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { approverRoute } from "@/components/leave/labels";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ROUTE_PROBLEM_LABELS, ROUTE_SOURCE_LABELS } from "@/lib/approvals/route-resolution";
import { ROLE_LABELS } from "@/lib/auth/rbac";
import { cn } from "@/lib/utils/cn";
import type { SetupEmployeeRow } from "@/server/approval-route.service";

import { RouteDialog, sendJson, type ApproverOption, type RouteValue, type SaveResult } from "./route-dialog";

// Resolved route per employee (admins excluded), with inline and bulk
// overrides and "reset to default". Filters are handled by the page.
export function EmployeeRoutes({
  rows,
  approverOptions,
  canEdit,
}: {
  rows: SetupEmployeeRow[];
  approverOptions: ApproverOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ ids: string[]; title: string; initial: RouteValue | null } | null>(null);
  const [resetting, setResetting] = useState<{ ids: string[]; label: string } | null>(null);
  const [resetError, setResetError] = useState<SaveResult>(null);
  const [pending, setPending] = useState(false);

  const visibleIds = rows.map((row) => row.id);
  const selectedIds = visibleIds.filter((id) => selected.has(id));
  const allSelected = visibleIds.length > 0 && selectedIds.length === visibleIds.length;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveOverride(route: RouteValue) {
    if (!editing) return null;
    const outcome =
      editing.ids.length === 1
        ? await sendJson(`/api/approval-routes/employees/${editing.ids[0]}`, "PUT", route)
        : await sendJson("/api/approval-routes/employees/bulk", "POST", { action: "set", employeeIds: editing.ids, route });
    if (!outcome) {
      setSelected(new Set());
      router.refresh();
    }
    return outcome;
  }

  async function reset() {
    if (!resetting) return;
    setPending(true);
    const outcome = await sendJson("/api/approval-routes/employees/bulk", "POST", {
      action: "reset",
      employeeIds: resetting.ids,
    });
    setPending(false);
    setResetError(outcome);
    if (!outcome) {
      setResetting(null);
      setSelected(new Set());
      router.refresh();
    }
  }

  if (rows.length === 0) return <p className="text-[15px] text-muted">No employees match these filters.</p>;

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex flex-col gap-3 rounded-card bg-lilac-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold text-plum-900">
            <input
              type="checkbox"
              className="size-5 accent-plum-900"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(visibleIds))}
            />
            {selectedIds.length > 0 ? `${selectedIds.length} selected` : "Select all shown"}
          </label>
          {selectedIds.length > 0 && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                className="h-11 px-5 text-sm"
                onClick={() =>
                  setEditing({ ids: selectedIds, title: `Override for ${selectedIds.length} employees`, initial: null })
                }
              >
                Set override
              </Button>
              <Button
                variant="secondary"
                className="h-11 px-5 text-sm"
                onClick={() => setResetting({ ids: selectedIds, label: `${selectedIds.length} selected employees` })}
              >
                Reset to default
              </Button>
            </div>
          )}
        </div>
      )}

      <ul className="space-y-3">
        {rows.map((row) => {
          const ok = row.resolved.status === "ok";
          const source = row.resolved.status === "ok" || row.resolved.status === "problem" ? row.resolved.source : null;
          return (
            <li key={row.id} className="rounded-card border border-border bg-surface p-4 sm:p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 gap-3">
                  {canEdit && (
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.fullName}`}
                      className="mt-1 size-5 shrink-0 accent-plum-900"
                      checked={selected.has(row.id)}
                      onChange={() => toggle(row.id)}
                    />
                  )}
                  <div className="min-w-0 space-y-1">
                    <Link
                      href={`/admin/employees/${row.id}`}
                      className="font-semibold break-words text-plum-900 hover:underline focus-visible:outline-2 focus-visible:outline-plum-700"
                    >
                      {row.fullName}
                    </Link>
                    <p className="text-[13px] text-muted">
                      {row.employeeCode} · {ROLE_LABELS[row.role]} · {row.departmentName} · {row.branchName}
                    </p>
                    <p className="text-[15px] text-plum-900">
                      {ok ? approverRoute(row.approvers) : row.resolved.status === "problem" ? row.resolved.message : ""}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                          ok
                            ? "bg-status-approved-bg text-status-approved-text"
                            : "bg-status-rejected-bg text-status-rejected-text",
                        )}
                      >
                        {row.resolved.status === "problem" ? ROUTE_PROBLEM_LABELS[row.resolved.problem] : "OK"}
                      </span>
                      {source && <span className="text-[13px] text-muted">{ROUTE_SOURCE_LABELS[source]}</span>}
                    </div>
                  </div>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="secondary"
                      className="h-11 px-5 text-sm"
                      onClick={() =>
                        setEditing({ ids: [row.id], title: `Override for ${row.fullName}`, initial: row.override })
                      }
                    >
                      {row.override ? "Edit override" : "Override"}
                    </Button>
                    {row.override && (
                      <Button
                        variant="ghost"
                        className="h-11 px-4 text-sm"
                        onClick={() => setResetting({ ids: [row.id], label: row.fullName })}
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <RouteDialog
        open={editing !== null}
        title={editing?.title ?? "Override"}
        description="An override replaces the manager rule and the branch default for these people."
        initial={editing?.initial ?? null}
        approverOptions={approverOptions}
        onSave={saveOverride}
        onClose={() => setEditing(null)}
      />

      <Dialog
        open={resetting !== null}
        onClose={() => {
          setResetting(null);
          setResetError(null);
        }}
        title="Reset to the default route?"
      >
        <div className="space-y-5">
          <p className="text-[15px] text-plum-900">
            {resetting?.label}: the override is removed and the manager rule or branch default applies again. Pending
            requests move to the default approvers for levels not yet decided.
          </p>
          {resetError && <Alert>{resetError.error}</Alert>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setResetting(null)} disabled={pending}>
              Keep override
            </Button>
            <Button onClick={reset} loading={pending} loadingText="Resetting…">
              Reset to default
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

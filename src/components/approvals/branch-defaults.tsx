"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { approverRoute } from "@/components/leave/labels";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import type { RouteView } from "@/server/approval-route.service";

import { RouteDialog, sendJson, type ApproverOption, type RouteValue, type SaveResult } from "./route-dialog";

type Branch = { id: string; name: string; route: RouteView | null };

const MODE_LABELS = { single: "Single level", two_level: "Two levels" } as const;

function toValue(route: RouteView | null): RouteValue | null {
  if (!route) return null;
  return {
    mode: route.mode,
    level1ApproverId: route.approvers.find((a) => a.level === 1)?.id ?? "",
    level2ApproverId: route.approvers.find((a) => a.level === 2)?.id ?? null,
  };
}

// One default route per branch, for its employees and HR viewers (managers
// use the managers' rule).
export function BranchDefaults({
  branches,
  approverOptions,
  canEdit,
}: {
  branches: Branch[];
  approverOptions: ApproverOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Branch | null>(null);
  const [removing, setRemoving] = useState<Branch | null>(null);
  const [removeError, setRemoveError] = useState<SaveResult>(null);
  const [pending, setPending] = useState(false);

  async function save(route: RouteValue) {
    const outcome = await sendJson(`/api/approval-routes/branches/${editing!.id}`, "PUT", route);
    if (!outcome) router.refresh();
    return outcome;
  }

  async function remove() {
    if (!removing) return;
    setPending(true);
    const outcome = await sendJson(`/api/approval-routes/branches/${removing.id}`, "DELETE");
    setPending(false);
    setRemoveError(outcome);
    if (!outcome) {
      setRemoving(null);
      router.refresh();
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-display text-section-title font-medium text-plum-900">
          Branch <em>defaults</em>
        </h2>
        <p className="mt-1 text-[15px] text-muted">
          Employees and HR viewers follow their branch&apos;s default unless they have an override.
        </p>
      </div>
      {branches.length === 0 ? (
        <p className="text-[15px] text-muted">No active branches.</p>
      ) : (
        <ul className="divide-y divide-border">
          {branches.map((branch) => (
            <li key={branch.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold text-plum-900">{branch.name}</p>
                {branch.route ? (
                  <p className="text-[15px] text-plum-900">
                    {MODE_LABELS[branch.route.mode]}: {approverRoute(branch.route.approvers)}
                  </p>
                ) : (
                  <p className="text-[15px] text-status-rejected-text">No default route: its staff show “No route”.</p>
                )}
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-2">
                  <Button variant="secondary" className="h-11 px-5 text-sm" onClick={() => setEditing(branch)}>
                    {branch.route ? "Edit" : "Set route"}
                  </Button>
                  {branch.route && (
                    <Button variant="ghost" className="h-11 px-4 text-sm" onClick={() => setRemoving(branch)}>
                      Remove
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <RouteDialog
        open={editing !== null}
        title={editing ? `Default route: ${editing.name}` : "Default route"}
        description="Applies to this branch's employees and HR viewers without an override."
        initial={toValue(editing?.route ?? null)}
        approverOptions={approverOptions}
        onSave={save}
        onClose={() => setEditing(null)}
      />

      <Dialog
        open={removing !== null}
        onClose={() => {
          setRemoving(null);
          setRemoveError(null);
        }}
        title="Remove this default route?"
      >
        <div className="space-y-5">
          <p className="text-[15px] text-plum-900">
            {removing?.name}: its employees and HR viewers without an override will show “No route” and cannot apply for
            leave until a route is set. Pending requests keep their current approvers.
          </p>
          {removeError && <Alert>{removeError.error}</Alert>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setRemoving(null)} disabled={pending}>
              Keep route
            </Button>
            <Button onClick={remove} loading={pending} loadingText="Removing…">
              Remove route
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}

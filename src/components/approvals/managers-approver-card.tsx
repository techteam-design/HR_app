"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldHint, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import { sendJson, type SaveResult } from "./route-dialog";

// "Managers' leave approver": approves every manager's leave (single level).
// Must be an active admin. Empty = the only active admin, if there is one.
export function ManagersApproverCard({
  settingId,
  resolved,
  adminOptions,
  canEdit,
}: {
  settingId: string | null;
  resolved: { id: string; name: string; fromSetting: boolean } | null;
  adminOptions: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(settingId ?? "");
  const [result, setResult] = useState<SaveResult>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    setSaved(false);
    const outcome = await sendJson("/api/approval-routes/settings", "PUT", { managersApproverId: value || null });
    setPending(false);
    setResult(outcome);
    if (!outcome) {
      setSaved(true);
      router.refresh();
    }
  }

  const current = resolved
    ? `${resolved.name}${resolved.fromSetting ? "" : " (the only active admin)"}`
    : "Nobody: managers show “No route” until an approver is chosen.";

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-display text-section-title font-medium text-plum-900">
          Managers&apos; leave <em>approver</em>
        </h2>
        <p className="mt-1 text-[15px] text-muted">
          Every manager&apos;s leave (team heads included) goes to this admin, single level, unless the manager has an
          override.
        </p>
      </div>
      <p className="text-[15px] text-plum-900">
        <span className="eyebrow mr-2 text-plum-700">Now</span>
        {current}
      </p>
      {canEdit && (
        <div className="space-y-3">
          {result && <Alert>{result.error}</Alert>}
          {saved && <Alert tone="notice">Saved.</Alert>}
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="managers-approver">Approver</Label>
              <Select id="managers-approver" value={value} onChange={(event) => setValue(event.target.value)}>
                <option value="">Not set (use the only active admin)</option>
                {adminOptions.map((admin) => (
                  <option key={admin.id} value={admin.id}>
                    {admin.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button onClick={save} loading={pending} loadingText="Saving…" disabled={value === (settingId ?? "")}>
              Save
            </Button>
          </div>
          <FieldHint>Pending manager requests move to the new approver.</FieldHint>
        </div>
      )}
    </Card>
  );
}

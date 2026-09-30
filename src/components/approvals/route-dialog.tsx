"use client";

import { useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FieldError, FieldHint, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ROLE_LABELS, type Role } from "@/lib/auth/rbac";

export type ApproverOption = { id: string; name: string; role: Role };

export type RouteValue = { mode: "single" | "two_level"; level1ApproverId: string; level2ApproverId: string | null };

export type SaveResult = { error: string; fieldErrors?: Record<string, string>; details?: string[] } | null;

// PUT/POST/DELETE JSON and turn an error response into a SaveResult.
export async function sendJson(url: string, method: "PUT" | "POST" | "DELETE", body?: object): Promise<SaveResult> {
  try {
    const response = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.ok) return null;
    const json = (await response.json().catch(() => null)) as {
      error?: string;
      fieldErrors?: Record<string, string>;
      details?: string[];
    } | null;
    return {
      error: json?.error ?? "Could not save. Please try again.",
      fieldErrors: json?.fieldErrors,
      details: json?.details,
    };
  } catch {
    return { error: "Could not reach the server. Check your connection and try again." };
  }
}

// Mode, level 1 and level 2 approver. Used for branch defaults and
// per-employee overrides (single and bulk). The server re-checks everything.
export function RouteDialog({
  open,
  title,
  description,
  initial,
  approverOptions,
  onSave,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  initial: RouteValue | null;
  approverOptions: ApproverOption[];
  onSave: (route: RouteValue) => Promise<SaveResult>;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {open && (
        <RouteForm
          description={description}
          initial={initial}
          approverOptions={approverOptions}
          onSave={onSave}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function RouteForm({
  description,
  initial,
  approverOptions,
  onSave,
  onClose,
}: {
  description?: string;
  initial: RouteValue | null;
  approverOptions: ApproverOption[];
  onSave: (route: RouteValue) => Promise<SaveResult>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<RouteValue["mode"]>(initial?.mode ?? "single");
  const [level1, setLevel1] = useState(initial?.level1ApproverId ?? "");
  const [level2, setLevel2] = useState(initial?.level2ApproverId ?? "");
  const [result, setResult] = useState<SaveResult>(null);
  const [pending, setPending] = useState(false);
  const errors = result?.fieldErrors ?? {};

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const outcome = await onSave({
      mode,
      level1ApproverId: level1,
      level2ApproverId: mode === "two_level" ? level2 || null : null,
    });
    setPending(false);
    setResult(outcome);
    if (!outcome) onClose();
  }

  const options = (
    <>
      <option value="">Choose…</option>
      {approverOptions.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name} ({ROLE_LABELS[option.role]})
        </option>
      ))}
    </>
  );

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {description && <p className="text-[15px] text-muted">{description}</p>}
      {result && (
        <Alert>
          {result.error}
          {result.details && (
            <span className="mt-1 block font-normal">
              {result.details.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </span>
          )}
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="route-mode">Approval</Label>
        <Select id="route-mode" value={mode} onChange={(event) => setMode(event.target.value as RouteValue["mode"])}>
          <option value="single">Single level (one approver)</option>
          <option value="two_level">Two levels (level 1, then level 2)</option>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="route-level1">{mode === "two_level" ? "Level 1 approver (e.g. team head)" : "Approver"}</Label>
        <Select
          id="route-level1"
          value={level1}
          onChange={(event) => setLevel1(event.target.value)}
          invalid={!!errors.level1ApproverId}
          aria-describedby={errors.level1ApproverId ? "route-level1-error" : undefined}
        >
          {options}
        </Select>
        <FieldError id="route-level1-error">{errors.level1ApproverId}</FieldError>
      </div>
      {mode === "two_level" && (
        <div className="space-y-2">
          <Label htmlFor="route-level2">Level 2 approver (e.g. manager)</Label>
          <Select
            id="route-level2"
            value={level2}
            onChange={(event) => setLevel2(event.target.value)}
            invalid={!!errors.level2ApproverId}
            aria-describedby={errors.level2ApproverId ? "route-level2-error" : "route-level2-hint"}
          >
            {options}
          </Select>
          {!errors.level2ApproverId && (
            <FieldHint id="route-level2-hint">Decides after level 1 approves. Must be a different person.</FieldHint>
          )}
          <FieldError id="route-level2-error">{errors.level2ApproverId}</FieldError>
        </div>
      )}
      <p className="text-[13px] text-muted">
        Only active managers and admins can approve. Pending requests move to the new approvers for levels not yet
        decided.
      </p>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending} loadingText="Saving…">
          Save route
        </Button>
      </div>
    </form>
  );
}

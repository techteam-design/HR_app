"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/input";
import { MIN_OVERRIDE_REASON_LENGTH, OVERRIDE_ACTION_LABELS, type OverrideAction } from "@/lib/approvals/override";

const TEXT: Record<OverrideAction, { title: string; explain: string; keep: string; working: string }> = {
  revoke: {
    title: "Revoke this approval?",
    explain:
      "The request ends as “Approval revoked” and the days go back to the balance. This is final: to take the leave after all, the employee applies again (or you apply on their behalf).",
    keep: "Keep approved",
    working: "Revoking…",
  },
  approve: {
    title: "Approve this rejected request?",
    explain:
      "The request becomes approved and the days come off the balance. The balance and other leave on these dates are checked first.",
    keep: "Leave rejected",
    working: "Approving…",
  },
};

// An admin's "Revoke approval" or "Approve anyway", with a required reason.
// The server re-checks everything (POST /api/approvals/[id]/override).
export function OverrideButton({
  applicationId,
  action,
  summary,
}: {
  applicationId: string;
  action: OverrideAction;
  // e.g. "Maria Santos · Annual leave, 14 – 18 Oct 2026 (4 days)"
  summary: string;
}) {
  const text = TEXT[action];
  const label = OVERRIDE_ACTION_LABELS[action];
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const id = `override-reason-${applicationId}`;

  function close() {
    setOpen(false);
    setReason("");
    setReasonError(null);
    setError(null);
  }

  async function confirm() {
    setError(null);
    if (reason.trim().length < MIN_OVERRIDE_REASON_LENGTH) {
      setReasonError(`A reason is required (at least ${MIN_OVERRIDE_REASON_LENGTH} characters).`);
      return;
    }
    setReasonError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/approvals/${applicationId}/override`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        fieldErrors?: Record<string, string>;
      } | null;
      if (!response.ok) {
        setReasonError(body?.fieldErrors?.reason ?? null);
        setError(body?.error ?? "Could not save. Please try again.");
        return;
      }
      close();
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} className="h-11 px-5 text-sm">
        {label}
      </Button>
      <Dialog open={open} onClose={close} title={text.title}>
        <div className="space-y-5">
          <p className="text-[15px] text-plum-900">{summary}</p>
          <p className="text-[15px] text-muted">{text.explain}</p>
          {error && <Alert>{error}</Alert>}
          <div className="space-y-2">
            <Label htmlFor={id}>Reason</Label>
            <Input
              id={id}
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              autoComplete="off"
              invalid={!!reasonError}
              aria-describedby={reasonError ? `${id}-error` : `${id}-hint`}
            />
            {!reasonError && (
              <FieldHint id={`${id}-hint`}>Required. Shown in the employee&apos;s history and the approver&apos;s decisions.</FieldHint>
            )}
            <FieldError id={`${id}-error`}>{reasonError}</FieldError>
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={close} disabled={pending}>
              {text.keep}
            </Button>
            <Button onClick={confirm} loading={pending} loadingText={text.working}>
              {label}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FieldError, FieldHint, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { MIN_REMARKS_LENGTH } from "@/validations/approval";

type Action = "approve" | "reject";

const TEXT: Record<Action, { title: string; confirm: string; loading: string }> = {
  approve: { title: "Approve this request?", confirm: "Approve", loading: "Approving…" },
  reject: { title: "Reject this request?", confirm: "Reject", loading: "Rejecting…" },
};

// Approve (remarks optional) or reject (remarks required). The server checks
// that the viewer may decide at this level and re-checks the balance at the
// final approval.
export function DecisionButtons({
  applicationId,
  expectedLevel,
  summary,
  finalApproval,
  asAdminFor,
}: {
  applicationId: string;
  expectedLevel: 1 | 2;
  // e.g. "Priya Nair · Annual leave, 14 – 18 Oct 2026 (4 days)"
  summary: string;
  // Approving now is the final approval (the balance is used).
  finalApproval: boolean;
  // Set when an admin decides in place of the assigned approver.
  asAdminFor: string | null;
}) {
  const router = useRouter();
  const [action, setAction] = useState<Action | null>(null);
  const [remarks, setRemarks] = useState("");
  const [remarksError, setRemarksError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fieldId = `remarks-${applicationId}`;

  function close() {
    setAction(null);
    setRemarks("");
    setRemarksError(null);
    setError(null);
  }

  async function confirm() {
    if (!action) return;
    setError(null);
    if (action === "reject" && remarks.trim().length < MIN_REMARKS_LENGTH) {
      setRemarksError(`Remarks are required to reject (at least ${MIN_REMARKS_LENGTH} characters).`);
      return;
    }
    setRemarksError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/approvals/${applicationId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, remarks, expectedLevel }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        fieldErrors?: Record<string, string>;
      } | null;
      if (!response.ok) {
        setRemarksError(body?.fieldErrors?.remarks ?? null);
        setError(body?.error ?? "Could not save the decision. Please try again.");
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

  const text = action ? TEXT[action] : TEXT.approve;

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={() => setAction("approve")} className="h-11 px-5 text-sm">
          Approve
        </Button>
        <Button variant="secondary" onClick={() => setAction("reject")} className="h-11 px-5 text-sm">
          Reject
        </Button>
      </div>
      <Dialog open={action !== null} onClose={close} title={text.title}>
        <div className="space-y-5">
          <p className="text-[15px] text-plum-900">{summary}</p>
          {asAdminFor && (
            <p className="text-[15px] text-muted">
              You are deciding as admin in place of {asAdminFor}. Your name is recorded on the decision.
            </p>
          )}
          {action === "approve" && finalApproval && (
            <p className="text-[15px] text-muted">This is the final approval: the days come off the balance now.</p>
          )}
          {action === "approve" && !finalApproval && (
            <p className="text-[15px] text-muted">The request then goes to the level 2 approver.</p>
          )}
          {action === "reject" && <p className="text-[15px] text-muted">Rejecting ends the request.</p>}
          {error && <Alert>{error}</Alert>}
          <div className="space-y-2">
            <Label htmlFor={fieldId}>Remarks{action === "approve" ? " (optional)" : ""}</Label>
            <textarea
              id={fieldId}
              value={remarks}
              maxLength={500}
              rows={3}
              onChange={(event) => setRemarks(event.target.value)}
              aria-invalid={!!remarksError || undefined}
              aria-describedby={remarksError ? `${fieldId}-error` : `${fieldId}-hint`}
              className={cn(
                "block w-full rounded-input border bg-surface px-4 py-3 text-base text-plum-900",
                "focus:outline-2 focus:outline-offset-0 focus:outline-plum-700",
                remarksError ? "border-status-rejected-text" : "border-input-border hover:border-lilac-200",
              )}
            />
            {!remarksError && (
              <FieldHint id={`${fieldId}-hint`}>
                {action === "reject" ? "Required. The employee sees your remarks." : "The employee sees your remarks."}
              </FieldHint>
            )}
            <FieldError id={`${fieldId}-error`}>{remarksError}</FieldError>
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={close} disabled={pending}>
              Back
            </Button>
            <Button onClick={confirm} loading={pending} loadingText={text.loading}>
              {text.confirm}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

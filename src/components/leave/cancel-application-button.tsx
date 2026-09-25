"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/input";

// Cancel with confirmation. An admin cancelling a request must give a note;
// the server enforces who may cancel what.
export function CancelApplicationButton({
  applicationId,
  summary,
  asAdmin,
}: {
  applicationId: string;
  // e.g. "Annual leave, 14 – 18 Oct 2026 (4 days)"
  summary: string;
  asAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function close() {
    setOpen(false);
    setNote("");
    setNoteError(null);
    setError(null);
  }

  async function confirm() {
    setError(null);
    if (asAdmin && note.trim().length < 3) {
      setNoteError("A note is required (at least 3 characters).");
      return;
    }
    setNoteError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/leave/applications/${applicationId}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: asAdmin ? note : null }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        fieldErrors?: Record<string, string>;
      } | null;
      if (!response.ok) {
        setNoteError(body?.fieldErrors?.note ?? null);
        setError(body?.error ?? "Could not cancel. Please try again.");
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
        Cancel request
      </Button>
      <Dialog open={open} onClose={close} title="Cancel this request?">
        <div className="space-y-5">
          <p className="text-[15px] text-plum-900">{summary}</p>
          <p className="text-[15px] text-muted">
            The days go back to the balance straight away. This can&apos;t be undone; to take the leave after all,
            submit a new request.
          </p>
          {error && <Alert>{error}</Alert>}
          {asAdmin && (
            <div className="space-y-2">
              <Label htmlFor={`cancel-note-${applicationId}`}>Note</Label>
              <Input
                id={`cancel-note-${applicationId}`}
                value={note}
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
                autoComplete="off"
                invalid={!!noteError}
                aria-describedby={noteError ? `cancel-note-${applicationId}-error` : `cancel-note-${applicationId}-hint`}
              />
              {!noteError && (
                <FieldHint id={`cancel-note-${applicationId}-hint`}>Required. Say why the request is cancelled.</FieldHint>
              )}
              <FieldError id={`cancel-note-${applicationId}-error`}>{noteError}</FieldError>
            </div>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={close} disabled={pending}>
              Keep request
            </Button>
            <Button onClick={confirm} loading={pending} loadingText="Cancelling…">
              Cancel request
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

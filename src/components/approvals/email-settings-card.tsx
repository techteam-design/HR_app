"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/input";
import { MAX_REMINDER_AFTER_DAYS } from "@/validations/approval";

import { sendJson, type SaveResult } from "./route-dialog";

type TestOutcome = { status: "sent" | "failed" | "skipped" | "duplicate"; reason?: string; deliveredTo?: string };

const remindText = (days: number) =>
  days === 0 ? "Off: approvers get no reminders." : `After ${days} ${days === 1 ? "day" : "days"} waiting, then daily.`;

// Email settings on the Approval setup page: "Remind approvers after N days"
// (admin edits, HR viewer reads) and the admin's "Send test email".
export function EmailSettingsCard({ reminderAfterDays, canEdit }: { reminderAfterDays: number; canEdit: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(String(reminderAfterDays));
  const [result, setResult] = useState<SaveResult>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestOutcome | { status: "error"; reason: string } | null>(null);

  async function save() {
    setPending(true);
    setSaved(false);
    const outcome = await sendJson("/api/approval-routes/reminders", "PUT", { reminderAfterDays: value });
    setPending(false);
    setResult(outcome);
    if (!outcome) {
      setSaved(true);
      router.refresh();
    }
  }

  async function sendTest() {
    setTesting(true);
    setTest(null);
    try {
      const response = await fetch("/api/email/test", { method: "POST" });
      const body = (await response.json().catch(() => null)) as (TestOutcome & { error?: string }) | null;
      setTest(
        response.ok && body ? body : { status: "error", reason: body?.error ?? "Could not send. Please try again." },
      );
    } catch {
      setTest({ status: "error", reason: "Could not reach the server. Check your connection and try again." });
    } finally {
      setTesting(false);
    }
  }

  const fieldError = result?.fieldErrors?.reminderAfterDays;

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-display text-section-title font-medium text-plum-900">
          Email <em>reminders</em>
        </h2>
        <p className="mt-1 text-[15px] text-muted">
          At 9:00 AM each day, approvers get one email listing the requests that have waited for them at least this
          many days.
        </p>
      </div>
      <p className="text-[15px] text-plum-900">
        <span className="eyebrow mr-2 text-plum-700">Now</span>
        {remindText(reminderAfterDays)}
      </p>
      {canEdit && (
        <div className="space-y-3">
          {result && !fieldError && <Alert>{result.error}</Alert>}
          {saved && <Alert tone="notice">Saved.</Alert>}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,240px)_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="reminder-after-days">Remind approvers after (days)</Label>
              <Input
                id="reminder-after-days"
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_REMINDER_AFTER_DAYS}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                invalid={!!fieldError}
                aria-describedby={fieldError ? "reminder-after-days-error" : "reminder-after-days-hint"}
              />
            </div>
            <Button onClick={save} loading={pending} loadingText="Saving…" disabled={value === String(reminderAfterDays)}>
              Save
            </Button>
          </div>
          {fieldError ? (
            <FieldError id="reminder-after-days-error">{fieldError}</FieldError>
          ) : (
            <FieldHint id="reminder-after-days-hint">0 turns reminders off.</FieldHint>
          )}

          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-[15px] text-muted">
              Check that email works: sends one sample email to you (or, outside production, to the redirect address).
            </p>
            <Button variant="secondary" onClick={sendTest} loading={testing} loadingText="Sending…">
              Send test email
            </Button>
            {test && <TestResult outcome={test} />}
          </div>
        </div>
      )}
    </Card>
  );
}

function TestResult({ outcome }: { outcome: TestOutcome | { status: "error"; reason: string } }) {
  if (outcome.status === "sent") {
    return <Alert tone="notice">Sent to {outcome.deliveredTo}. Check that inbox (and its spam folder).</Alert>;
  }
  const label = outcome.status === "skipped" ? "Not sent" : "Sending failed";
  return (
    <Alert>
      {label}: {outcome.reason ?? "unknown reason"}
    </Alert>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDays } from "@/lib/leave-engine/balance";
import type { LeaveTypeCode } from "@/lib/leave-engine/constants";
import { fieldErrorsOf } from "@/validations/employee";
import { ADJUSTMENT_REASONS, adjustmentSchema } from "@/validations/leave";

import { ADJUSTMENT_REASON_LABELS, LEAVE_LABELS } from "./labels";

type AdjustableType = { code: LeaveTypeCode; available: number; periodLabel: string };

// Admin action: add an opening balance or correction to the current period.
// The server re-validates everything, including the negative-balance block.
export function AdjustBalanceButton({ employeeId, types }: { employeeId: string; types: AdjustableType[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [leaveType, setLeaveType] = useState<LeaveTypeCode>(types[0]?.code ?? "annual");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const selected = types.find((t) => t.code === leaveType);
  const describedBy = (name: string, hint = false) =>
    errors[name] ? `adjust-${name}-error` : hint ? `adjust-${name}-hint` : undefined;

  function close() {
    setOpen(false);
    setErrors({});
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const form = new FormData(event.currentTarget);
    const parsed = adjustmentSchema.safeParse({
      leaveType: String(form.get("leaveType") ?? ""),
      days: String(form.get("days") ?? ""),
      reason: String(form.get("reason") ?? ""),
      note: String(form.get("note") ?? ""),
    });
    if (!parsed.success) {
      setErrors(fieldErrorsOf(parsed.error));
      return;
    }
    if (selected && selected.available + parsed.data.days < 0) {
      setErrors({
        days: `This would leave ${formatDays(selected.available + parsed.data.days)} days available. The available balance cannot go below 0.`,
      });
      return;
    }
    setErrors({});

    setPending(true);
    try {
      const response = await fetch(`/api/employees/${employeeId}/adjustments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        fieldErrors?: Record<string, string>;
      } | null;
      if (!response.ok) {
        setErrors(body?.fieldErrors ?? {});
        setFormError(body?.error ?? "Could not save. Please try again.");
        return;
      }
      close();
      router.refresh();
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (types.length === 0) return null;

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Adjust balance
      </Button>
      <Dialog open={open} onClose={close} title="Adjust balance">
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <p className="text-[15px] text-muted">
            Adds days to (or removes days from) the current leave period. Adjustments cannot be edited or deleted;
            to fix a mistake, add another adjustment that offsets it.
          </p>
          {formError && <Alert>{formError}</Alert>}

          <div className="space-y-2">
            <Label htmlFor="adjust-leaveType">Leave type</Label>
            <Select
              id="adjust-leaveType"
              name="leaveType"
              value={leaveType}
              onChange={(event) => setLeaveType(event.target.value as LeaveTypeCode)}
              aria-describedby="adjust-leaveType-hint"
            >
              {types.map((type) => (
                <option key={type.code} value={type.code}>
                  {LEAVE_LABELS[type.code]}
                </option>
              ))}
            </Select>
            {selected && (
              <FieldHint id="adjust-leaveType-hint">
                {selected.periodLabel} · currently {formatDays(selected.available)} days available
              </FieldHint>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjust-days">Days</Label>
            <Input
              id="adjust-days"
              name="days"
              type="number"
              inputMode="decimal"
              step={0.5}
              invalid={!!errors.days}
              aria-describedby={describedBy("days", true)}
            />
            {!errors.days && (
              <FieldHint id="adjust-days-hint">Use a minus sign to remove days, e.g. -1.5. Steps of 0.5.</FieldHint>
            )}
            <FieldError id="adjust-days-error">{errors.days}</FieldError>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjust-reason">Reason</Label>
            <Select
              id="adjust-reason"
              name="reason"
              defaultValue=""
              invalid={!!errors.reason}
              aria-describedby={describedBy("reason")}
            >
              <option value="" disabled>
                Choose a reason
              </option>
              {ADJUSTMENT_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {ADJUSTMENT_REASON_LABELS[reason]}
                </option>
              ))}
            </Select>
            <FieldError id="adjust-reason-error">{errors.reason}</FieldError>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjust-note">Note</Label>
            <Input
              id="adjust-note"
              name="note"
              maxLength={500}
              autoComplete="off"
              invalid={!!errors.note}
              aria-describedby={describedBy("note", true)}
            />
            {!errors.note && (
              <FieldHint id="adjust-note-hint">Required. Say why, e.g. &quot;Unused days from the old system&quot;.</FieldHint>
            )}
            <FieldError id="adjust-note-error">{errors.note}</FieldError>
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} loadingText="Saving…">
              Save adjustment
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { HALF_DAY_SLOTS, SLOT_NAMES, formatSlotTimes, type HalfDayTimings } from "@/lib/leave-engine/half-day";
import { fieldErrorsOf } from "@/validations/employee";
import {
  HALF_DAY_TIMING_FIELDS,
  halfDayTimingsSchema,
  inputFromTimings,
  timingField,
  type HalfDayTimingsInput,
} from "@/validations/leave";

const GROUPS = [
  { classification: "local", title: "Local staff" },
  { classification: "foreign", title: "Foreign staff" },
] as const;

// The half-day slot times on the Leave policies page. The admin edits them
// (PUT /api/half-day-timings, manage_policies); hr_viewer sees them
// read-only. Applications keep the times they were booked with.
export function HalfDayTimingsCard({
  timings,
  lastChanged,
  canEdit,
}: {
  timings: HalfDayTimings;
  // e.g. "25 Sep 2026 by Aisha Rahman", or null if never edited in the app.
  lastChanged: string | null;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <Card className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow text-plum-700">All leave types</p>
          <h2 className="mt-1 font-display text-section-title font-medium text-plum-900">Half-day timings</h2>
        </div>
        {canEdit && !editing && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>

      {editing ? (
        <TimingsForm timings={timings} onDone={() => setEditing(false)} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {GROUPS.map((group) => (
              <div key={group.classification} className="rounded-input bg-lilac-50 px-4 py-3">
                <p className="text-[13px] font-semibold text-plum-900">{group.title}</p>
                <dl className="mt-2 space-y-1 text-[15px]">
                  {HALF_DAY_SLOTS.map((slot) => {
                    const times = timings[group.classification][slot];
                    return (
                      <div key={slot} className="flex justify-between gap-3">
                        <dt className="text-plum-700">{SLOT_NAMES[slot]}</dt>
                        <dd className="text-plum-900">{formatSlotTimes(times.start, times.end)}</dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ))}
          </div>
          <p className="text-[13px] text-muted">
            Requests keep the times they were booked with.
            {lastChanged && ` Last changed ${lastChanged}.`}
          </p>
        </>
      )}
    </Card>
  );
}

function TimingsForm({ timings, onDone }: { timings: HalfDayTimings; onDone: () => void }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const initial = inputFromTimings(timings);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(
      HALF_DAY_TIMING_FIELDS.map((field) => [field, String(form.get(field) ?? "")]),
    ) as HalfDayTimingsInput;
    const parsed = halfDayTimingsSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrorsOf(parsed.error));
      setFormError("Please check the highlighted fields.");
      return;
    }
    setErrors({});

    setPending(true);
    try {
      const response = await fetch("/api/half-day-timings", {
        method: "PUT",
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
      onDone();
      router.refresh();
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {formError && <Alert>{formError}</Alert>}
      <Alert tone="notice">
        New times apply to half days requested from now on. Existing requests keep the times they were booked with.
      </Alert>
      {GROUPS.map((group) => (
        <fieldset key={group.classification} className="space-y-3">
          <legend className="text-[13px] font-semibold text-plum-900">{group.title}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {HALF_DAY_SLOTS.map((slot) => (
              <div key={slot} className="grid grid-cols-2 gap-3">
                {(["start", "end"] as const).map((part) => {
                  const name = timingField(`${group.classification}.${slot}.${part}`);
                  const id = `timing-${name}`;
                  return (
                    <div key={part} className="space-y-1">
                      <Label htmlFor={id}>
                        {SLOT_NAMES[slot]} {part === "start" ? "starts" : "ends"}
                      </Label>
                      <Input
                        id={id}
                        name={name}
                        type="time"
                        step={300}
                        required
                        defaultValue={initial[name]}
                        invalid={!!errors[name]}
                        aria-describedby={errors[name] ? `${id}-error` : undefined}
                      />
                      <FieldError id={`${id}-error`}>{errors[name]}</FieldError>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </fieldset>
      ))}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending} loadingText="Saving…">
          Save timings
        </Button>
      </div>
    </form>
  );
}

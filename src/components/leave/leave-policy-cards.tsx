"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, type ArchTint } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDays } from "@/lib/leave-engine/balance";
import type { LeaveTypeCode } from "@/lib/leave-engine/constants";
import { describePolicy, type PolicySummaryInput } from "@/lib/leave-engine/policy-summary";
import { fieldErrorsOf } from "@/validations/employee";
import { ANNUAL_TABLE_YEARS, policyUpdateSchema } from "@/validations/leave";

import { LEAVE_TINTS } from "./labels";

export type PolicyView = PolicySummaryInput & {
  name: string;
  // e.g. "25 Sep 2026 by Aisha Rahman", or null if never edited in the app.
  lastChanged: string | null;
};

const TINT_TEXT: Record<ArchTint, string> = {
  lilac: "text-plum-700",
  blush: "text-blush-700",
  sage: "text-sage-700",
};

function Field({
  name,
  label,
  error,
  hint,
  children,
}: {
  name: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      {children}
      {hint && !error && <FieldHint id={`${name}-hint`}>{hint}</FieldHint>}
      <FieldError id={`${name}-error`}>{error}</FieldError>
    </div>
  );
}

// One card per leave type: the rules in plain English, and an Edit form.
// Admin only (the page and PATCH /api/leave-policies check manage_policies).
export function LeavePolicyCards({ policies }: { policies: PolicyView[] }) {
  return (
    <div className="space-y-6">
      {policies.map((policy) => (
        <PolicyCard key={policy.code} policy={policy} />
      ))}
    </div>
  );
}

function PolicyCard({ policy }: { policy: PolicyView }) {
  const [editing, setEditing] = useState(false);
  const tint = LEAVE_TINTS[policy.code];

  return (
    <Card className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={`eyebrow ${TINT_TEXT[tint]}`}>{policy.code === "unpaid" ? "Unpaid" : "Paid"}</p>
          <h2 className="mt-1 font-display text-section-title font-medium text-plum-900">{policy.name}</h2>
        </div>
        {!editing && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>

      {editing ? (
        <PolicyForm policy={policy} onDone={() => setEditing(false)} />
      ) : (
        <>
          <ul className="list-disc space-y-2 pl-5 text-[15px] text-plum-900">
            {describePolicy(policy).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {policy.code === "annual" && policy.entitlementTable && (
            <ol className="grid grid-cols-4 gap-2 sm:grid-cols-8" aria-label="Days by service year">
              {[...policy.entitlementTable]
                .sort((a, b) => a.serviceYear - b.serviceYear)
                .map((row, index, rows) => (
                  <li key={row.serviceYear} className="rounded-input bg-lilac-50 px-2 py-2 text-center">
                    <span className="block text-[12px] text-muted">
                      Year {row.serviceYear}
                      {index === rows.length - 1 ? "+" : ""}
                    </span>
                    <span className="block font-semibold text-plum-900">{formatDays(row.days)}</span>
                  </li>
                ))}
            </ol>
          )}
          {policy.lastChanged && <p className="text-[13px] text-muted">Last changed {policy.lastChanged}.</p>}
        </>
      )}
    </Card>
  );
}

const numberValue = (value: number | null) => (value === null ? "" : String(value));

function PolicyForm({ policy, onDone }: { policy: PolicyView; onDone: () => void }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [carryForward, setCarryForward] = useState(policy.carryForwardEnabled);

  const id = (name: string) => `${policy.code}-${name}`;
  const describedBy = (name: string, hint = false) =>
    errors[name] ? `${id(name)}-error` : hint ? `${id(name)}-hint` : undefined;

  function values(form: FormData): Record<string, unknown> & { code: LeaveTypeCode } {
    const text = (name: string) => String(form.get(name) ?? "");
    if (policy.code === "annual") {
      return {
        code: "annual",
        entitlementDays: Array.from({ length: ANNUAL_TABLE_YEARS }, (_, index) => text(`year${index + 1}`)),
        eligibilityMonthsLocal: text("eligibilityMonthsLocal"),
        eligibilityMonthsForeign: text("eligibilityMonthsForeign"),
        advanceNoticeDaysForeign: text("advanceNoticeDaysForeign"),
        carryForwardEnabled: carryForward,
        carryForwardCap: carryForward ? text("carryForwardCap") : null,
        carryForwardExpiryMonths: carryForward ? text("carryForwardExpiryMonths") : null,
      };
    }
    if (policy.code === "mc") {
      return {
        code: "mc",
        fixedDays: text("fixedDays"),
        eligibilityMonthsLocal: text("eligibilityMonthsLocal"),
        eligibilityMonthsForeign: text("eligibilityMonthsForeign"),
        prorateRounding: text("prorateRounding"),
      };
    }
    return { code: "unpaid", fixedDays: text("fixedDays") };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = policyUpdateSchema.safeParse(values(new FormData(event.currentTarget)));
    if (!parsed.success) {
      setErrors(fieldErrorsOf(parsed.error));
      setFormError("Please check the highlighted fields.");
      return;
    }
    setErrors({});

    setPending(true);
    try {
      const response = await fetch("/api/leave-policies", {
        method: "PATCH",
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

  const monthsFields = (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field name={id("eligibilityMonthsLocal")} label="Eligible after (months), local staff" error={errors.eligibilityMonthsLocal}>
        <Input
          id={id("eligibilityMonthsLocal")}
          name="eligibilityMonthsLocal"
          type="number"
          inputMode="numeric"
          min={0}
          max={24}
          defaultValue={policy.eligibilityMonthsLocal}
          invalid={!!errors.eligibilityMonthsLocal}
          aria-describedby={describedBy("eligibilityMonthsLocal")}
        />
      </Field>
      <Field name={id("eligibilityMonthsForeign")} label="Eligible after (months), foreign staff" error={errors.eligibilityMonthsForeign}>
        <Input
          id={id("eligibilityMonthsForeign")}
          name="eligibilityMonthsForeign"
          type="number"
          inputMode="numeric"
          min={0}
          max={24}
          defaultValue={policy.eligibilityMonthsForeign}
          invalid={!!errors.eligibilityMonthsForeign}
          aria-describedby={describedBy("eligibilityMonthsForeign")}
        />
      </Field>
    </div>
  );

  const fixedDaysField = (
    <Field name={id("fixedDays")} label="Days per calendar year" error={errors.fixedDays}>
      <Input
        id={id("fixedDays")}
        name="fixedDays"
        type="number"
        inputMode="decimal"
        step={0.5}
        min={0}
        defaultValue={numberValue(policy.fixedDays)}
        invalid={!!errors.fixedDays}
        aria-describedby={describedBy("fixedDays")}
      />
    </Field>
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {formError && <Alert>{formError}</Alert>}

      {policy.code === "annual" && (
        <>
          <fieldset className="space-y-3">
            <legend className="text-[13px] font-semibold text-plum-900">Days by service year</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: ANNUAL_TABLE_YEARS }, (_, index) => {
                const year = index + 1;
                const current = policy.entitlementTable?.find((row) => row.serviceYear === year)?.days ?? null;
                return (
                  <div key={year} className="space-y-1">
                    <Label htmlFor={id(`year${year}`)}>
                      Year {year}
                      {year === ANNUAL_TABLE_YEARS ? "+" : ""}
                    </Label>
                    <Input
                      id={id(`year${year}`)}
                      name={`year${year}`}
                      type="number"
                      inputMode="decimal"
                      step={0.5}
                      min={0}
                      defaultValue={numberValue(current)}
                      invalid={!!errors.entitlementDays}
                      aria-describedby={errors.entitlementDays ? `${id("entitlementDays")}-error` : undefined}
                    />
                  </div>
                );
              })}
            </div>
            <FieldHint>Year {ANNUAL_TABLE_YEARS} applies to every later year. Days cannot go down as years increase.</FieldHint>
            <FieldError id={`${id("entitlementDays")}-error`}>{errors.entitlementDays}</FieldError>
          </fieldset>

          {monthsFields}

          <Field
            name={id("advanceNoticeDaysForeign")}
            label="Advance notice for foreign staff (days)"
            error={errors.advanceNoticeDaysForeign}
          >
            <Input
              id={id("advanceNoticeDaysForeign")}
              name="advanceNoticeDaysForeign"
              type="number"
              inputMode="numeric"
              min={0}
              max={90}
              defaultValue={policy.advanceNoticeDaysForeign}
              invalid={!!errors.advanceNoticeDaysForeign}
              aria-describedby={describedBy("advanceNoticeDaysForeign")}
            />
          </Field>

          <div className="space-y-4">
            <Checkbox
              label="Carry unused days forward"
              description="Unused days move to the next leave year, up to the cap. Days above the cap are forfeited."
              checked={carryForward}
              onChange={(event) => setCarryForward(event.target.checked)}
            />
            {carryForward && (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field name={id("carryForwardCap")} label="Carry-forward cap (days)" error={errors.carryForwardCap}>
                  <Input
                    id={id("carryForwardCap")}
                    name="carryForwardCap"
                    type="number"
                    inputMode="decimal"
                    step={0.5}
                    min={0.5}
                    defaultValue={numberValue(policy.carryForwardCap)}
                    invalid={!!errors.carryForwardCap}
                    aria-describedby={describedBy("carryForwardCap")}
                  />
                </Field>
                <Field
                  name={id("carryForwardExpiryMonths")}
                  label="Carried days expire after (months)"
                  error={errors.carryForwardExpiryMonths}
                  hint="Leave empty for no expiry."
                >
                  <Input
                    id={id("carryForwardExpiryMonths")}
                    name="carryForwardExpiryMonths"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={24}
                    defaultValue={numberValue(policy.carryForwardExpiryMonths)}
                    invalid={!!errors.carryForwardExpiryMonths}
                    aria-describedby={describedBy("carryForwardExpiryMonths", true)}
                  />
                </Field>
              </div>
            )}
          </div>
        </>
      )}

      {policy.code === "mc" && (
        <>
          {fixedDaysField}
          {monthsFields}
          <Field
            name={id("prorateRounding")}
            label="Pro-rating rounding for mid-year joiners"
            error={errors.prorateRounding}
            hint="Until the client decides, the nearest half day is used (provisional)."
          >
            <Select
              id={id("prorateRounding")}
              name="prorateRounding"
              defaultValue={policy.prorateRounding ?? ""}
              invalid={!!errors.prorateRounding}
              aria-describedby={describedBy("prorateRounding", true)}
            >
              <option value="">Not decided yet</option>
              <option value="up">Round up to the next half day</option>
              <option value="down">Round down to the half day below</option>
              <option value="nearest">Round to the nearest half day</option>
            </Select>
          </Field>
        </>
      )}

      {policy.code === "unpaid" && fixedDaysField}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending} loadingText="Saving…">
          Save changes
        </Button>
      </div>
    </form>
  );
}

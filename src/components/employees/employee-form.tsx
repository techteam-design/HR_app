"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { todayIsoInSingapore } from "@/lib/utils/dates";
import {
  createEmployeeSchema,
  fieldErrorsOf,
  updateEmployeeSchema,
} from "@/validations/employee";

import { CLASSIFICATION_LABELS, GENDER_LABELS, ROLE_LABELS, STATUS_LABELS, unitLabel } from "./labels";
import { TemporaryPasswordNotice } from "./temporary-password-notice";

export type EmployeeFormValues = {
  fullName: string;
  employeeCode: string;
  email: string;
  phone: string | null;
  dateOfBirth: string;
  gender: "male" | "female";
  joinDate: string;
  designation: string;
  departmentId: string;
  branchId: string;
  classification: "local" | "foreign";
  reportingManagerId: string | null;
  role: keyof typeof ROLE_LABELS;
  status: "active" | "inactive" | "probation";
};

type Options = {
  departments: { id: string; name: string; isActive: boolean }[];
  branches: { id: string; name: string; isActive: boolean }[];
  managers: { id: string; fullName: string; employeeCode: string }[];
};

type Props =
  | { mode: "create"; options: Options }
  | { mode: "edit"; options: Options; employeeId: string; initial: EmployeeFormValues; isSelf: boolean };

type Created = { id: string; email: string; temporaryPassword: string | null };

const JOIN_DATE_NOTICE = "Leave balances will be recalculated for the current period.";
const CLASSIFICATION_NOTICE =
  "Leave eligibility and the advance-notice rule follow the new classification. Balances do not change.";

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-5">
      <h2 className="font-display text-section-title font-medium text-plum-900">{title}</h2>
      <div className="grid gap-5 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

export function EmployeeForm(props: Props) {
  const router = useRouter();
  const initial = props.mode === "edit" ? props.initial : undefined;
  const isInactive = initial?.status === "inactive";
  const isSelf = props.mode === "edit" && props.isSelf;

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [classification, setClassification] = useState(initial?.classification ?? "");
  const [joinDate, setJoinDate] = useState(initial?.joinDate ?? "");
  const [formKey, setFormKey] = useState(0);

  const joinDateChanged = props.mode === "edit" && joinDate !== props.initial.joinDate;
  const classificationChanged = props.mode === "edit" && classification !== props.initial.classification;

  const describedBy = (name: string, hint = false) =>
    errors[name] ? `${name}-error` : hint ? `${name}-hint` : undefined;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "");
    const values = {
      fullName: text("fullName"),
      employeeCode: text("employeeCode"),
      email: text("email"),
      phone: text("phone"),
      dateOfBirth: text("dateOfBirth"),
      gender: text("gender"),
      joinDate: text("joinDate"),
      designation: text("designation"),
      departmentId: text("departmentId"),
      branchId: text("branchId"),
      classification: text("classification"),
      reportingManagerId: text("reportingManagerId"),
      role: text("role"),
      // Inactive employees keep their status (reactivate from the profile);
      // the server ignores this value for them.
      status: isInactive ? "active" : text("status"),
      ...(props.mode === "create" ? { createLogin: form.get("createLogin") === "on" } : {}),
    };

    const today = todayIsoInSingapore();
    const parsed =
      props.mode === "create"
        ? createEmployeeSchema(today).safeParse(values)
        : updateEmployeeSchema(today).safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrorsOf(parsed.error));
      setFormError("Please check the highlighted fields.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setErrors({});

    setPending(true);
    try {
      const response = await fetch(
        props.mode === "create" ? "/api/employees" : `/api/employees/${props.employeeId}`,
        {
          method: props.mode === "create" ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(parsed.data),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        id?: string;
        temporaryPassword?: string | null;
        error?: string;
        fieldErrors?: Record<string, string>;
      } | null;

      if (!response.ok || !body) {
        setErrors(body?.fieldErrors ?? {});
        setFormError(body?.error ?? "Could not save. Please try again.");
        setPending(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      if (props.mode === "create") {
        setCreated({
          id: body.id!,
          email: parsed.data.email,
          temporaryPassword: body.temporaryPassword ?? null,
        });
        setPending(false);
        window.scrollTo({ top: 0 });
        return;
      }

      router.push(`/admin/employees/${props.employeeId}?saved=1`);
      router.refresh();
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.");
      setPending(false);
    }
  }

  if (created) {
    return (
      <Card className="max-w-2xl space-y-6">
        <div>
          <p className="eyebrow text-plum-700">Saved</p>
          <h2 className="mt-2 font-display text-section-title font-medium text-plum-900">
            Employee <em>added</em>
          </h2>
        </div>
        {created.temporaryPassword ? (
          <TemporaryPasswordNotice password={created.temporaryPassword} email={created.email} />
        ) : (
          <Alert tone="notice">
            No login was created. You can create one later from their profile.
          </Alert>
        )}
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={`/admin/employees/${created.id}`}>View employee</ButtonLink>
          <Button
            variant="secondary"
            onClick={() => {
              setCreated(null);
              setClassification("");
              setJoinDate("");
              setFormKey((key) => key + 1);
            }}
          >
            Add another
          </Button>
        </div>
      </Card>
    );
  }

  const opt = props.options;
  // Inactive departments and branches are not offered, except the one this
  // employee already has (shown as "(inactive)" so it still displays).
  const departmentChoices = opt.departments.filter((d) => d.isActive || d.id === initial?.departmentId);
  const branchChoices = opt.branches.filter((b) => b.isActive || b.id === initial?.branchId);

  return (
    <form key={formKey} onSubmit={handleSubmit} noValidate className="space-y-6">
      {formError && <Alert>{formError}</Alert>}

      <Section title="Personal">
        <Field name="fullName" label="Full name" error={errors.fullName}>
          <Input id="fullName" name="fullName" defaultValue={initial?.fullName} autoComplete="off" invalid={!!errors.fullName} aria-describedby={describedBy("fullName")} />
        </Field>
        <Field name="email" label="Email" error={errors.email} hint="Also used to sign in.">
          <Input id="email" name="email" type="email" inputMode="email" defaultValue={initial?.email} autoComplete="off" invalid={!!errors.email} aria-describedby={describedBy("email", true)} />
        </Field>
        <Field name="phone" label="Phone (optional)" error={errors.phone}>
          <Input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={initial?.phone ?? ""} invalid={!!errors.phone} aria-describedby={describedBy("phone")} />
        </Field>
        <Field name="dateOfBirth" label="Date of birth" error={errors.dateOfBirth}>
          <Input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={initial?.dateOfBirth} invalid={!!errors.dateOfBirth} aria-describedby={describedBy("dateOfBirth")} />
        </Field>
        <Field name="gender" label="Gender" error={errors.gender}>
          <Select id="gender" name="gender" defaultValue={initial?.gender ?? ""} invalid={!!errors.gender} aria-describedby={describedBy("gender")}>
            <option value="" disabled>
              Choose…
            </option>
            {Object.entries(GENDER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </Section>

      <Section title="Employment">
        <Field name="employeeCode" label="Employee code" error={errors.employeeCode}>
          <Input id="employeeCode" name="employeeCode" defaultValue={initial?.employeeCode} autoComplete="off" invalid={!!errors.employeeCode} aria-describedby={describedBy("employeeCode")} />
        </Field>
        <Field name="designation" label="Designation" error={errors.designation}>
          <Input id="designation" name="designation" defaultValue={initial?.designation} invalid={!!errors.designation} aria-describedby={describedBy("designation")} />
        </Field>
        <Field name="joinDate" label="Join date" error={errors.joinDate}>
          <Input id="joinDate" name="joinDate" type="date" defaultValue={initial?.joinDate} onChange={(e) => setJoinDate(e.target.value)} invalid={!!errors.joinDate} aria-describedby={describedBy("joinDate")} />
        </Field>
        <Field name="classification" label="Classification" error={errors.classification}>
          <Select id="classification" name="classification" defaultValue={initial?.classification ?? ""} onChange={(e) => setClassification(e.target.value)} invalid={!!errors.classification} aria-describedby={describedBy("classification")}>
            <option value="" disabled>
              Choose…
            </option>
            {Object.entries(CLASSIFICATION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        {(joinDateChanged || classificationChanged) && (
          <div className="space-y-2 sm:col-span-2">
            {joinDateChanged && <Alert tone="notice">{JOIN_DATE_NOTICE}</Alert>}
            {classificationChanged && <Alert tone="notice">{CLASSIFICATION_NOTICE}</Alert>}
          </div>
        )}
        <Field name="departmentId" label="Department" error={errors.departmentId}>
          <Select id="departmentId" name="departmentId" defaultValue={initial?.departmentId ?? ""} invalid={!!errors.departmentId} aria-describedby={describedBy("departmentId")}>
            <option value="" disabled>
              Choose…
            </option>
            {departmentChoices.map((d) => (
              <option key={d.id} value={d.id}>
                {unitLabel(d.name, d.isActive)}
              </option>
            ))}
          </Select>
        </Field>
        <Field name="branchId" label="Branch" error={errors.branchId}>
          <Select id="branchId" name="branchId" defaultValue={initial?.branchId ?? ""} invalid={!!errors.branchId} aria-describedby={describedBy("branchId")}>
            <option value="" disabled>
              Choose…
            </option>
            {branchChoices.map((b) => (
              <option key={b.id} value={b.id}>
                {unitLabel(b.name, b.isActive)}
              </option>
            ))}
          </Select>
        </Field>
        <Field name="reportingManagerId" label="Reporting manager" error={errors.reportingManagerId}>
          <Select id="reportingManagerId" name="reportingManagerId" defaultValue={initial?.reportingManagerId ?? ""} invalid={!!errors.reportingManagerId} aria-describedby={describedBy("reportingManagerId")}>
            <option value="">No reporting manager</option>
            {opt.managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName} ({m.employeeCode})
              </option>
            ))}
          </Select>
        </Field>
        <Field
          name="status"
          label="Status"
          error={errors.status}
          hint={isInactive ? "Inactive. Use Reactivate on their profile to change this." : undefined}
        >
          {isInactive ? (
            <Select id="status" disabled defaultValue="inactive" aria-describedby="status-hint">
              <option value="inactive">{STATUS_LABELS.inactive}</option>
            </Select>
          ) : (
            <Select id="status" name="status" defaultValue={initial?.status ?? "active"} invalid={!!errors.status} aria-describedby={describedBy("status")}>
              <option value="active">{STATUS_LABELS.active}</option>
              <option value="probation">{STATUS_LABELS.probation}</option>
            </Select>
          )}
        </Field>
      </Section>

      <Section title="Access">
        <Field
          name="role"
          label="Role"
          error={errors.role}
          hint={isSelf ? "You cannot remove your own admin role." : undefined}
        >
          <Select id="role" name="role" defaultValue={initial?.role ?? "employee"} invalid={!!errors.role} aria-describedby={describedBy("role", isSelf)}>
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        {props.mode === "create" && (
          <div className="sm:col-span-2">
            <Checkbox
              name="createLogin"
              defaultChecked
              label="Create login now"
              description="Creates a sign-in with a temporary password that you share with the employee. They must change it on first sign-in."
            />
          </div>
        )}
      </Section>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={pending} loadingText="Saving…">
          {props.mode === "create" ? "Add employee" : "Save changes"}
        </Button>
        <ButtonLink
          variant="secondary"
          href={props.mode === "create" ? "/admin/employees" : `/admin/employees/${props.employeeId}`}
        >
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}

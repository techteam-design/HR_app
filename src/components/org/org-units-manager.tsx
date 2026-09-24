"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

import { EmployeeStatusBadge } from "@/components/employees/employee-status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { BuildingIcon, PlusIcon } from "@/components/ui/icons";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { fieldErrorsOf } from "@/validations/employee";
import { createOrgUnitSchema } from "@/validations/department";

export type OrgUnit = { id: string; name: string; isActive: boolean; activeEmployeeCount: number };

type Kind = "departments" | "branches";

const LABELS: Record<Kind, { title: string; singular: string }> = {
  departments: { title: "Departments", singular: "department" },
  branches: { title: "Branches", singular: "branch" },
};

type Action =
  | { type: "add" }
  | { type: "rename"; unit: OrgUnit }
  | { type: "deactivate"; unit: OrgUnit }
  | { type: "reactivate"; unit: OrgUnit };

type ErrorState = { message: string; details?: string[]; field?: string };

async function send(url: string, method: "POST" | "PATCH", body: object) {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => null)) as {
    error?: string;
    details?: string[];
    fieldErrors?: Record<string, string>;
  } | null;
  return { ok: response.ok, body: json };
}

// Departments and branches side by side on desktop, as tabs on mobile.
export function OrgUnitsManager({ departments, branches }: { departments: OrgUnit[]; branches: OrgUnit[] }) {
  const [tab, setTab] = useState<Kind>("departments");
  const tabsId = useId();

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Departments and branches" className="flex gap-2 rounded-full bg-lilac-50 p-1 md:hidden">
        {(["departments", "branches"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            role="tab"
            id={`${tabsId}-${kind}-tab`}
            aria-selected={tab === kind}
            aria-controls={`${tabsId}-${kind}`}
            onClick={() => setTab(kind)}
            className={cn(
              "min-h-11 flex-1 rounded-full text-sm font-semibold transition-colors duration-150",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-700",
              tab === kind ? "bg-surface text-plum-900" : "text-plum-700 hover:bg-lilac-100",
            )}
          >
            {LABELS[kind].title}
          </button>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {(["departments", "branches"] as const).map((kind) => (
          <div
            key={kind}
            id={`${tabsId}-${kind}`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-${kind}-tab`}
            className={cn(tab !== kind && "hidden", "md:block")}
          >
            <UnitSection kind={kind} units={kind === "departments" ? departments : branches} />
          </div>
        ))}
      </div>
    </div>
  );
}

function UnitSection({ kind, units }: { kind: Kind; units: OrgUnit[] }) {
  const router = useRouter();
  const { title, singular } = LABELS[kind];
  const [action, setAction] = useState<Action | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [pending, setPending] = useState(false);

  function open(next: Action) {
    setError(null);
    setAction(next);
  }

  function close() {
    setAction(null);
    setError(null);
  }

  async function submit(body: object) {
    if (!action) return;
    setPending(true);
    setError(null);
    try {
      const result =
        action.type === "add"
          ? await send(`/api/${kind}`, "POST", body)
          : await send(`/api/${kind}/${action.unit.id}`, "PATCH", body);
      if (!result.ok) {
        const fieldError = result.body?.fieldErrors?.name;
        setError({
          message: fieldError ?? result.body?.error ?? "Something went wrong. Please try again.",
          details: result.body?.details,
          field: fieldError ? "name" : undefined,
        });
        return;
      }
      setAction(null);
      router.refresh();
    } catch {
      setError({ message: "Could not reach the server. Check your connection and try again." });
    } finally {
      setPending(false);
    }
  }

  const dialogTitle =
    action?.type === "add"
      ? `Add ${singular}`
      : action?.type === "rename"
        ? `Rename ${singular}`
        : action?.type === "deactivate"
          ? `Deactivate ${singular}`
          : `Reactivate ${singular}`;

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-section-title font-medium text-plum-900">{title}</h2>
        <Button variant="secondary" className="h-11 px-4 text-sm" onClick={() => open({ type: "add" })}>
          <PlusIcon width={18} height={18} />
          Add
        </Button>
      </div>

      {units.length === 0 ? (
        <div className="rounded-input bg-lilac-50 px-4 py-8 text-center">
          <BuildingIcon width={24} height={24} className="mx-auto text-plum-500" />
          <p className="mt-2 text-[15px] text-muted">No {kind} yet.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {units.map((unit) => (
            <li key={unit.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className={cn("font-semibold break-words", unit.isActive ? "text-plum-900" : "text-muted")}>
                  {unit.name}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                  <EmployeeStatusBadge status={unit.isActive ? "active" : "inactive"} />
                  {unit.activeEmployeeCount} active employee{unit.activeEmployeeCount === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <RowButton onClick={() => open({ type: "rename", unit })}>Rename</RowButton>
                {unit.isActive ? (
                  <RowButton onClick={() => open({ type: "deactivate", unit })}>Deactivate</RowButton>
                ) : (
                  <RowButton onClick={() => open({ type: "reactivate", unit })}>Reactivate</RowButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={action !== null} onClose={close} title={dialogTitle}>
        {action?.type === "add" || action?.type === "rename" ? (
          <NameForm
            key={action.type === "rename" ? action.unit.id : "add"}
            singular={singular}
            initialName={action.type === "rename" ? action.unit.name : ""}
            submitLabel={action.type === "add" ? `Add ${singular}` : "Save name"}
            serverError={error}
            pending={pending}
            onCancel={close}
            onSubmit={(name) => submit({ name })}
          />
        ) : (
          action && (
            <div className="space-y-5">
              <p className="text-[15px] text-muted">
                {action.type === "deactivate"
                  ? `${action.unit.name} will no longer be offered when adding or editing employees. Employees who already have it keep it, and you can reactivate it at any time.`
                  : `${action.unit.name} will be offered again when adding or editing employees.`}
              </p>
              <ErrorBox error={error} />
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button variant="secondary" onClick={close} disabled={pending}>
                  Cancel
                </Button>
                <Button
                  onClick={() => submit({ isActive: action.type === "reactivate" })}
                  loading={pending}
                  loadingText="Saving…"
                >
                  {action.type === "deactivate" ? "Deactivate" : "Reactivate"}
                </Button>
              </div>
            </div>
          )
        )}
      </Dialog>
    </Card>
  );
}

function RowButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-plum-700 transition-colors duration-150 hover:bg-lilac-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-700"
    >
      {children}
    </button>
  );
}

function ErrorBox({ error }: { error: ErrorState | null }) {
  if (!error || error.field) return null;
  return (
    <div role="alert" className="space-y-2 rounded-input bg-status-rejected-bg px-4 py-3 text-sm text-status-rejected-text">
      <p className="font-semibold">{error.message}</p>
      {error.details && (
        <ul className="list-disc space-y-1 pl-5">
          {error.details.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NameForm({
  singular,
  initialName,
  submitLabel,
  serverError,
  pending,
  onCancel,
  onSubmit,
}: {
  singular: string;
  initialName: string;
  submitLabel: string;
  serverError: ErrorState | null;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const [clientError, setClientError] = useState<string | null>(null);
  const fieldError = clientError ?? (serverError?.field === "name" ? serverError.message : null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createOrgUnitSchema.safeParse({ name: new FormData(event.currentTarget).get("name") });
    if (!parsed.success) {
      setClientError(fieldErrorsOf(parsed.error).name ?? "Enter a name");
      return;
    }
    setClientError(null);
    onSubmit(parsed.data.name);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="org-unit-name">Name</Label>
        <Input
          id="org-unit-name"
          name="name"
          defaultValue={initialName}
          autoComplete="off"
          autoFocus
          maxLength={80}
          invalid={!!fieldError}
          aria-describedby={fieldError ? "org-unit-name-error" : "org-unit-name-hint"}
        />
        {fieldError ? (
          <FieldError id="org-unit-name-error">{fieldError}</FieldError>
        ) : (
          <FieldHint id="org-unit-name-hint">
            2–60 characters. Each {singular} name must be unique (capital letters don&apos;t count).
          </FieldHint>
        )}
      </div>
      <ErrorBox error={serverError} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending} loadingText="Saving…">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

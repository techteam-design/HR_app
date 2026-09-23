"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

import { TemporaryPasswordNotice } from "./temporary-password-notice";

type Kind = "deactivate" | "reactivate" | "reset" | "create-login";

const DIALOGS: Record<Kind, { title: string; confirm: string; path: string }> = {
  deactivate: { title: "Deactivate employee", confirm: "Deactivate", path: "deactivate" },
  reactivate: { title: "Reactivate employee", confirm: "Reactivate", path: "reactivate" },
  reset: { title: "Reset password", confirm: "Reset password", path: "reset-password" },
  "create-login": { title: "Create login", confirm: "Create login", path: "login" },
};

// Admin-only actions on the employee profile. The server enforces every rule;
// this component only collects the confirmation and shows the result.
export function EmployeeActions({
  employee,
  isSelf,
}: {
  employee: { id: string; fullName: string; email: string; status: string; hasLogin: boolean };
  isSelf: boolean;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; details?: string[] } | null>(null);
  const [password, setPassword] = useState<string | null>(null);

  const isInactive = employee.status === "inactive";

  function open(next: Kind) {
    setError(null);
    setPassword(null);
    setKind(next);
  }

  function close() {
    const changed = password !== null;
    setKind(null);
    setPassword(null);
    setError(null);
    if (changed) router.refresh();
  }

  async function confirm() {
    if (!kind) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/employees/${employee.id}/${DIALOGS[kind].path}`, { method: "POST" });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        details?: string[];
        temporaryPassword?: string;
      } | null;
      if (!response.ok) {
        setError({ message: body?.error ?? "Something went wrong. Please try again.", details: body?.details });
        return;
      }
      if (body?.temporaryPassword) {
        setPassword(body.temporaryPassword);
        return;
      }
      setKind(null);
      router.refresh();
    } catch {
      setError({ message: "Could not reach the server. Check your connection and try again." });
    } finally {
      setPending(false);
    }
  }

  const descriptions: Record<Kind, string> = {
    deactivate: `${employee.fullName} will be signed out on every device immediately and cannot sign in until reactivated. Their records are kept.`,
    reactivate: `${employee.fullName} will be active again and can sign in with their existing password.`,
    reset: `This creates a new temporary password for ${employee.fullName}, signs them out everywhere and asks them to choose a new password at their next sign-in.`,
    "create-login": `This creates a sign-in for ${employee.email} with a temporary password. They must change it at their first sign-in.`,
  };

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <ButtonLink href={`/admin/employees/${employee.id}/edit`}>Edit</ButtonLink>
        {!isSelf &&
          (employee.hasLogin ? (
            <Button variant="secondary" onClick={() => open("reset")}>
              Reset password
            </Button>
          ) : (
            !isInactive && (
              <Button variant="secondary" onClick={() => open("create-login")}>
                Create login
              </Button>
            )
          ))}
        {isInactive ? (
          <Button variant="secondary" onClick={() => open("reactivate")}>
            Reactivate
          </Button>
        ) : (
          !isSelf && (
            <Button variant="ghost" onClick={() => open("deactivate")}>
              Deactivate
            </Button>
          )
        )}
      </div>

      <Dialog open={kind !== null} onClose={close} title={kind ? DIALOGS[kind].title : ""}>
        {kind && password ? (
          <div className="space-y-5">
            <TemporaryPasswordNotice password={password} email={employee.email} />
            <Button fullWidth onClick={close}>
              Done
            </Button>
          </div>
        ) : (
          kind && (
            <div className="space-y-5">
              <p className="text-[15px] text-muted">{descriptions[kind]}</p>
              {error && (
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
              )}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button variant="secondary" onClick={close} disabled={pending}>
                  Cancel
                </Button>
                <Button onClick={confirm} loading={pending} loadingText="Working…">
                  {DIALOGS[kind].confirm}
                </Button>
              </div>
            </div>
          )
        )}
      </Dialog>
      {isSelf && (
        <Alert tone="notice" className="mt-4">
          This is your own record. Use Change password for your own password; another admin must deactivate or
          reset you.
        </Alert>
      )}
    </>
  );
}

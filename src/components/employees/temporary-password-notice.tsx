"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

// Shows a temporary password once, with a copy button. The password only
// lives in this component's props (browser memory); it is not stored.
export function TemporaryPasswordNotice({ password, email }: { password: string; email: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-4 rounded-card bg-lilac-50 p-5">
      <div>
        <p className="eyebrow text-plum-700">Temporary password</p>
        <p className="mt-1 text-[13px] text-muted">For {email}</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <code
          aria-label="Temporary password"
          className="block flex-1 rounded-input border border-input-border bg-surface px-4 py-3 font-mono text-lg tracking-wider break-all text-plum-900 select-all"
        >
          {password}
        </code>
        <Button variant="secondary" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p role="status" className="sr-only">
        {copied ? "Password copied to clipboard" : ""}
      </p>
      <p className="text-sm font-semibold text-plum-900">
        Share this securely. It will not be shown again.
      </p>
      <p className="text-[13px] text-muted">
        They will be asked to choose a new password the first time they sign in.
      </p>
    </div>
  );
}

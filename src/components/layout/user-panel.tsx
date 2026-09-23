import Link from "next/link";

import { SignOutButton } from "./sign-out-button";

export function UserPanel({
  name,
  roleLabel,
  onNavigate,
}: {
  name: string;
  roleLabel: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="px-3">
        <p className="truncate text-sm font-medium text-slate-900">{name}</p>
        <p className="text-xs text-slate-500">{roleLabel}</p>
      </div>
      <Link
        href="/change-password"
        onClick={onNavigate}
        className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
      >
        Change password
      </Link>
      <SignOutButton />
    </div>
  );
}

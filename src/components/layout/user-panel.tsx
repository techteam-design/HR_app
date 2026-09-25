import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { KeyIcon } from "@/components/ui/icons";

import { SignOutButton } from "./sign-out-button";

// User card: avatar, name, subtitle (designation or role), then change password and sign out.
export function UserPanel({
  name,
  subtitle,
  photoUrl,
  onNavigate,
}: {
  name: string;
  subtitle: string;
  photoUrl?: string | null;
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-1">
      <div className="mb-2 flex items-center gap-3 rounded-card bg-lilac-50 p-3">
        <Avatar name={name} src={photoUrl} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-plum-900">{name}</p>
          <p className="truncate text-[13px] text-muted">{subtitle}</p>
        </div>
      </div>
      <Link
        href="/change-password"
        onClick={onNavigate}
        className="flex min-h-11 items-center gap-3 rounded-full px-4 text-sm font-medium text-muted transition-colors duration-150 hover:bg-lilac-50 hover:text-plum-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-700"
      >
        <KeyIcon width={20} height={20} />
        Change password
      </Link>
      <SignOutButton />
    </div>
  );
}

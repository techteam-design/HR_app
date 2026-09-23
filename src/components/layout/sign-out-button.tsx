"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { LogOutIcon } from "@/components/ui/icons";
import { signOut } from "@/lib/auth/auth-client";
import { cn } from "@/lib/utils/cn";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    await signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 rounded-full px-4 text-sm font-medium text-muted transition-colors duration-150",
        "hover:bg-lilac-50 hover:text-plum-900 disabled:opacity-55",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-700",
        className,
      )}
    >
      <LogOutIcon width={20} height={20} />
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}

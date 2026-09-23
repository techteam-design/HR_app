"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { MoreIcon, PlusIcon } from "@/components/ui/icons";
import { Logo } from "@/components/ui/logo";
import { Sheet } from "@/components/ui/sheet";
import type { NavItem } from "@/lib/auth/rbac";
import { cn } from "@/lib/utils/cn";

import { iconFor, isActivePath } from "./nav-icons";
import { NavLinks } from "./nav-links";
import { UserPanel } from "./user-panel";

const APPLY_HREF = "/leave/apply";
const MAX_ICONS = 4;

// Which routes earn a place in the bottom bar first. Visibility itself still
// comes from rbac.ts: this only orders the items a role already has.
const MOBILE_PRIORITY = [
  "/dashboard",
  "/approvals",
  "/leave/history",
  "/reports",
  "/team-calendar",
  "/profile",
];

function priorityOf(href: string): number {
  const index = MOBILE_PRIORITY.indexOf(href);
  return index === -1 ? MOBILE_PRIORITY.length : index;
}

// Mobile top bar (mono logo + avatar) and floating bottom navigation with a
// centre "Apply for leave" button. Roles with more than 4 other items get a
// "More" button that opens a sheet with the rest.
export function MobileNav({
  items,
  name,
  subtitle,
}: {
  items: NavItem[];
  name: string;
  subtitle: string;
}) {
  const pathname = usePathname();
  const [sheet, setSheet] = useState<"more" | "account" | null>(null);
  const close = useCallback(() => setSheet(null), []);

  const canApply = items.some((item) => item.href === APPLY_HREF);
  const others = items
    .filter((item) => item.href !== APPLY_HREF)
    .sort((a, b) => priorityOf(a.href) - priorityOf(b.href));
  const needsMore = others.length > MAX_ICONS;
  const visible = needsMore ? others.slice(0, MAX_ICONS - 1) : others;
  const overflow = needsMore ? others.slice(MAX_ICONS - 1) : [];
  const overflowActive = overflow.some((item) => isActivePath(pathname, item.href));

  const slots: React.ReactNode[] = visible.map((item) => {
    const Icon = iconFor(item.href);
    const active = isActivePath(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex size-12 items-center justify-center rounded-full transition-colors duration-150",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-700",
          active ? "bg-lilac-50 text-plum-900" : "text-muted hover:text-plum-900",
        )}
      >
        <Icon />
      </Link>
    );
  });

  if (needsMore) {
    slots.push(
      <button
        key="more"
        type="button"
        onClick={() => setSheet("more")}
        aria-label="More"
        aria-haspopup="dialog"
        className={cn(
          "flex size-12 items-center justify-center rounded-full transition-colors duration-150",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-700",
          overflowActive ? "bg-lilac-50 text-plum-900" : "text-muted hover:text-plum-900",
        )}
      >
        <MoreIcon />
      </button>,
    );
  }

  const half = Math.ceil(slots.length / 2);
  const applyActive = isActivePath(pathname, APPLY_HREF);

  return (
    <>
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur md:hidden">
        <Link href="/dashboard" aria-label="Dashboard" className="rounded-lg focus-visible:outline-2 focus-visible:outline-plum-700">
          <Logo variant="mono" width={64} priority />
        </Link>
        <button
          type="button"
          onClick={() => setSheet("account")}
          aria-label="Account"
          aria-haspopup="dialog"
          className="flex size-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-700"
        >
          <Avatar name={name} size="sm" />
        </button>
      </header>

      {/* Floating bottom navigation */}
      <nav
        aria-label="Quick navigation"
        className="fixed inset-x-4 z-40 md:hidden"
        style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex h-16 max-w-md items-center justify-around rounded-full border border-border bg-surface px-2 shadow-float">
          {slots.slice(0, half)}
          {canApply && (
            <Link
              href={APPLY_HREF}
              aria-label="Apply for leave"
              aria-current={applyActive ? "page" : undefined}
              className="-mt-8 flex size-16 items-center justify-center rounded-full bg-plum-900 text-surface shadow-lg ring-4 ring-bg transition-colors duration-150 hover:bg-plum-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-700"
            >
              <PlusIcon width={26} height={26} />
            </Link>
          )}
          {slots.slice(half)}
        </div>
      </nav>

      <Sheet open={sheet === "more"} onClose={close} title="More">
        <NavLinks items={overflow} onNavigate={close} />
      </Sheet>

      <Sheet open={sheet === "account"} onClose={close} title="Account">
        <UserPanel name={name} subtitle={subtitle} onNavigate={close} />
      </Sheet>
    </>
  );
}

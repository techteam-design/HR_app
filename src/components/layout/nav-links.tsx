"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavItem, NavSection } from "@/lib/auth/rbac";
import { cn } from "@/lib/utils/cn";

import { iconFor, isActivePath } from "./nav-icons";

const SECTION_ORDER: NavSection[] = ["My work", "Team", "Admin", "Reports"];

// Sidebar and "More" sheet navigation: pill links grouped under eyebrow headings.
export function NavLinks({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="space-y-6">
      {SECTION_ORDER.map((section) => {
        const sectionItems = items.filter((item) => item.section === section);
        if (sectionItems.length === 0) return null;
        return (
          <div key={section}>
            <p className="eyebrow px-4 text-plum-700">{section}</p>
            <ul className="mt-2 space-y-1">
              {sectionItems.map((item) => {
                const active = isActivePath(pathname, item.href);
                const Icon = iconFor(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-11 items-center gap-3 rounded-full px-4 text-sm transition-colors duration-150",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-700",
                        active
                          ? "bg-lilac-50 font-semibold text-plum-900"
                          : "font-medium text-muted hover:bg-lilac-50 hover:text-plum-900",
                      )}
                    >
                      <Icon width={20} height={20} className={active ? "text-plum-700" : undefined} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

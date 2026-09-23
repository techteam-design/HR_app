"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavItem, NavSection } from "@/lib/auth/rbac";

const SECTION_ORDER: NavSection[] = ["My work", "Team", "Admin", "Reports"];

function isActive(pathname: string, href: string): boolean {
  // "/reports" should not stay highlighted on "/reports/calendar".
  return pathname === href || (href !== "/reports" && pathname.startsWith(`${href}/`));
}

export function NavLinks({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="space-y-5">
      {SECTION_ORDER.map((section) => {
        const sectionItems = items.filter((item) => item.section === section);
        if (sectionItems.length === 0) return null;
        return (
          <div key={section}>
            <p className="px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {section}
            </p>
            <ul className="mt-1 space-y-0.5">
              {sectionItems.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`block rounded-lg px-3 py-2 text-sm ${
                        active
                          ? "bg-slate-900 font-medium text-white"
                          : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
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

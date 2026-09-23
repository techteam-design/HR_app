"use client";

import { useState } from "react";

import type { NavItem } from "@/lib/auth/rbac";

import { NavLinks } from "./nav-links";
import { UserPanel } from "./user-panel";

export function MobileMenu({
  items,
  name,
  roleLabel,
}: {
  items: NavItem[];
  name: string;
  roleLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
      >
        {open ? "Close" : "Menu"}
      </button>

      {open && (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-full z-20 max-h-[calc(100vh-3.5rem)] space-y-5 overflow-y-auto border-b border-slate-200 bg-white p-4 shadow-lg"
        >
          <NavLinks items={items} onNavigate={close} />
          <div className="border-t border-slate-200 pt-4">
            <UserPanel name={name} roleLabel={roleLabel} onNavigate={close} />
          </div>
        </div>
      )}
    </>
  );
}

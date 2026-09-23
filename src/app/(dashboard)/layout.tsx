import { MobileMenu } from "@/components/layout/mobile-menu";
import { NavLinks } from "@/components/layout/nav-links";
import { UserPanel } from "@/components/layout/user-panel";
import { navigationFor, ROLE_LABELS } from "@/lib/auth/rbac";
import { requireEmployee } from "@/server/auth.service";

// Every page below also calls requireEmployee with its own action, because
// layouts are not re-run on every client-side navigation.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const employee = await requireEmployee();
  const navItems = navigationFor(employee.role);
  const roleLabel = ROLE_LABELS[employee.role];

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-slate-200 bg-white p-4 md:sticky md:top-0 md:flex md:h-screen md:overflow-y-auto">
        <div>
          <p className="px-3 pb-5 text-lg font-semibold text-slate-900">HR &amp; Leave</p>
          <NavLinks items={navItems} />
        </div>
        <div className="border-t border-slate-200 pt-4">
          <UserPanel name={employee.fullName} roleLabel={roleLabel} />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 md:hidden">
        <p className="font-semibold text-slate-900">HR &amp; Leave</p>
        <MobileMenu items={navItems} name={employee.fullName} roleLabel={roleLabel} />
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}

import { MobileNav } from "@/components/layout/mobile-nav";
import { NavLinks } from "@/components/layout/nav-links";
import { UserPanel } from "@/components/layout/user-panel";
import { Logo } from "@/components/ui/logo";
import { navigationFor, ROLE_LABELS } from "@/lib/auth/rbac";
import { requireEmployee } from "@/server/auth.service";
import { photoUrlFor } from "@/server/employee-photo.service";

// Every page below also calls requireEmployee with its own action, because
// layouts are not re-run on every client-side navigation.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const employee = await requireEmployee();
  const navItems = navigationFor(employee.role);
  // Designation under the name, falling back to the role label.
  const subtitle = employee.designation.trim() || ROLE_LABELS[employee.role];
  // Signed from the key already on the session lookup: no extra query. Null
  // (initials) when there is no photo, no storage, or signing fails.
  const photoUrl = await photoUrlFor(employee.photoKey);

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-61 shrink-0 flex-col border-r border-border bg-surface px-4 py-6 md:sticky md:top-0 md:flex md:h-screen md:overflow-y-auto">
        <div className="px-4 pb-8">
          <Logo variant="mono" width={84} priority />
        </div>
        <div className="flex-1">
          <NavLinks items={navItems} />
        </div>
        <div className="mt-8">
          <UserPanel name={employee.fullName} subtitle={subtitle} photoUrl={photoUrl} />
        </div>
      </aside>

      {/* Mobile top bar + floating bottom navigation */}
      <MobileNav items={navItems} name={employee.fullName} subtitle={subtitle} photoUrl={photoUrl} />

      {/* Bottom padding on mobile keeps content clear of the floating nav. */}
      <main className="min-w-0 flex-1 px-4 pt-6 pb-32 md:px-10 md:pt-10 md:pb-12 lg:px-14">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}

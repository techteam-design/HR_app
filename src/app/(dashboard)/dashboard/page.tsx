import { PagePlaceholder } from "@/components/layout/page-placeholder";
import { ROLE_LABELS } from "@/lib/auth/rbac";
import { requireEmployee } from "@/server/auth.service";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const employee = await requireEmployee();
  const { denied } = await searchParams;

  return (
    <div className="space-y-6">
      {denied && (
        <p role="alert" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You don&apos;t have access to that page.
        </p>
      )}

      <div>
        <p className="text-sm text-slate-500">Welcome back</p>
        <p className="text-lg font-medium text-slate-900">
          {employee.fullName} · {ROLE_LABELS[employee.role]}
        </p>
      </div>

      <PagePlaceholder
        title="Dashboard"
        sprint="Sprint 2"
        description="Your leave balances, pending requests and upcoming leave will appear here."
      />
    </div>
  );
}

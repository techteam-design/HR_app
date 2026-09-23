import { PlaceholderPanel } from "@/components/layout/page-placeholder";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { PlusIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/rbac";
import { greetingFor } from "@/lib/utils/dates";
import { requireEmployee } from "@/server/auth.service";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const employee = await requireEmployee();
  const { denied } = await searchParams;
  const firstName = employee.fullName.trim().split(/\s+/)[0] ?? employee.fullName;

  return (
    <div className="space-y-8">
      {denied && <Alert tone="notice">You don&apos;t have access to that page.</Alert>}

      <PageHeader
        title={
          <>
            {greetingFor()}, <em>{firstName}</em>
          </>
        }
        action={
          can(employee.role, "apply_leave") ? (
            <ButtonLink href="/leave/apply" className="hidden md:inline-flex">
              <PlusIcon width={18} height={18} />
              Apply for leave
            </ButtonLink>
          ) : undefined
        }
      />

      <PlaceholderPanel
        title="Your leave at a glance"
        sprint="Sprint 2"
        description="Your leave balances, pending requests and upcoming leave will appear here."
      />
    </div>
  );
}

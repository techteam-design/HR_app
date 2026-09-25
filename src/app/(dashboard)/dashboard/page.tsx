import { UpcomingLeaveList } from "@/components/leave/application-list";
import { BalanceArchCards, LeaveYearCard } from "@/components/leave/balance-cards";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlusIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/rbac";
import { formatDisplayDate, greetingFor, todayIsoInBrunei } from "@/lib/utils/dates";
import { requireEmployee } from "@/server/auth.service";
import { listUpcoming } from "@/server/leave-application.service";
import { getEmployeeBalances } from "@/server/leave-balance.service";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const employee = await requireEmployee();
  const { denied } = await searchParams;
  const firstName = employee.fullName.trim().split(/\s+/)[0] ?? employee.fullName;
  // Creates any missing entitlement rows for the current periods first.
  const today = todayIsoInBrunei();
  const [balances, upcoming] = await Promise.all([
    getEmployeeBalances(employee.id, today),
    listUpcoming(employee.id, today),
  ]);

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

      {balances && !balances.started ? (
        <Alert tone="notice">
          Your leave balances start on your join date, {formatDisplayDate(balances.joinDate)}.
        </Alert>
      ) : (
        balances && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <section aria-labelledby="balances-title" className="space-y-4">
              <h2 id="balances-title" className="font-display text-section-title font-medium text-plum-900">
                Your <em>balances</em>
              </h2>
              <BalanceArchCards balances={balances} />
            </section>
            <div className="space-y-6 lg:pt-12">
              <LeaveYearCard balances={balances} />
              <Card>
                <p className="eyebrow text-plum-700">Upcoming leave</p>
                <UpcomingLeaveList items={upcoming} />
              </Card>
            </div>
          </div>
        )
      )}
    </div>
  );
}

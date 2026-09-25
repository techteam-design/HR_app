import Link from "next/link";

import { ApplicationList } from "@/components/leave/application-list";
import { LEAVE_LABELS } from "@/components/leave/labels";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { LEAVE_TYPE_CODES } from "@/lib/leave-engine/constants";
import { todayIsoInBrunei } from "@/lib/utils/dates";
import { requireEmployee } from "@/server/auth.service";
import { applicationYears, listApplications } from "@/server/leave-application.service";
import { APPLICATION_STATUSES, historyFilterSchema } from "@/validations/leave";

const STATUS_LABELS = { pending: "Pending", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled" } as const;

// The signed-in employee's own requests, newest first. Filters are plain GET
// parameters, so they work without JavaScript and can be bookmarked.
export default async function LeaveHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string; year?: string }>;
}) {
  const employee = await requireEmployee({ action: "apply_leave" });
  const filter = historyFilterSchema.parse(await searchParams);
  const today = todayIsoInBrunei();
  const [items, years] = await Promise.all([listApplications(employee.id, filter), applicationYears(employee.id)]);
  const yearOptions = [...new Set([Number(today.slice(0, 4)), ...years])].sort((a, b) => b - a);
  const filtered = !!(filter.type || filter.status || filter.year);

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <>
            My leave <em>history</em>
          </>
        }
        action={
          <ButtonLink href="/leave/apply" className="hidden md:inline-flex">
            Apply for leave
          </ButtonLink>
        }
      />

      <Card>
        <form method="get" className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="filter-type">Leave type</Label>
            <Select id="filter-type" name="type" defaultValue={filter.type ?? ""}>
              <option value="">All types</option>
              {LEAVE_TYPE_CODES.map((code) => (
                <option key={code} value={code}>
                  {LEAVE_LABELS[code]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="filter-status">Status</Label>
            <Select id="filter-status" name="status" defaultValue={filter.status ?? ""}>
              <option value="">All statuses</option>
              {APPLICATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="filter-year">Year</Label>
            <Select id="filter-year" name="year" defaultValue={filter.year ? String(filter.year) : ""}>
              <option value="">All years</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="secondary">
              Filter
            </Button>
            {filtered && (
              <Link href="/leave/history" className="min-h-11 content-center text-sm font-semibold text-plum-700 hover:underline">
                Clear
              </Link>
            )}
          </div>
        </form>
      </Card>

      <ApplicationList
        items={items}
        today={today}
        mode="own"
        emptyText={filtered ? "No requests match these filters." : "You haven't requested any leave yet."}
      />
    </div>
  );
}

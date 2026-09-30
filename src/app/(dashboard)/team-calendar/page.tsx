import Link from "next/link";

import { TeamCalendarView } from "@/components/calendar/team-calendar-view";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { monthLabel, parseMonth, shiftMonth } from "@/lib/calendar/month-grid";
import { cn } from "@/lib/utils/cn";
import { todayIsoInBrunei } from "@/lib/utils/dates";
import { requireEmployee } from "@/server/auth.service";
import { getTeamCalendar } from "@/server/team-calendar.service";
import { calendarFilterSchema } from "@/validations/approval";

const navLink =
  "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-plum-700 hover:bg-lilac-50 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-700";

// Team calendar: managers see their team (direct reports and everyone they
// approve); admins and HR viewers see everyone, with filters.
export default async function TeamCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; departmentId?: string; branchId?: string }>;
}) {
  const viewer = await requireEmployee({ action: "view_team_calendar" });
  const filter = calendarFilterSchema.parse(await searchParams);
  const today = todayIsoInBrunei();
  const month = parseMonth(filter.month, today);
  const calendar = await getTeamCalendar(viewer, month, filter);

  const linkFor = (target: string) => {
    const params = new URLSearchParams({ month: target });
    if (filter.departmentId) params.set("departmentId", filter.departmentId);
    if (filter.branchId) params.set("branchId", filter.branchId);
    return `/team-calendar?${params}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <>
            Team <em>calendar</em>
          </>
        }
      />
      <p className="text-[15px] text-muted">
        {calendar.scope === "everyone"
          ? "Approved and pending leave for everyone."
          : "Approved and pending leave for your direct reports and everyone you approve."}{" "}
        Approved leave is solid; pending leave is outlined.
      </p>

      {calendar.scope === "everyone" && (
        <Card>
          <form method="get" className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <input type="hidden" name="month" value={month} />
            <div className="space-y-2">
              <Label htmlFor="calendar-department">Department</Label>
              <Select id="calendar-department" name="departmentId" defaultValue={filter.departmentId ?? ""}>
                <option value="">All departments</option>
                {calendar.departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="calendar-branch">Branch</Label>
              <Select id="calendar-branch" name="branchId" defaultValue={filter.branchId ?? ""}>
                <option value="">All branches</option>
                {calendar.branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" variant="secondary">
              Filter
            </Button>
          </form>
        </Card>
      )}

      <div className="flex items-center justify-between gap-2">
        <Link href={linkFor(shiftMonth(month, -1))} className={navLink} aria-label="Previous month">
          ← {monthLabel(shiftMonth(month, -1)).split(" ")[0]}
        </Link>
        <h2 className="font-display text-section-title font-medium text-plum-900">{monthLabel(month)}</h2>
        <Link href={linkFor(shiftMonth(month, 1))} className={navLink} aria-label="Next month">
          {monthLabel(shiftMonth(month, 1)).split(" ")[0]} →
        </Link>
      </div>
      {month !== today.slice(0, 7) && (
        <Link href={linkFor(today.slice(0, 7))} className={cn(navLink, "-mt-4")}>
          Back to this month
        </Link>
      )}

      <TeamCalendarView
        month={month}
        today={today}
        entries={calendar.entries}
        applications={calendar.applications}
      />
    </div>
  );
}

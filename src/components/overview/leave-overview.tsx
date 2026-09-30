import Link from "next/link";

import { daysLabel, LEAVE_LABELS } from "@/components/leave/labels";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDays } from "@/lib/leave-engine/balance";
import { activityText, groupBy } from "@/lib/overview/activity";
import { formatDateRange, formatDisplayDate, formatWeekdayDate, todayIsoInBrunei } from "@/lib/utils/dates";
import type { LeaveOverview, OverviewPerson } from "@/server/leave-overview.service";

// Company leave overview (admin; HR viewer read-only). Display only.

function portionText(person: OverviewPerson): string {
  if (person.portion === 1) return "Full day";
  return person.halfDaySlot === "afternoon" ? "Half day (afternoon)" : "Half day (morning)";
}

function PersonRow({ person, showPending }: { person: OverviewPerson; showPending?: boolean }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <Avatar name={person.fullName} src={person.photoUrl} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold break-words text-plum-900">{person.fullName}</span>
        <span className="block text-[13px] text-muted">
          {LEAVE_LABELS[person.code]} · {portionText(person)}
          {showPending && person.status === "pending" && " · Pending"}
        </span>
      </span>
    </li>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-section-title font-medium text-plum-900">{children}</h2>;
}

export function LeaveOverviewPanel({ overview, canDecide }: { overview: LeaveOverview; canDecide: boolean }) {
  const todayByBranch = groupBy(overview.onLeaveToday, (p) => p.branchName);
  const upcomingCount = new Set(overview.upcoming.flatMap((day) => day.people.map((p) => p.employeeId))).size;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-lilac-50">
          <p className="eyebrow text-plum-700">On leave today</p>
          <p className="mt-2 font-display text-5xl leading-none font-medium text-plum-900">
            {new Set(overview.onLeaveToday.map((p) => p.employeeId)).size}
          </p>
        </Card>
        <Card className="bg-blush-50">
          <p className="eyebrow text-blush-700">Pending approvals</p>
          <p className="mt-2 font-display text-5xl leading-none font-medium text-plum-900">{overview.pending.count}</p>
        </Card>
        <Card className="bg-sage-50">
          <p className="eyebrow text-sage-700">Off in the next 7 days</p>
          <p className="mt-2 font-display text-5xl leading-none font-medium text-plum-900">{upcomingCount}</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>
            On leave <em>today</em>
          </SectionTitle>
          {overview.onLeaveToday.length === 0 ? (
            <p className="mt-3 text-[15px] text-muted">Everyone is in today.</p>
          ) : (
            <div className="mt-3 space-y-4">
              {[...todayByBranch].map(([branch, people]) => (
                <div key={branch}>
                  <p className="eyebrow text-plum-700">{branch}</p>
                  <ul className="divide-y divide-border">
                    {people.map((person) => (
                      <PersonRow key={person.applicationId} person={person} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle>
            Next <em>7 days</em>
          </SectionTitle>
          {upcomingCount === 0 ? (
            <p className="mt-3 text-[15px] text-muted">No leave in the next 7 days.</p>
          ) : (
            <div className="mt-3 space-y-4">
              {overview.upcoming
                .filter((day) => day.people.length > 0)
                .map((day) => (
                  <div key={day.date}>
                    <p className="eyebrow text-plum-700">{formatWeekdayDate(day.date)}</p>
                    <ul className="divide-y divide-border">
                      {day.people.map((person) => (
                        <PersonRow key={`${person.applicationId}-${day.date}`} person={person} showPending />
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle>
              Pending <em>approvals</em>
            </SectionTitle>
            {canDecide && overview.pending.count > 0 && (
              <Link href="/approvals?view=all" className="min-h-11 content-center text-sm font-semibold text-plum-700 hover:underline">
                See all ({overview.pending.count})
              </Link>
            )}
          </div>
          {overview.pending.oldest.length === 0 ? (
            <p className="mt-3 text-[15px] text-muted">Nothing is waiting for approval.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {overview.pending.oldest.map((item) => (
                <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="font-semibold break-words text-plum-900">{item.employeeName}</p>
                  <p className="text-[13px] text-muted">
                    {LEAVE_LABELS[item.code]} · {formatDateRange(item.startDate, item.endDate)} ·{" "}
                    {daysLabel(formatDays(item.totalDays), item.totalDays)} · {item.levelLabel}
                  </p>
                  <p className="text-[13px] text-muted">
                    Submitted {formatDisplayDate(todayIsoInBrunei(item.submittedAt))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionTitle>
            By <em>branch</em>
          </SectionTitle>
          <table className="mt-3 w-full text-left text-[15px]">
            <thead>
              <tr className="text-[12px] text-muted">
                <th scope="col" className="py-2 font-semibold">Branch</th>
                <th scope="col" className="py-2 text-right font-semibold">Staff</th>
                <th scope="col" className="py-2 text-right font-semibold">Off today</th>
                <th scope="col" className="py-2 text-right font-semibold">Pending</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {overview.byBranch.map((branch) => (
                <tr key={branch.id}>
                  <th scope="row" className="py-2 font-semibold text-plum-900">{branch.name}</th>
                  <td className="py-2 text-right text-plum-900">{branch.staff}</td>
                  <td className="py-2 text-right text-plum-900">{branch.onLeaveToday}</td>
                  <td className="py-2 text-right text-plum-900">{branch.pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[12px] text-muted">Staff excludes admins.</p>
        </Card>
      </div>

      <Card>
        <SectionTitle>
          Recent <em>activity</em>
        </SectionTitle>
        {overview.activity.length === 0 ? (
          <p className="mt-3 text-[15px] text-muted">No leave activity yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {overview.activity.map((event) => (
              <li
                key={`${event.kind}-${event.applicationId}-${event.at.toISOString()}`}
                className="flex flex-wrap justify-between gap-x-4 py-2"
              >
                <span className="text-[15px] break-words text-plum-900">{activityText(event)}</span>
                <span className="text-[13px] text-muted">{formatDisplayDate(todayIsoInBrunei(event.at))}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/team-calendar" variant="secondary">
          Team calendar
        </ButtonLink>
        <ButtonLink href="/admin/approval-config" variant="secondary">
          Approval setup
        </ButtonLink>
        <ButtonLink href="/admin/employees" variant="secondary">
          Employees
        </ButtonLink>
      </div>
    </div>
  );
}

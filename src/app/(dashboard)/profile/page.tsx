import Link from "next/link";
import { notFound } from "next/navigation";

import { DetailSection } from "@/components/employees/detail-list";
import { PhotoUpload } from "@/components/employees/photo-upload";
import { EmployeeStatusBadge } from "@/components/employees/employee-status-badge";
import { CLASSIFICATION_LABELS, GENDER_LABELS, ROLE_LABELS, unitLabel } from "@/components/employees/labels";
import { CompactBalances } from "@/components/leave/balance-cards";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { KeyIcon } from "@/components/ui/icons";
import { can } from "@/lib/auth/rbac";
import { formatServiceLength, lengthOfService } from "@/lib/employees/service-length";
import { isStorageConfigured } from "@/lib/storage/r2";
import { formatDisplayDate, todayIsoInSingapore } from "@/lib/utils/dates";
import { requireEmployee } from "@/server/auth.service";
import { photoUrlFor, withPhotoUrls } from "@/server/employee-photo.service";
import { getEmployeeDetail, listDirectReports } from "@/server/employee.service";
import { getEmployeeBalances } from "@/server/leave-balance.service";

// The signed-in employee's own record. Never takes an id from the URL or
// query string: the only record loaded is the one linked to the session.
export default async function ProfilePage() {
  const viewer = await requireEmployee({ action: "view_own_profile" });

  const showTeam = viewer.role === "manager" || viewer.role === "admin";
  const today = todayIsoInSingapore();
  const [employee, reports, balances] = await Promise.all([
    getEmployeeDetail(viewer.id),
    showTeam ? listDirectReports(viewer.id) : Promise.resolve([]),
    getEmployeeBalances(viewer.id, today),
  ]);
  if (!employee) notFound();

  const [photoUrl, team] = await Promise.all([photoUrlFor(employee.photoKey), withPhotoUrls(reports)]);
  const canViewRecords = can(viewer.role, "view_all_records");
  // Photo controls are hidden while storage is not set up.
  const canChangePhoto = can(viewer.role, "update_own_photo") && isStorageConfigured();
  const service = lengthOfService(employee.joinDate, today);
  const dash = <span className="text-muted">—</span>;

  return (
    <div className="space-y-6">
      <Card className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <Avatar name={employee.fullName} src={photoUrl} size="xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="eyebrow text-plum-700">My profile</p>
          <h1 className="font-display text-page-title-mobile font-medium break-words text-plum-900 md:text-page-title">
            {employee.fullName}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] text-muted">{employee.designation}</span>
            <EmployeeStatusBadge status={employee.status} />
          </div>
        </div>
        {canChangePhoto && <PhotoUpload target="self" hasPhoto={!!employee.photoKey} />}
      </Card>

      <DetailSection
        title="Personal"
        items={[
          { label: "Email", value: employee.email },
          { label: "Phone", value: employee.phone ?? dash },
          { label: "Date of birth", value: formatDisplayDate(employee.dateOfBirth) },
          { label: "Gender", value: GENDER_LABELS[employee.gender] },
        ]}
      />

      <DetailSection
        title="Employment"
        items={[
          { label: "Employee code", value: employee.employeeCode },
          { label: "Department", value: unitLabel(employee.departmentName, employee.departmentIsActive) },
          { label: "Branch", value: unitLabel(employee.branchName, employee.branchIsActive) },
          { label: "Classification", value: CLASSIFICATION_LABELS[employee.classification] },
          { label: "Join date", value: formatDisplayDate(employee.joinDate) },
          {
            label: "Length of service",
            value: service ? formatServiceLength(service) : `Starts on ${formatDisplayDate(employee.joinDate)}`,
          },
          {
            label: "Reporting manager",
            value:
              employee.reportingManagerId && employee.reportingManagerName
                ? canViewRecords
                  ? (
                      <Link
                        href={`/admin/employees/${employee.reportingManagerId}`}
                        className="font-semibold text-plum-700 hover:underline"
                      >
                        {employee.reportingManagerName}
                      </Link>
                    )
                  : employee.reportingManagerName
                : dash,
          },
        ]}
      />

      <Card>
        <h2 className="font-display text-section-title font-medium text-plum-900">Access</h2>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow text-plum-700">Role</p>
            <p className="mt-1 text-[15px] text-plum-900">{ROLE_LABELS[employee.role]}</p>
          </div>
          <ButtonLink href="/change-password" variant="secondary">
            <KeyIcon width={18} height={18} />
            Change password
          </ButtonLink>
        </div>
      </Card>

      {showTeam && (
        <Card>
          <h2 className="font-display text-section-title font-medium text-plum-900">
            Your <em>team</em>
          </h2>
          {team.length === 0 ? (
            <p className="mt-3 text-[15px] text-muted">No one reports to you directly.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {team.map((member) => {
                const content = (
                  <>
                    <Avatar name={member.fullName} src={member.photoUrl} size="sm" />
                    <span className="min-w-0">
                      <span className="block font-semibold break-words text-plum-900">{member.fullName}</span>
                      <span className="block text-[13px] break-words text-muted">{member.designation}</span>
                    </span>
                  </>
                );
                return (
                  <li key={member.id} className="py-3 first:pt-0 last:pb-0">
                    {canViewRecords ? (
                      <Link
                        href={`/admin/employees/${member.id}`}
                        className="flex min-h-11 items-center gap-3 rounded-input focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-700"
                      >
                        {content}
                      </Link>
                    ) : (
                      <div className="flex min-h-11 items-center gap-3">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {balances?.started && <CompactBalances balances={balances} />}

      <p className="text-[13px] text-muted">Something wrong? Contact your HR admin to update your details.</p>
    </div>
  );
}

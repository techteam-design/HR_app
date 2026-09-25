import Link from "next/link";
import { notFound } from "next/navigation";

import { DetailSection } from "@/components/employees/detail-list";
import { EmployeeActions } from "@/components/employees/employee-actions";
import { EmployeeStatusBadge } from "@/components/employees/employee-status-badge";
import { CLASSIFICATION_LABELS, GENDER_LABELS, ROLE_LABELS, unitLabel } from "@/components/employees/labels";
import { PhotoUpload } from "@/components/employees/photo-upload";
import { ApplicationList } from "@/components/leave/application-list";
import { EmployeeLeaveBalances } from "@/components/leave/employee-balances";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { can } from "@/lib/auth/rbac";
import { isStorageConfigured } from "@/lib/storage/r2";
import { formatDisplayDate, todayIsoInBrunei } from "@/lib/utils/dates";
import { requireEmployee } from "@/server/auth.service";
import { photoUrlFor } from "@/server/employee-photo.service";
import { getEmployeeDetail } from "@/server/employee.service";
import { listApplications } from "@/server/leave-application.service";
import { getEmployeeBalances, listAdjustments } from "@/server/leave-balance.service";

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const viewer = await requireEmployee({ action: "view_all_records" });
  const { id } = await params;
  const { saved } = await searchParams;

  const employee = await getEmployeeDetail(id);
  if (!employee) notFound();

  const today = todayIsoInBrunei();
  const [photoUrl, balances, adjustments, applications] = await Promise.all([
    photoUrlFor(employee.photoKey),
    getEmployeeBalances(employee.id, today),
    listAdjustments(employee.id),
    listApplications(employee.id),
  ]);
  const canManage = can(viewer.role, "manage_employees");
  const storageConfigured = isStorageConfigured();
  const dash = <span className="text-muted">—</span>;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/employees"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-plum-700 hover:underline focus-visible:outline-2 focus-visible:outline-plum-700"
      >
        ← All employees
      </Link>

      {saved && <Alert tone="notice">Changes saved.</Alert>}

      <Card className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <Avatar name={employee.fullName} src={photoUrl} size="xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-[13px] text-muted">
            {employee.employeeCode} · {employee.designation}
          </p>
          <h1 className="font-display text-page-title-mobile font-medium text-plum-900 md:text-page-title">
            {employee.fullName}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <EmployeeStatusBadge status={employee.status} />
            <span className="rounded-full bg-lilac-50 px-3 py-1 text-xs font-semibold text-plum-900">
              {ROLE_LABELS[employee.role]}
            </span>
          </div>
        </div>
        {canManage && storageConfigured && (
          <PhotoUpload target={{ employeeId: employee.id }} hasPhoto={!!employee.photoKey} />
        )}
      </Card>

      {canManage && (
        <EmployeeActions
          employee={{
            id: employee.id,
            fullName: employee.fullName,
            email: employee.email,
            status: employee.status,
            hasLogin: employee.hasLogin,
          }}
          isSelf={employee.id === viewer.id}
        />
      )}

      {employee.status === "inactive" && employee.deactivatedAt && (
        <Alert tone="notice">
          Deactivated on {formatDisplayDate(employee.deactivatedAt.toISOString().slice(0, 10))}. They cannot sign in.
        </Alert>
      )}

      <DetailSection
        title="Personal"
        items={[
          { label: "Full name", value: employee.fullName },
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
          { label: "Designation", value: employee.designation },
          { label: "Join date", value: formatDisplayDate(employee.joinDate) },
          { label: "Classification", value: CLASSIFICATION_LABELS[employee.classification] },
          { label: "Department", value: unitLabel(employee.departmentName, employee.departmentIsActive) },
          { label: "Branch", value: unitLabel(employee.branchName, employee.branchIsActive) },
          {
            label: "Reporting manager",
            value:
              employee.reportingManagerId && employee.reportingManagerName ? (
                <Link
                  href={`/admin/employees/${employee.reportingManagerId}`}
                  className="font-semibold text-plum-700 hover:underline"
                >
                  {employee.reportingManagerName}
                </Link>
              ) : (
                dash
              ),
          },
          { label: "Status", value: <EmployeeStatusBadge status={employee.status} /> },
        ]}
      />

      <DetailSection
        title="Access"
        items={[
          { label: "Role", value: ROLE_LABELS[employee.role] },
          {
            label: "Login",
            value: employee.hasLogin
              ? employee.mustChangePassword
                ? "Yes · must change password at next sign-in"
                : "Yes"
              : "No login yet",
          },
        ]}
      />

      {balances && (
        <EmployeeLeaveBalances
          employeeId={employee.id}
          balances={balances}
          adjustments={adjustments}
          canManage={canManage}
        />
      )}

      <Card className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-section-title font-medium text-plum-900">
            Leave <em>requests</em>
          </h2>
          {canManage && employee.status !== "inactive" && (
            <ButtonLink href={`/admin/employees/${employee.id}/apply`} variant="secondary">
              Apply on behalf
            </ButtonLink>
          )}
        </div>
        <ApplicationList
          items={applications}
          today={today}
          mode={canManage ? "admin" : "view"}
          emptyText="No leave requests yet."
        />
      </Card>
    </div>
  );
}

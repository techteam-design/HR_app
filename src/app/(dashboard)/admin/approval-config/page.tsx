import Link from "next/link";

import { BranchDefaults } from "@/components/approvals/branch-defaults";
import { EmailSettingsCard } from "@/components/approvals/email-settings-card";
import { EmployeeRoutes } from "@/components/approvals/employee-routes";
import { ManagersApproverCard } from "@/components/approvals/managers-approver-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { can } from "@/lib/auth/rbac";
import { getApprovalSetup } from "@/server/approval-route.service";
import { requireEmployee } from "@/server/auth.service";
import { reminderAfterDays } from "@/server/reminder.service";
import { setupFilterSchema } from "@/validations/approval";

// Approval setup: the managers' leave approver, branch default routes and
// every employee's resolved route (admins excluded, they take no leave),
// and the approver reminder setting with the admin's "Send test email".
// Admins edit; HR viewers see the same page read-only.
export default async function ApprovalConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ departmentId?: string; branchId?: string; problems?: string }>;
}) {
  const viewer = await requireEmployee({ action: "view_all_records" });
  const canEdit = can(viewer.role, "manage_approval_config");
  const filter = setupFilterSchema.parse(await searchParams);
  const [setup, reminderDays] = await Promise.all([
    getApprovalSetup({
      departmentId: filter.departmentId,
      branchId: filter.branchId,
      problemsOnly: filter.problems,
    }),
    reminderAfterDays(),
  ]);
  const filtered = !!(filter.departmentId || filter.branchId || filter.problems);

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <>
            Approval <em>setup</em>
          </>
        }
      />
      {!canEdit && <Alert tone="notice">You can view the approval setup. Only an admin can change it.</Alert>}

      <ManagersApproverCard
        settingId={setup.managersApprover.settingId}
        resolved={setup.managersApprover.resolved}
        adminOptions={setup.adminOptions}
        canEdit={canEdit}
      />

      <BranchDefaults branches={setup.branches} approverOptions={setup.approverOptions} canEdit={canEdit} />

      <EmailSettingsCard reminderAfterDays={reminderDays} canEdit={canEdit} />

      <section aria-labelledby="employee-routes-title" className="space-y-4">
        <div>
          <h2 id="employee-routes-title" className="font-display text-section-title font-medium text-plum-900">
            Employee <em>routes</em>
          </h2>
          <p className="mt-1 text-[15px] text-muted">
            Order: override, then the manager rule (managers), then the branch default. Admins take no leave and are
            not listed.
          </p>
        </div>

        <Card>
          <form method="get" className="grid gap-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="filter-department">Department</Label>
              <Select id="filter-department" name="departmentId" defaultValue={filter.departmentId ?? ""}>
                <option value="">All departments</option>
                {setup.departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-branch">Branch</Label>
              <Select id="filter-branch" name="branchId" defaultValue={filter.branchId ?? ""}>
                <option value="">All branches</option>
                {setup.branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </div>
            <label className="flex min-h-13 cursor-pointer items-center gap-3 text-sm font-semibold text-plum-900">
              <input
                type="checkbox"
                name="problems"
                value="1"
                defaultChecked={filter.problems}
                className="size-5 accent-plum-900"
              />
              Problems only
            </label>
            <div className="flex items-center gap-3">
              <Button type="submit" variant="secondary">
                Filter
              </Button>
              {filtered && (
                <Link
                  href="/admin/approval-config"
                  className="min-h-11 content-center text-sm font-semibold text-plum-700 hover:underline"
                >
                  Clear
                </Link>
              )}
            </div>
          </form>
        </Card>

        <EmployeeRoutes rows={setup.employees} approverOptions={setup.approverOptions} canEdit={canEdit} />
      </section>
    </div>
  );
}

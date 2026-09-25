import Link from "next/link";
import { notFound } from "next/navigation";

import { LeaveApplicationForm } from "@/components/leave/leave-application-form";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/rbac";
import { todayIsoInBrunei } from "@/lib/utils/dates";
import { requireEmployee } from "@/server/auth.service";
import { getApplyContext } from "@/server/leave-application.service";

// Admin: apply for leave on an employee's behalf (same form, plus backdating
// and the notice override).
export default async function ApplyOnBehalfPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireEmployee({ action: "manage_employees" });
  const { id } = await params;
  const context = await getApplyContext(id, todayIsoInBrunei());
  if (!context) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/admin/employees/${id}`}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-plum-700 hover:underline focus-visible:outline-2 focus-visible:outline-plum-700"
      >
        ← {context.employee.fullName}
      </Link>
      <PageHeader
        showDate={false}
        title={
          <>
            Apply on <em>behalf</em>
          </>
        }
      />
      {context.employee.status === "inactive" ? (
        <Alert tone="notice">This employee is inactive. Reactivate them before applying for leave.</Alert>
      ) : (
        <LeaveApplicationForm
          context={context}
          target={{ kind: "on-behalf", employeeId: id, canOverride: can(viewer.role, "override_notice") }}
        />
      )}
    </div>
  );
}

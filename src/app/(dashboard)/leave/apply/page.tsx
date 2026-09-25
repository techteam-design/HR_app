import { notFound } from "next/navigation";

import { LeaveApplicationForm } from "@/components/leave/leave-application-form";
import { PageHeader } from "@/components/ui/page-header";
import { todayIsoInBrunei } from "@/lib/utils/dates";
import { requireEmployee } from "@/server/auth.service";
import { getApplyContext } from "@/server/leave-application.service";

export default async function ApplyLeavePage() {
  const employee = await requireEmployee({ action: "apply_leave" });
  const context = await getApplyContext(employee.id, todayIsoInBrunei());
  if (!context) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={
          <>
            Apply for <em>leave</em>
          </>
        }
      />
      <LeaveApplicationForm context={context} target={{ kind: "self" }} />
    </div>
  );
}

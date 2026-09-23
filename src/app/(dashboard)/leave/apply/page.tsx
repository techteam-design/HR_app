import { PagePlaceholder } from "@/components/layout/page-placeholder";
import { requireEmployee } from "@/server/auth.service";

export default async function ApplyLeavePage() {
  await requireEmployee({ action: "apply_leave" });

  return (
    <PagePlaceholder
      title="Apply for leave"
      sprint="Sprint 2"
      description="Submit annual, MC or unpaid leave, including half days."
    />
  );
}

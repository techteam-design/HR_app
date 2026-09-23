import { PagePlaceholder } from "@/components/layout/page-placeholder";
import { requireEmployee } from "@/server/auth.service";

export default async function ApprovalConfigPage() {
  await requireEmployee({ action: "manage_approval_config" });

  return (
    <PagePlaceholder
      title="Approval setup"
      sprint="Sprint 3"
      description="Single-level or two-level approval and the approvers for each employee."
    />
  );
}

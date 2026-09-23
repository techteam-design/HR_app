import { PagePlaceholder } from "@/components/layout/page-placeholder";
import { requireEmployee } from "@/server/auth.service";

export default async function ApprovalsPage() {
  await requireEmployee({ action: "approve_leave" });

  return (
    <PagePlaceholder
      title="Approvals"
      sprint="Sprint 3"
      description="Leave requests waiting for your Level 1 or Level 2 decision."
    />
  );
}

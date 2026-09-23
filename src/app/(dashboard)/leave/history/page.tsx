import { PagePlaceholder } from "@/components/layout/page-placeholder";
import { requireEmployee } from "@/server/auth.service";

export default async function LeaveHistoryPage() {
  await requireEmployee({ action: "apply_leave" });

  return (
    <PagePlaceholder
      title="My leave history"
      sprint="Sprint 2"
      description="Your past and pending leave applications and their status."
    />
  );
}

import { PagePlaceholder } from "@/components/layout/page-placeholder";
import { requireEmployee } from "@/server/auth.service";

export default async function ReportsPage() {
  await requireEmployee({ action: "view_reports" });

  return (
    <PagePlaceholder
      title="Reports"
      sprint="Sprint 4"
      description="Leave balances and usage across the company, with exports."
    />
  );
}

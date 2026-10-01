import { PagePlaceholder } from "@/components/layout/page-placeholder";
import { requireEmployee } from "@/server/auth.service";

export default async function ReportsPage() {
  await requireEmployee({ action: "view_reports" });

  return (
    <PagePlaceholder
      title="Reports"
      description="Reports and Excel exports (leave trends by department, headcount, balances, leave records) will be available here soon."
    />
  );
}

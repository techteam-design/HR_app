import { PagePlaceholder } from "@/components/layout/page-placeholder";
import { requireEmployee } from "@/server/auth.service";

export default async function LeaveCalendarReportPage() {
  await requireEmployee({ action: "view_reports" });

  return (
    <PagePlaceholder
      title="Leave calendar"
      sprint="Sprint 4"
      description="Company-wide leave calendar by branch and department."
    />
  );
}

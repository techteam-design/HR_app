import { PagePlaceholder } from "@/components/layout/page-placeholder";
import { requireEmployee } from "@/server/auth.service";

export default async function TeamCalendarPage() {
  await requireEmployee({ action: "view_team_calendar" });

  return (
    <PagePlaceholder
      title="Team calendar"
      sprint="Sprint 3"
      description="Approved and pending leave for your direct reports."
    />
  );
}

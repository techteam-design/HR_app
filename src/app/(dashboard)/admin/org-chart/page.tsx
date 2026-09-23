import { PagePlaceholder } from "@/components/layout/page-placeholder";
import { requireEmployee } from "@/server/auth.service";

export default async function OrgChartPage() {
  await requireEmployee({ action: "manage_org" });

  return (
    <PagePlaceholder
      title="Org chart"
      sprint="Sprint 1"
      description="The reporting hierarchy built from each employee's reporting manager."
    />
  );
}

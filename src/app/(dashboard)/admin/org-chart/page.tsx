import { OrgChart } from "@/components/org/org-chart";
import { PageHeader } from "@/components/ui/page-header";
import { requireEmployee } from "@/server/auth.service";
import { getOrgChartData } from "@/server/org-chart.service";

export default async function OrgChartPage() {
  await requireEmployee({ action: "view_all_records" });
  const data = await getOrgChartData();

  return (
    <div className="space-y-8">
      <PageHeader
        title={
          <>
            Org <em>chart</em>
          </>
        }
      />
      <OrgChart people={data.people} departments={data.departments} branches={data.branches} />
    </div>
  );
}

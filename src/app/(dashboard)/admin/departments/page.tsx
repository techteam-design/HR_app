import { OrgUnitsManager } from "@/components/org/org-units-manager";
import { PageHeader } from "@/components/ui/page-header";
import { requireEmployee } from "@/server/auth.service";
import { listBranches } from "@/server/branch.service";
import { listDepartments } from "@/server/department.service";

export default async function DepartmentsPage() {
  await requireEmployee({ action: "manage_org" });
  const [departments, branches] = await Promise.all([listDepartments(), listBranches()]);

  return (
    <div className="space-y-8">
      <PageHeader
        title={
          <>
            Departments &amp; <em>branches</em>
          </>
        }
      />
      <p className="max-w-prose text-[15px] text-muted">
        Departments and branches are never deleted. Deactivate one to stop offering it for new assignments; employees
        who already have it keep it.
      </p>
      <OrgUnitsManager departments={departments} branches={branches} />
    </div>
  );
}

import { EmployeeForm } from "@/components/employees/employee-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireEmployee } from "@/server/auth.service";
import { getEmployeeFormOptions } from "@/server/employee.service";

export default async function NewEmployeePage() {
  await requireEmployee({ action: "manage_employees" });
  const options = await getEmployeeFormOptions();

  return (
    <div className="space-y-8">
      <PageHeader
        title={
          <>
            Add <em>employee</em>
          </>
        }
      />
      <EmployeeForm mode="create" options={options} />
    </div>
  );
}

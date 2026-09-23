import { notFound } from "next/navigation";

import { EmployeeForm } from "@/components/employees/employee-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireEmployee } from "@/server/auth.service";
import { getEmployeeDetail, getEmployeeFormOptions } from "@/server/employee.service";

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireEmployee({ action: "manage_employees" });
  const { id } = await params;

  const employee = await getEmployeeDetail(id);
  if (!employee) notFound();
  const options = await getEmployeeFormOptions(employee.id);

  return (
    <div className="space-y-8">
      <PageHeader
        title={
          <>
            Edit <em>{employee.fullName}</em>
          </>
        }
      />
      <EmployeeForm
        mode="edit"
        employeeId={employee.id}
        isSelf={employee.id === viewer.id}
        options={options}
        initial={{
          fullName: employee.fullName,
          employeeCode: employee.employeeCode,
          email: employee.email,
          phone: employee.phone,
          dateOfBirth: employee.dateOfBirth,
          gender: employee.gender,
          joinDate: employee.joinDate,
          designation: employee.designation,
          departmentId: employee.departmentId,
          branchId: employee.branchId,
          classification: employee.classification,
          reportingManagerId: employee.reportingManagerId,
          role: employee.role,
          status: employee.status,
        }}
      />
    </div>
  );
}

import { PagePlaceholder } from "@/components/layout/page-placeholder";
import { requireEmployee } from "@/server/auth.service";

export default async function EmployeesPage() {
  await requireEmployee({ action: "manage_employees" });

  return (
    <PagePlaceholder
      title="Employees"
      sprint="Sprint 1"
      description="Search, add, edit and deactivate employees, and create their logins."
    />
  );
}

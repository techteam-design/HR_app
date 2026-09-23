import { PagePlaceholder } from "@/components/layout/page-placeholder";
import { requireEmployee } from "@/server/auth.service";

export default async function NewEmployeePage() {
  await requireEmployee({ action: "manage_employees" });

  return (
    <PagePlaceholder
      title="Add employee"
      sprint="Sprint 1"
      description="Create an employee record and, optionally, their login."
    />
  );
}

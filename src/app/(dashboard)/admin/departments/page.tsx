import { PagePlaceholder } from "@/components/layout/page-placeholder";
import { requireEmployee } from "@/server/auth.service";

export default async function DepartmentsPage() {
  await requireEmployee({ action: "manage_org" });

  return (
    <PagePlaceholder
      title="Departments & branches"
      sprint="Sprint 1"
      description="Add, rename and deactivate departments and branches."
    />
  );
}

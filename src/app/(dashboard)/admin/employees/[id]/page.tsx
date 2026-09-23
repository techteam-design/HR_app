import { PagePlaceholder } from "@/components/layout/page-placeholder";
import { requireEmployee } from "@/server/auth.service";

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireEmployee({ action: "manage_employees" });
  await params;

  return (
    <PagePlaceholder
      title="Employee details"
      sprint="Sprint 1"
      description="View and edit this employee's profile, role, status and reporting manager."
    />
  );
}

import { PagePlaceholder } from "@/components/layout/page-placeholder";
import { requireEmployee } from "@/server/auth.service";

export default async function LeavePoliciesPage() {
  await requireEmployee({ action: "manage_policies" });

  return (
    <PagePlaceholder
      title="Leave policies"
      sprint="Sprint 2"
      description="Entitlements, eligibility, notice and carry-forward rules per leave type."
    />
  );
}

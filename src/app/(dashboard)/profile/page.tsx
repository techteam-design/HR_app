import { PagePlaceholder } from "@/components/layout/page-placeholder";
import { requireEmployee } from "@/server/auth.service";

export default async function ProfilePage() {
  await requireEmployee({ action: "view_own_profile" });

  return (
    <PagePlaceholder
      title="My profile"
      sprint="Sprint 1"
      description="Your personal and employment details."
    />
  );
}

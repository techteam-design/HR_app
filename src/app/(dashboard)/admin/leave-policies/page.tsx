import { LeavePolicyCards, type PolicyView } from "@/components/leave/leave-policy-cards";
import { Alert } from "@/components/ui/alert";
import { AccentTitle, PageHeader } from "@/components/ui/page-header";
import { formatDisplayDate, todayIsoInSingapore } from "@/lib/utils/dates";
import { requireEmployee } from "@/server/auth.service";
import { loadLeavePolicies } from "@/server/leave-policy.service";

export default async function LeavePoliciesPage() {
  await requireEmployee({ action: "manage_policies" });
  const policies = await loadLeavePolicies();

  const views: PolicyView[] = policies.map((policy) => ({
    code: policy.code,
    name: policy.name,
    entitlementTable: policy.entitlementTable,
    fixedDays: policy.fixedDays,
    eligibilityMonthsLocal: policy.eligibilityMonthsLocal,
    eligibilityMonthsForeign: policy.eligibilityMonthsForeign,
    advanceNoticeDaysForeign: policy.advanceNoticeDaysForeign,
    carryForwardEnabled: policy.carryForwardEnabled,
    carryForwardCap: policy.carryForwardCap,
    carryForwardExpiryMonths: policy.carryForwardExpiryMonths,
    prorateOnJoin: policy.prorateOnJoin,
    prorateRounding: policy.prorateRounding,
    // Only edits made in the app record who made them (the seed clears it).
    lastChanged: policy.updatedByName
      ? `${formatDisplayDate(todayIsoInSingapore(policy.updatedAt))} by ${policy.updatedByName}`
      : null,
  }));

  return (
    <section className="space-y-6">
      <PageHeader title={<AccentTitle text="Leave policies" />} />
      <Alert tone="notice">
        Changes apply to entitlements created from now on. Existing leave years are not recalculated.
      </Alert>
      {views.length === 0 ? (
        <Alert>No leave policies found. Run the config seed (npm run db:seed).</Alert>
      ) : (
        <LeavePolicyCards policies={views} />
      )}
    </section>
  );
}

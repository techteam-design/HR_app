import { HalfDayTimingsCard } from "@/components/leave/half-day-timings-card";
import { LeavePolicyCards, type PolicyView } from "@/components/leave/leave-policy-cards";
import { Alert } from "@/components/ui/alert";
import { AccentTitle, PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/rbac";
import { formatDisplayDate, todayIsoInBrunei } from "@/lib/utils/dates";
import { requireEmployee } from "@/server/auth.service";
import { loadHalfDayTimings } from "@/server/half-day-timing.service";
import { loadLeavePolicies } from "@/server/leave-policy.service";

// Admin edits; hr_viewer sees everything read-only.
export default async function LeavePoliciesPage() {
  const viewer = await requireEmployee({ action: "view_all_records" });
  const canEdit = can(viewer.role, "manage_policies");
  const [policies, halfDay] = await Promise.all([loadLeavePolicies(), loadHalfDayTimings()]);

  // Only edits made in the app record who made them (the seed clears it).
  const changed = (at: Date | null, name: string | null) =>
    at && name ? `${formatDisplayDate(todayIsoInBrunei(at))} by ${name}` : null;

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
    lastChanged: changed(policy.updatedAt, policy.updatedByName),
  }));

  return (
    <section className="space-y-6">
      <PageHeader title={<AccentTitle text="Leave policies" />} />
      <Alert tone="notice">
        {canEdit
          ? "Changes apply to entitlements created from now on. Existing leave years are not recalculated."
          : "You can view the leave policies. Only an admin can change them."}
      </Alert>
      {views.length === 0 ? (
        <Alert>No leave policies found. Run the config seed (npm run db:seed).</Alert>
      ) : (
        <LeavePolicyCards policies={views} canEdit={canEdit} />
      )}
      <HalfDayTimingsCard
        timings={halfDay.timings}
        lastChanged={changed(halfDay.updatedAt, halfDay.updatedByName)}
        canEdit={canEdit}
      />
    </section>
  );
}

import { AllDecisionsView } from "@/components/approvals/all-decisions";
import { QueueTabs } from "@/components/approvals/queue-tabs";
import { RequestCard } from "@/components/approvals/request-card";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/rbac";
import { todayIsoInBrunei } from "@/lib/utils/dates";
import { listAllDecisions } from "@/server/approval-decisions.service";
import { listQueue } from "@/server/approval.service";
import { requireEmployee } from "@/server/auth.service";
import { decisionsFilterSchema, queueViewSchema, type QueueView } from "@/validations/approval";

const EMPTY: Record<Exclude<QueueView, "decisions">, string> = {
  mine: "Nothing is waiting for your decision.",
  all: "There are no pending requests.",
  decided: "You haven't decided any requests yet.",
};

// Approver queue: requests waiting for the viewer at their current level,
// all pending requests (admin), the viewer's recent decisions, and every
// decision with overrides (admin).
export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const viewer = await requireEmployee({ action: "approve_leave" });
  const isAdmin = can(viewer.role, "decide_any_leave");
  const params = await searchParams;
  const requested = queueViewSchema.parse(params.view);
  const adminOnly = requested === "all" || requested === "decisions";
  const view: QueueView = adminOnly && !isAdmin ? "mine" : requested;
  const views: QueueView[] = isAdmin ? ["mine", "all", "decided", "decisions"] : ["mine", "decided"];
  const today = todayIsoInBrunei();

  const header = (
    <>
      <PageHeader
        title={
          <>
            Leave <em>approvals</em>
          </>
        }
      />
      <QueueTabs current={view} views={views} />
    </>
  );

  if (view === "decisions") {
    const filter = decisionsFilterSchema.parse(params);
    const data = await listAllDecisions(filter, today);
    return (
      <div className="space-y-6">
        {header}
        <p className="text-[15px] text-muted">
          Every approval, rejection and override in the dates below. You can revoke an approval or approve a
          rejected request anyway; a reason is required and recorded.
        </p>
        <AllDecisionsView data={data} filter={filter} />
      </div>
    );
  }

  const items = await listQueue(viewer, view, today);
  return (
    <div className="space-y-6">
      {header}
      {view === "all" && (
        <p className="text-[15px] text-muted">
          Oldest first. You can decide any request at its current level; your name is recorded on the decision.
        </p>
      )}
      {items.length === 0 ? (
        <p className="text-[15px] text-muted">{EMPTY[view]}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <RequestCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

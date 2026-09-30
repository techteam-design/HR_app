import { QueueTabs } from "@/components/approvals/queue-tabs";
import { RequestCard } from "@/components/approvals/request-card";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/rbac";
import { todayIsoInBrunei } from "@/lib/utils/dates";
import { listQueue } from "@/server/approval.service";
import { requireEmployee } from "@/server/auth.service";
import { queueViewSchema, type QueueView } from "@/validations/approval";

const EMPTY: Record<QueueView, string> = {
  mine: "Nothing is waiting for your decision.",
  all: "There are no pending requests.",
  decided: "You haven't decided any requests yet.",
};

// Approver queue: requests waiting for the viewer at their current level,
// all pending requests (admin), and the viewer's recent decisions.
export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const viewer = await requireEmployee({ action: "approve_leave" });
  const isAdmin = can(viewer.role, "decide_any_leave");
  const requested = queueViewSchema.parse((await searchParams).view);
  const view: QueueView = requested === "all" && !isAdmin ? "mine" : requested;
  const views: QueueView[] = isAdmin ? ["mine", "all", "decided"] : ["mine", "decided"];
  const items = await listQueue(viewer, view, todayIsoInBrunei());

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <>
            Leave <em>approvals</em>
          </>
        }
      />
      <QueueTabs current={view} views={views} />
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

import Link from "next/link";

import { cn } from "@/lib/utils/cn";
import type { QueueView } from "@/validations/approval";

const LABELS: Record<QueueView, string> = {
  mine: "Waiting for me",
  all: "All pending",
  decided: "Decided by me",
};

// Plain links, so each view can be bookmarked and works without JavaScript.
export function QueueTabs({ current, views }: { current: QueueView; views: QueueView[] }) {
  return (
    <nav aria-label="Approval views" className="flex flex-wrap gap-2 rounded-full bg-lilac-50 p-1 sm:inline-flex">
      {views.map((view) => (
        <Link
          key={view}
          href={view === "mine" ? "/approvals" : `/approvals?view=${view}`}
          aria-current={view === current ? "page" : undefined}
          className={cn(
            "flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-sm font-semibold transition-colors duration-150 sm:flex-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-700",
            view === current ? "bg-surface text-plum-900" : "text-plum-700 hover:text-plum-900",
          )}
        >
          {LABELS[view]}
        </Link>
      ))}
    </nav>
  );
}

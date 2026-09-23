import Link from "next/link";

import { cn } from "@/lib/utils/cn";

const linkClass =
  "inline-flex min-h-11 items-center rounded-full border border-input-border bg-surface px-5 text-sm font-semibold text-plum-900 " +
  "hover:bg-lilac-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-700";

export function Pagination({
  page,
  pageCount,
  total,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  total: number;
  hrefFor: (page: number) => string;
}) {
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-[13px] text-muted">
        {total} employee{total === 1 ? "" : "s"} · page {page} of {pageCount}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={linkClass} rel="prev">
            Previous
          </Link>
        ) : (
          <span className={cn(linkClass, "pointer-events-none opacity-50")} aria-disabled="true">
            Previous
          </span>
        )}
        {page < pageCount ? (
          <Link href={hrefFor(page + 1)} className={linkClass} rel="next">
            Next
          </Link>
        ) : (
          <span className={cn(linkClass, "pointer-events-none opacity-50")} aria-disabled="true">
            Next
          </span>
        )}
      </div>
    </nav>
  );
}

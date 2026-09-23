import type { ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-card border border-border bg-surface p-5 sm:p-6", className)}
      {...props}
    />
  );
}

export type ArchTint = "lilac" | "blush" | "sage";

const tints: Record<ArchTint, { card: string; label: string; track: string; bar: string }> = {
  lilac: { card: "bg-lilac-50", label: "text-plum-700", track: "bg-lilac-100", bar: "bg-plum-500" },
  blush: { card: "bg-blush-50", label: "text-blush-700", track: "bg-surface", bar: "bg-blush-500" },
  sage: { card: "bg-sage-50", label: "text-sage-700", track: "bg-surface", bar: "bg-sage-500" },
};

type ArchCardProps = {
  tint: ArchTint;
  // e.g. "Annual leave"
  label: string;
  // Big number, e.g. days remaining.
  value: number | string;
  // e.g. "of 12 days left"
  caption: string;
  // Optional second line, e.g. "Includes 2 carried forward".
  note?: string;
  // Progress bar fill, 0–1. Omit to hide the bar.
  progress?: number;
  className?: string;
};

// Arch-topped balance card. Used for leave balances from Sprint 2.
export function ArchCard({ tint, label, value, caption, note, progress, className }: ArchCardProps) {
  const t = tints[tint];
  const percent =
    progress === undefined ? undefined : Math.round(Math.min(Math.max(progress, 0), 1) * 100);

  return (
    <div
      className={cn(
        "flex min-h-64 flex-col items-center justify-end rounded-arch px-5 pb-6 pt-14 text-center",
        t.card,
        className,
      )}
    >
      <p className={cn("eyebrow", t.label)}>{label}</p>
      <p className="mt-3 font-display text-6xl leading-none font-medium text-plum-900">{value}</p>
      <p className="mt-2 text-sm text-muted">{caption}</p>
      {note && <p className="mt-1 text-[13px] font-medium text-plum-900">{note}</p>}
      {percent !== undefined && (
        <div
          role="progressbar"
          aria-label={`${label} remaining`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className={cn("mt-5 h-1.5 w-full overflow-hidden rounded-full", t.track)}
        >
          <div className={cn("h-full rounded-full", t.bar)} style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}

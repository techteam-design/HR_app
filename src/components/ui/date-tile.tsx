import { cn } from "@/lib/utils/cn";

const variants = {
  dark: { tile: "bg-plum-900", month: "text-lilac-100", day: "text-surface" },
  light: { tile: "bg-lilac-50", month: "text-plum-700", day: "text-plum-900" },
} as const;

// Small arch-topped tile showing a month and day, e.g. SEP / 23.
export function DateTile({
  month,
  day,
  variant = "light",
  className,
}: {
  month: string;
  day: number | string;
  variant?: keyof typeof variants;
  className?: string;
}) {
  const v = variants[variant];
  return (
    <div
      className={cn(
        "flex h-16 w-14 shrink-0 flex-col items-center justify-end rounded-t-full rounded-b-xl pb-2",
        v.tile,
        className,
      )}
    >
      <span className={cn("text-[10px] font-semibold uppercase tracking-[0.16em]", v.month)}>
        {month}
      </span>
      <span className={cn("font-display text-2xl leading-none font-medium", v.day)}>{day}</span>
    </div>
  );
}

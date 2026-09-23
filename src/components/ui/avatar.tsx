import { cn } from "@/lib/utils/cn";

const sizes = {
  sm: "size-9 text-xs",
  md: "size-11 text-sm",
  lg: "size-14 text-base",
  xl: "size-24 text-2xl",
} as const;

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

// Initials in a brand-lilac circle. Decorative: pair it with the visible name.
export function Avatar({
  name,
  size = "md",
  src,
  className,
}: {
  name: string;
  size?: keyof typeof sizes;
  // Short-lived presigned photo URL. Without one, initials are shown.
  src?: string | null;
  className?: string;
}) {
  if (src) {
    return (
      // Presigned private-bucket URLs change every request, so next/image
      // (which needs fixed remote hosts) is not used here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className={cn("shrink-0 rounded-full bg-brand-lilac object-cover", sizes[size], className)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-brand-lilac font-semibold text-plum-900",
        sizes[size],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

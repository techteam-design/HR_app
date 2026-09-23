import type { ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

// Checkbox with its label and optional description; the whole row is a
// 44px+ touch target.
export function Checkbox({
  label,
  description,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { label: string; description?: string }) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-start gap-3 rounded-input border border-input-border bg-surface p-4",
        "has-[:checked]:border-plum-700 has-[:checked]:bg-lilac-50",
        className,
      )}
    >
      <input
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 accent-plum-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-700"
        {...props}
      />
      <span>
        <span className="block text-sm font-semibold text-plum-900">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-muted">{description}</span>}
      </span>
    </label>
  );
}

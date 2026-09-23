import type { ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

type SelectProps = ComponentProps<"select"> & {
  invalid?: boolean;
};

// Native select styled like Input (52px, 16px text so iOS does not zoom).
export function Select({ invalid = false, className, children, ...props }: SelectProps) {
  return (
    <div className="relative">
      <select
        aria-invalid={invalid || undefined}
        className={cn(
          "block h-13 w-full appearance-none rounded-input border bg-surface pr-11 pl-4 text-base text-plum-900",
          "transition-colors duration-150 disabled:cursor-not-allowed disabled:bg-lilac-50 disabled:text-muted",
          "focus:outline-2 focus:outline-offset-0 focus:outline-plum-700",
          invalid ? "border-status-rejected-text" : "border-input-border hover:border-lilac-200",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width={18}
        height={18}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

import type { ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={cn("block text-[13px] font-semibold text-plum-900", className)}
      {...props}
    />
  );
}

type InputProps = ComponentProps<"input"> & {
  invalid?: boolean;
};

// 16px text keeps iOS Safari from zooming into the field on focus.
export function Input({ invalid = false, className, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        "block h-13 w-full rounded-input border bg-surface px-4 text-base text-plum-900",
        "placeholder:text-muted transition-colors duration-150",
        "focus:outline-2 focus:outline-offset-0 focus:outline-plum-700",
        invalid ? "border-status-rejected-text" : "border-input-border hover:border-lilac-200",
        className,
      )}
      {...props}
    />
  );
}

export function FieldError({ id, children }: { id?: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="text-[13px] font-medium text-status-rejected-text">
      {children}
    </p>
  );
}

export function FieldHint({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="text-[13px] text-muted">
      {children}
    </p>
  );
}

import Link from "next/link";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost";

const base =
  "inline-flex h-13 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold " +
  "transition-colors duration-150 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-700 " +
  "disabled:cursor-not-allowed disabled:opacity-55";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-plum-900 text-surface hover:bg-plum-700",
  secondary: "border border-input-border bg-surface text-plum-900 hover:bg-lilac-50",
  ghost: "text-plum-900 hover:bg-lilac-50",
};

export function buttonClasses(variant: ButtonVariant = "primary", fullWidth = false) {
  return cn(base, variants[variant], fullWidth && "w-full");
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  loading?: boolean;
  // Text shown while loading, e.g. "Signing in…".
  loadingText?: string;
};

export function Button({
  variant = "primary",
  fullWidth = false,
  loading = false,
  loadingText,
  disabled,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses(variant, fullWidth), className)}
      {...props}
    >
      {loading && <Spinner />}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  fullWidth?: boolean;
};

export function ButtonLink({
  variant = "primary",
  fullWidth = false,
  className,
  ...props
}: ButtonLinkProps) {
  return <Link className={cn(buttonClasses(variant, fullWidth), className)} {...props} />;
}

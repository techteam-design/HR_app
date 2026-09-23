import { cn } from "@/lib/utils/cn";

type AlertTone = "error" | "notice";

const tones: Record<AlertTone, string> = {
  error: "bg-status-rejected-bg text-status-rejected-text",
  notice: "bg-lilac-50 text-plum-900",
};

// Form-level or page-level message. Errors are announced to screen readers.
export function Alert({
  tone = "error",
  className,
  children,
}: {
  tone?: AlertTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-input px-4 py-3 text-sm font-medium", tones[tone], className)}
    >
      {children}
    </p>
  );
}

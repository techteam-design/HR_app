import { SparkleIcon } from "./icons";

// Thin divider with a small four-point sparkle in the middle.
export function SparkleDivider({ className }: { className?: string }) {
  return (
    <div className={className} role="separator">
      <div className="flex items-center gap-3 text-lilac-200">
        <span className="h-px flex-1 bg-border" />
        <SparkleIcon width={14} height={14} className="text-plum-500" />
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}

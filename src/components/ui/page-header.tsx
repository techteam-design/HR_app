import { formatLongDate } from "@/lib/utils/dates";

// Page header: small muted date line, Playfair title (with an optional
// italic accent word via <em>), and an optional primary action on the right.
export function PageHeader({
  title,
  action,
  showDate = true,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  showDate?: boolean;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {showDate && <p className="text-[13px] text-muted">{formatLongDate()}</p>}
        <h1 className="mt-1 font-display text-page-title-mobile font-medium text-plum-900 md:text-page-title">
          {title}
        </h1>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

// Renders "Leave policies" as "Leave <em>policies</em>".
export function AccentTitle({ text }: { text: string }) {
  const index = text.lastIndexOf(" ");
  if (index === -1) return <em>{text}</em>;
  return (
    <>
      {text.slice(0, index + 1)}
      <em>{text.slice(index + 1)}</em>
    </>
  );
}

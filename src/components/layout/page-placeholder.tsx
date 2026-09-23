import { SparkleIcon } from "@/components/ui/icons";
import { AccentTitle, PageHeader } from "@/components/ui/page-header";

// Soft lilac panel saying which sprint builds this page.
export function PlaceholderPanel({
  title,
  sprint,
  description,
}: {
  title: string;
  sprint: string;
  description: string;
}) {
  return (
    <div className="rounded-card bg-lilac-50 px-6 py-8 sm:px-10 sm:py-12">
      <SparkleIcon width={20} height={20} className="text-plum-500" />
      <p className="eyebrow mt-4 text-plum-700">Coming in {sprint}</p>
      <h2 className="mt-2 font-display text-section-title font-medium text-plum-900">{title}</h2>
      <p className="mt-2 max-w-prose text-[15px] text-muted">{description}</p>
    </div>
  );
}

export function PagePlaceholder({
  title,
  sprint,
  description,
}: {
  title: string;
  sprint: string;
  description: string;
}) {
  return (
    <section className="space-y-8">
      <PageHeader title={<AccentTitle text={title} />} />
      <PlaceholderPanel title={title} sprint={sprint} description={description} />
    </section>
  );
}

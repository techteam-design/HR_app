import { Card } from "@/components/ui/card";

// Read-only section of label/value pairs, used on the employee profile.
export function DetailSection({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: React.ReactNode }[];
}) {
  return (
    <Card>
      <h2 className="font-display text-section-title font-medium text-plum-900">{title}</h2>
      <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="eyebrow text-plum-700">{item.label}</dt>
            <dd className="mt-1 text-[15px] break-words text-plum-900">{item.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

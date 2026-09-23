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
    <section>
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-6">
        <p className="text-sm font-medium text-slate-700">Coming in {sprint}</p>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
    </section>
  );
}

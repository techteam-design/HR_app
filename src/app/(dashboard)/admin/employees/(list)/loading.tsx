// Shown while the employee list loads.
export default function Loading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading employees">
      <div className="space-y-3">
        <div className="h-4 w-48 animate-pulse rounded-full bg-lilac-50" />
        <div className="h-10 w-64 animate-pulse rounded-full bg-lilac-50" />
      </div>
      <div className="h-40 animate-pulse rounded-card bg-lilac-50" />
      <div className="space-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-card bg-lilac-50" />
        ))}
      </div>
    </div>
  );
}

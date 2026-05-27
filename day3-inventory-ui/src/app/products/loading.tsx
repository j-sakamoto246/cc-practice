export default function Loading() {
  return (
    <main id="main-content" className="container mx-auto flex flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <div className="bg-muted h-7 w-40 animate-pulse rounded" />
        <div className="bg-muted h-4 w-64 animate-pulse rounded" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="bg-muted h-9 w-full max-w-sm animate-pulse rounded" />
        <div className="bg-muted h-9 w-32 animate-pulse rounded" />
      </div>

      <div className="flex flex-col gap-2 rounded-lg border p-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-muted h-10 w-full animate-pulse rounded" />
        ))}
      </div>
    </main>
  );
}

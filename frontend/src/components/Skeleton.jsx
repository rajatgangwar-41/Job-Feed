"use client";

// Shimmering placeholder blocks shown only for the very first load, before
// the initial /api/feed response arrives (typically well under a second,
// but a slow/cold backend can take longer). Marks and notes never need
// this -- those paint optimistically the instant you click.
function Bar({ w, h = "h-3" }) {
  return <div className={`animate-pulse rounded bg-border ${h} ${w}`} />;
}

export function RowSkeleton() {
  return (
    <div className="mb-1.5 rounded-lg border border-border bg-surface px-2.5 py-2">
      <Bar w="w-3/5" />
      <div className="mt-2 flex gap-2">
        <Bar w="w-14" h="h-2.5" />
        <Bar w="w-20" h="h-2.5" />
        <Bar w="w-10" h="h-2.5" />
      </div>
    </div>
  );
}

export function BoardSkeleton() {
  return (
    <div className="grid h-full gap-2.5 overflow-hidden p-2.5" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
      {Array.from({ length: 4 }).map((_, col) => (
        <section key={col} className="flex min-h-0 min-w-0 flex-col rounded-[10px] border border-border bg-surface shadow-[var(--shadow-card)]">
          <div className="flex flex-none items-center gap-2 border-b border-border px-3 py-2">
            <div className="animate-pulse h-6 w-20 rounded-full bg-border" />
          </div>
          <div className="min-h-0 flex-1 p-1.5">
            {Array.from({ length: 4 - (col % 2) }).map((_, row) => <RowSkeleton key={row} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

import { PageShell } from '@/components/ui/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

// Loading skeleton for /attendance/[sectionId]. Five parallel fetches
// (calendar, events, daily, rollup, quota) take ~300–600ms at HFSE scale.
// Without this skeleton the user sees the previous page until the server
// component resolves. Shape mirrors the wide-grid hero + stat row + grid.
export default function Loading() {
  return (
    <PageShell>
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-12 w-[260px]" />
          <Skeleton className="h-4 w-[28rem] max-w-full" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-8 w-40" />
        </div>
      </header>

      <Skeleton className="h-9 w-[380px] rounded-xl" />

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[148px] w-full rounded-xl" />
        ))}
      </div>

      {/* Grid shimmer — approx the wide-grid footprint. 30 rows × a handful of
          sticky columns visible. Don't bother rendering 47 date columns
          client-side; the horizontal scroll area paints on hydration. */}
      <Card className="overflow-hidden p-0">
        <div className="space-y-0">
          <div className="flex items-center gap-3 border-b border-border bg-muted/60 px-3 py-2">
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-4 w-[180px]" />
            <Skeleton className="h-4 w-[110px]" />
            <div className="flex gap-2 ml-auto">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-10" />
              ))}
            </div>
          </div>
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
            >
              <Skeleton className="h-4 w-6" />
              <Skeleton className="h-4 w-[160px]" />
              <Skeleton className="h-4 w-[90px]" />
              <div className="flex gap-2 ml-auto">
                {Array.from({ length: 6 }).map((_, j) => (
                  <Skeleton key={j} className="h-6 w-10" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </PageShell>
  );
}

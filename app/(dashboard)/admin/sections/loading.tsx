import { PageShell } from '@/components/ui/page-shell';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <PageShell>
      <header className="space-y-4">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-4 w-[28rem] max-w-full" />
      </header>

      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </PageShell>
  );
}

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { PageShell } from '@/components/ui/page-shell';

export default function SisStudentDetailLoading() {
  return (
    <PageShell>
      <div className="h-3 w-32 animate-pulse rounded bg-muted" />
      <header className="space-y-3">
        <div className="h-3 w-48 animate-pulse rounded bg-muted" />
        <div className="h-9 w-72 animate-pulse rounded bg-muted" />
        <div className="h-3 w-96 animate-pulse rounded bg-muted" />
      </header>
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-24 animate-pulse rounded bg-muted" />
        ))}
      </div>
      <Card>
        <CardHeader>
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-2.5 w-20 animate-pulse rounded bg-muted" />
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}

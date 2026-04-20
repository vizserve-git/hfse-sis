import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { PageShell } from '@/components/ui/page-shell';

export default function SisStudentsLoading() {
  return (
    <PageShell>
      <div className="h-3 w-24 animate-pulse rounded bg-muted" />
      <header className="space-y-3">
        <div className="h-3 w-56 animate-pulse rounded bg-muted" />
        <div className="h-10 w-72 animate-pulse rounded bg-muted" />
        <div className="h-4 w-96 animate-pulse rounded bg-muted" />
      </header>
      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="h-10 w-full animate-pulse rounded-md bg-muted md:w-96" />
          <div className="flex items-center gap-2">
            <div className="h-9 w-72 animate-pulse rounded bg-muted" />
            <div className="h-9 w-20 animate-pulse rounded bg-muted" />
            <div className="h-9 w-20 animate-pulse rounded bg-muted" />
          </div>
          <Card className="overflow-hidden p-0">
            <div className="border-b border-border bg-muted/40">
              <div className="h-10" />
            </div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="border-b border-border last:border-0 px-4 py-3">
                <div className="h-5 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </Card>
        </div>
        <Card>
          <CardHeader>
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          </CardHeader>
          <CardContent>
            <div className="h-9 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

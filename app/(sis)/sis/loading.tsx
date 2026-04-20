import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { PageShell } from '@/components/ui/page-shell';

export default function SisLoading() {
  return (
    <PageShell>
      <header className="space-y-3">
        <div className="h-3 w-48 animate-pulse rounded bg-muted" />
        <div className="h-10 w-80 animate-pulse rounded bg-muted" />
        <div className="h-4 w-96 animate-pulse rounded bg-muted" />
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="gap-0 py-0">
                <CardContent className="flex items-center gap-4 px-5 py-4">
                  <div className="size-10 animate-pulse rounded-xl bg-muted" />
                  <div className="space-y-2">
                    <div className="h-6 w-12 animate-pulse rounded bg-muted" />
                    <div className="h-2.5 w-20 animate-pulse rounded bg-muted" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
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

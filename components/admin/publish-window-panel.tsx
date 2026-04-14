'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, Loader2, Share2, X } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Surface, SurfaceHeader, SurfaceTitle, SurfaceDescription } from '@/components/ui/surface';

type Term = { id: string; term_number: number; label: string };

type Publication = {
  id: string;
  section_id: string;
  term_id: string;
  publish_from: string;
  publish_until: string;
  published_by: string;
};

type Status = 'active' | 'scheduled' | 'expired' | 'none';

function statusOf(p: Publication | undefined): Status {
  if (!p) return 'none';
  const now = new Date();
  const from = new Date(p.publish_from);
  const until = new Date(p.publish_until);
  if (now < from) return 'scheduled';
  if (now > until) return 'expired';
  return 'active';
}

function statusLabel(s: Status): string {
  switch (s) {
    case 'active':
      return 'Published · parents can view now';
    case 'scheduled':
      return 'Scheduled · not yet visible';
    case 'expired':
      return 'Expired · window closed';
    default:
      return 'Not published';
  }
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toInputValue(iso: string): string {
  // `datetime-local` wants `YYYY-MM-DDTHH:mm` in the viewer's local time.
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PublishWindowPanel({
  sectionId,
  sectionName,
  terms,
}: {
  sectionId: string;
  sectionName: string;
  terms: Term[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [publications, setPublications] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTermId, setEditingTermId] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const res = await fetch(`/api/report-card-publications?section_id=${sectionId}`);
      const body = await res.json();
      if (!cancelled) {
        setPublications((body.publications ?? []) as Publication[]);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [sectionId]);

  async function save(termId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/report-card-publications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          section_id: sectionId,
          term_id: termId,
          publish_from: new Date(from).toISOString(),
          publish_until: new Date(until).toISOString(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'publish failed');
      // Refresh list
      const reload = await fetch(`/api/report-card-publications?section_id=${sectionId}`);
      const reloadBody = await reload.json();
      setPublications((reloadBody.publications ?? []) as Publication[]);
      setEditingTermId(null);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown error');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(publicationId: string) {
    if (!confirm('Revoke this publication? Parents will lose access immediately.')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/report-card-publications/${publicationId}`, {
        method: 'DELETE',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'revoke failed');
      setPublications((prev) => prev.filter((p) => p.id !== publicationId));
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown error');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(termId: string, existing?: Publication) {
    setEditingTermId(termId);
    setError(null);
    if (existing) {
      setFrom(toInputValue(existing.publish_from));
      setUntil(toInputValue(existing.publish_until));
    } else {
      // Default: now → two weeks from now
      const now = new Date();
      const twoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      setFrom(toInputValue(now.toISOString()));
      setUntil(toInputValue(twoWeeks.toISOString()));
    }
  }

  return (
    <Surface padded={false}>
      <SurfaceHeader>
        <div className="flex items-center gap-2">
          <Share2 className="h-4 w-4 text-primary" />
          <SurfaceTitle>Parent access for {sectionName}</SurfaceTitle>
        </div>
        <SurfaceDescription>
          Publish each term&apos;s report card to parents within a time window. Parents sign in to the
          parent portal with their own account and can only view published terms.
        </SurfaceDescription>
      </SurfaceHeader>

      <div className="space-y-3 p-6 md:p-8">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading publications…
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!loading &&
          terms.map((term) => {
            const existing = publications.find((p) => p.term_id === term.id);
            const status = statusOf(existing);
            const isEditing = editingTermId === term.id;

            return (
              <div
                key={term.id}
                className="rounded-lg border border-border bg-card px-4 py-3 transition-colors"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-serif text-base font-semibold tracking-tight text-foreground">
                      {term.label}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs">
                      <StatusBadge status={status} />
                      {existing && (
                        <span className="text-muted-foreground tabular-nums">
                          {fmt(existing.publish_from)} → {fmt(existing.publish_until)}
                        </span>
                      )}
                    </div>
                  </div>
                  {!isEditing && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={existing ? 'outline' : 'default'}
                        onClick={() => startEdit(term.id, existing)}
                      >
                        {existing ? 'Edit window' : 'Publish'}
                      </Button>
                      {existing && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => revoke(existing.id)}
                          disabled={busy}
                        >
                          <X className="h-3.5 w-3.5" />
                          Revoke
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {isEditing && (
                  <div className="mt-3 space-y-3 border-t border-border pt-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`from-${term.id}`}>Publish from</Label>
                        <Input
                          id={`from-${term.id}`}
                          type="datetime-local"
                          value={from}
                          onChange={(e) => setFrom(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`until-${term.id}`}>Publish until</Label>
                        <Input
                          id={`until-${term.id}`}
                          type="datetime-local"
                          value={until}
                          onChange={(e) => setUntil(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => save(term.id)}
                        disabled={busy || !from || !until}
                      >
                        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {existing ? 'Update window' : 'Publish'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingTermId(null)}
                        disabled={busy}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </Surface>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const icon =
    status === 'active' ? (
      <CheckCircle2 className="h-3 w-3 text-primary" />
    ) : status === 'scheduled' ? (
      <Clock className="h-3 w-3 text-muted-foreground" />
    ) : null;

  const color =
    status === 'active'
      ? 'border-primary/30 bg-primary/10 text-primary'
      : status === 'scheduled'
      ? 'border-border bg-card text-foreground'
      : status === 'expired'
      ? 'border-border bg-muted text-muted-foreground'
      : 'border-dashed border-border bg-card text-muted-foreground';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${color}`}
    >
      {icon}
      {statusLabel(status)}
    </span>
  );
}

import Link from 'next/link';
import { CheckCircle2, Clock, Share2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

type Term = { id: string; term_number: number; label: string };

type Publication = {
  id: string;
  term_id: string;
  publish_from: string;
  publish_until: string;
};

// Read-only publication indicator shown on the staff-side report card detail
// page. Unlike `PublishWindowPanel` (which is the full editor on the list
// page), this is just a one-line summary per term. Click-through to the list
// page for editing.
export async function PublicationStatus({
  sectionId,
  terms,
}: {
  sectionId: string;
  terms: Term[];
}) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('report_card_publications')
    .select('id, term_id, publish_from, publish_until')
    .eq('section_id', sectionId);
  const pubs = (data ?? []) as Publication[];

  // Server component runs per-request; current time is required to bucket
  // publications into active/scheduled/expired. Purity rule doesn't apply
  // here since there is no client-side re-render.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <Share2 className="h-4 w-4 text-primary" />
      <div className="flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Parent access
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {terms.map((t) => {
            const p = pubs.find((x) => x.term_id === t.id);
            if (!p) {
              return (
                <span key={t.id} className="text-muted-foreground">
                  {t.label}: not published
                </span>
              );
            }
            const from = new Date(p.publish_from).getTime();
            const until = new Date(p.publish_until).getTime();
            const active = now >= from && now <= until;
            const scheduled = now < from;
            return (
              <span key={t.id} className="inline-flex items-center gap-1">
                <span className="font-medium text-foreground">{t.label}:</span>
                {active && (
                  <>
                    <CheckCircle2 className="h-3 w-3 text-primary" />
                    <span className="text-primary">active</span>
                  </>
                )}
                {scheduled && (
                  <>
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">scheduled</span>
                  </>
                )}
                {!active && !scheduled && <span className="text-muted-foreground">expired</span>}
                <span className="text-muted-foreground tabular-nums">
                  ({new Date(p.publish_from).toLocaleDateString()} →{' '}
                  {new Date(p.publish_until).toLocaleDateString()})
                </span>
              </span>
            );
          })}
        </div>
      </div>
      <Link
        href="/report-cards"
        className="text-xs font-medium text-primary hover:underline"
      >
        Manage →
      </Link>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarRange, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { TermRow } from '@/lib/sis/ay-setup/queries';

type TermDraft = {
  id: string;
  term_number: number;
  label: string;
  start_date: string;  // '' when null
  end_date: string;
};

// "Term dates" dialog triggered from each AY row in /sis/ay-setup.
// Shows the 4 terms of that AY with start/end DatePicker pairs + per-row
// Save button. Autosaving on DatePicker change would be noisy (two picks
// per term), so we commit on the Save click.
export function TermDatesEditor({
  ayCode,
  ayLabel,
  terms,
  children,
}: {
  ayCode: string;
  ayLabel: string;
  terms: TermRow[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<TermDraft[]>(() => toDrafts(terms));
  const [savingId, setSavingId] = useState<string | null>(null);
  const [justSavedId, setJustSavedId] = useState<string | null>(null);

  // Re-seed drafts whenever the dialog opens so they reflect server state.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setDrafts(toDrafts(terms));
  }

  function updateDraft(id: string, patch: Partial<TermDraft>) {
    setDrafts((current) =>
      current.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    );
  }

  async function saveTerm(draft: TermDraft) {
    if (draft.start_date && draft.end_date && draft.start_date > draft.end_date) {
      toast.error(`${draft.label}: end date must be on or after start date`);
      return;
    }
    setSavingId(draft.id);
    try {
      const res = await fetch(`/api/sis/ay-setup/terms/${draft.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          startDate: draft.start_date || null,
          endDate: draft.end_date || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'save failed');
      setJustSavedId(draft.id);
      setTimeout(() => {
        setJustSavedId((id) => (id === draft.id ? null : id));
      }, 1500);
      router.refresh();
    } catch (e) {
      toast.error(`${draft.label}: ${e instanceof Error ? e.message : 'save failed'}`);
    } finally {
      setSavingId((s) => (s === draft.id ? null : s));
    }
  }

  const sorted = drafts.slice().sort((a, b) => a.term_number - b.term_number);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="size-5 text-primary" />
            Term dates — {ayCode}
          </DialogTitle>
          <DialogDescription>
            {ayLabel}. Setting dates here unblocks the Attendance module&apos;s school-calendar
            grid and the report-card publish windows for this AY.
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y divide-border rounded-xl border border-border">
          {sorted.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No terms configured for this AY yet. (Terms are inserted automatically by the
              AY creation wizard — if this row is empty, re-run the wizard.)
            </div>
          )}
          {sorted.map((draft) => {
            const original = terms.find((t) => t.id === draft.id);
            const dirty =
              (draft.start_date || '') !== (original?.start_date ?? '') ||
              (draft.end_date || '') !== (original?.end_date ?? '');
            const saving = savingId === draft.id;
            const justSaved = justSavedId === draft.id;

            return (
              <div key={draft.id} className="grid grid-cols-[72px_1fr_1fr_auto] items-center gap-3 px-4 py-3">
                <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {draft.label}
                </div>
                <div className="min-w-0">
                  <label className="mb-1 block font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Start
                  </label>
                  <DatePicker
                    value={draft.start_date}
                    onChange={(v) => updateDraft(draft.id, { start_date: v })}
                  />
                </div>
                <div className="min-w-0">
                  <label className="mb-1 block font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    End
                  </label>
                  <DatePicker
                    value={draft.end_date}
                    onChange={(v) => updateDraft(draft.id, { end_date: v })}
                  />
                </div>
                <div className="flex items-center gap-1.5 pt-5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving || !dirty}
                    onClick={() => saveTerm(draft)}
                  >
                    {saving ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : justSaved ? (
                      <CheckCircle2 className="size-3.5 text-primary" />
                    ) : (
                      'Save'
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toDrafts(terms: TermRow[]): TermDraft[] {
  return terms.map((t) => ({
    id: t.id,
    term_number: t.term_number,
    label: t.label,
    start_date: t.start_date ?? '',
    end_date: t.end_date ?? '',
  }));
}

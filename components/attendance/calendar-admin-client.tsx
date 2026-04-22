'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { CalendarX, Loader2, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SchoolCalendarRow, CalendarEventRow } from '@/lib/attendance/calendar';
import { CopyHolidaysDialog } from '@/components/attendance/copy-holidays-dialog';

type TermOption = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
};

type CopyHolidaysProps = {
  targetTermId: string;
  targetTermLabel: string;
  targetYear: number;
  sourceAyCode: string;
  sourceHolidays: SchoolCalendarRow[];
};

export function CalendarAdminClient({
  terms,
  termId,
  calendar,
  events,
  copyHolidaysProps,
}: {
  terms: TermOption[];
  termId: string;
  calendar: SchoolCalendarRow[];
  events: CalendarEventRow[];
  copyHolidaysProps?: CopyHolidaysProps | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const selectedTerm = terms.find((t) => t.id === termId) ?? terms[0];

  function switchTerm(next: string) {
    // Term-id is the only searchParam this page cares about, so we build the
    // URL directly instead of reading `useSearchParams()` — which would need
    // a Suspense boundary in Next 16.
    startTransition(() => {
      router.push(`${pathname}?term_id=${encodeURIComponent(next)}`);
    });
  }

  async function autofillWeekdays() {
    if (!selectedTerm) return;
    setBusy(true);
    try {
      const res = await fetch('/api/attendance/calendar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'autofill_weekdays', termId: selectedTerm.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'autofill failed');
      toast.success(
        `Seeded ${body.inserted ?? body.seeded ?? 0} school day${
          (body.inserted ?? body.seeded) === 1 ? '' : 's'
        } for ${selectedTerm.label}.`,
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'autofill failed');
    } finally {
      setBusy(false);
    }
  }

  async function toggleHoliday(date: string, nextIsHoliday: boolean, label: string | null) {
    setBusy(true);
    try {
      const res = await fetch('/api/attendance/calendar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          termId: selectedTerm?.id,
          entries: [{ date, isHoliday: nextIsHoliday, label }],
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'save failed');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'save failed');
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry(date: string) {
    if (!selectedTerm) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/attendance/calendar?termId=${encodeURIComponent(selectedTerm.id)}&date=${encodeURIComponent(date)}`,
        { method: 'DELETE' },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'delete failed');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'delete failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Term + action bar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="termSel">Term</Label>
          <Select value={termId} onValueChange={switchTerm} disabled={pending}>
            <SelectTrigger id="termSel" className="h-10 w-[260px]">
              <SelectValue placeholder="Pick a term" />
            </SelectTrigger>
            <SelectContent>
              {terms.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                  {t.isCurrent && (
                    <span className="ml-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                      current
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedTerm && (
          <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {selectedTerm.startDate} → {selectedTerm.endDate}
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {copyHolidaysProps && (
            <CopyHolidaysDialog
              targetTermId={copyHolidaysProps.targetTermId}
              targetTermLabel={copyHolidaysProps.targetTermLabel}
              targetYear={copyHolidaysProps.targetYear}
              sourceAyCode={copyHolidaysProps.sourceAyCode}
              sourceHolidays={copyHolidaysProps.sourceHolidays}
            />
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !selectedTerm}
            onClick={autofillWeekdays}
            className="gap-1.5"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            Seed weekdays
          </Button>
        </div>
      </div>

      {/* Calendar grid */}
      {selectedTerm && (
        <TermCalendarGrid
          term={selectedTerm}
          calendar={calendar}
          events={events}
          busy={busy}
          onToggleHoliday={toggleHoliday}
          onRemoveEntry={removeEntry}
        />
      )}

      {/* Events overlay section */}
      {selectedTerm && (
        <EventsPanel
          termId={selectedTerm.id}
          termStart={selectedTerm.startDate}
          termEnd={selectedTerm.endDate}
          events={events}
          busy={busy}
          onChanged={() => router.refresh()}
          setBusy={setBusy}
        />
      )}
    </div>
  );
}

function TermCalendarGrid({
  term,
  calendar,
  events,
  busy,
  onToggleHoliday,
  onRemoveEntry,
}: {
  term: TermOption;
  calendar: SchoolCalendarRow[];
  events: CalendarEventRow[];
  busy: boolean;
  onToggleHoliday: (date: string, nextIsHoliday: boolean, label: string | null) => Promise<void>;
  onRemoveEntry: (date: string) => Promise<void>;
}) {
  // Build a by-date index.
  const byDate = useMemo(() => {
    const map = new Map<string, SchoolCalendarRow>();
    for (const r of calendar) map.set(r.date, r);
    return map;
  }, [calendar]);

  const eventLabelFor = useMemo(() => {
    return (iso: string): string | null => {
      const hits = events.filter((e) => iso >= e.startDate && iso <= e.endDate);
      return hits.length === 0 ? null : hits.map((e) => e.label).join(' · ');
    };
  }, [events]);

  // Build month-grouped cell rows from term start → end.
  const dates: string[] = useMemo(() => {
    const parse = (iso: string) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
      if (!m) throw new Error(`bad iso: ${iso}`);
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    };
    const fmt = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    const out: string[] = [];
    const d = parse(term.startDate);
    const end = parse(term.endDate);
    while (d.getTime() <= end.getTime()) {
      out.push(fmt(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [term.startDate, term.endDate]);

  const byMonth = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const iso of dates) {
      const key = iso.slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(iso);
    }
    return Array.from(map.entries()).sort(([a], [b]) => (a < b ? -1 : 1));
  }, [dates]);

  return (
    <div className="space-y-5">
      {byMonth.map(([month, monthDates]) => {
        const [y, m] = month.split('-');
        const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-SG', {
          month: 'long',
          year: 'numeric',
        });
        return (
          <div key={month} className="space-y-2">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {label}
            </div>
            <div className="grid grid-cols-7 gap-1 md:grid-cols-10 lg:grid-cols-14">
              {monthDates.map((iso) => {
                const d = new Date(
                  Number(iso.slice(0, 4)),
                  Number(iso.slice(5, 7)) - 1,
                  Number(iso.slice(8, 10)),
                );
                const dow = d.getDay();
                const isWeekend = dow === 0 || dow === 6;
                const entry = byDate.get(iso);
                const eventLabel = eventLabelFor(iso);

                const state: 'unset' | 'school' | 'holiday' = entry
                  ? entry.isHoliday
                    ? 'holiday'
                    : 'school'
                  : 'unset';

                return (
                  <DateCell
                    key={iso}
                    iso={iso}
                    weekday={dow}
                    weekend={isWeekend}
                    state={state}
                    holidayLabel={entry?.isHoliday ? entry.label : null}
                    eventLabel={eventLabel}
                    busy={busy}
                    onToggleHoliday={onToggleHoliday}
                    onRemoveEntry={onRemoveEntry}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DateCell({
  iso,
  weekend,
  state,
  holidayLabel,
  eventLabel,
  busy,
  onToggleHoliday,
  onRemoveEntry,
}: {
  iso: string;
  weekday: number;
  weekend: boolean;
  state: 'unset' | 'school' | 'holiday';
  holidayLabel: string | null;
  eventLabel: string | null;
  busy: boolean;
  onToggleHoliday: (date: string, nextIsHoliday: boolean, label: string | null) => Promise<void>;
  onRemoveEntry: (date: string) => Promise<void>;
}) {
  const [editingHoliday, setEditingHoliday] = useState(false);
  const [holidayInput, setHolidayInput] = useState(holidayLabel ?? '');

  const dayNum = iso.slice(-2);
  const baseClass =
    'relative flex min-h-[62px] flex-col rounded-md border p-1.5 text-left text-[10px] transition-colors';

  if (state === 'holiday') {
    return (
      <div
        className={
          baseClass +
          ' border-destructive/30 bg-destructive/10 text-destructive'
        }
      >
        <div className="flex items-start justify-between">
          <span className="font-mono text-[11px] font-semibold tabular-nums">{dayNum}</span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => onToggleHoliday(iso, false, null)}
              title="Mark as school day"
              className="rounded p-0.5 text-destructive/70 hover:bg-destructive/15 hover:text-destructive"
            >
              <RotateCcw className="size-3" />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onRemoveEntry(iso)}
              title="Remove entry"
              className="rounded p-0.5 text-destructive/70 hover:bg-destructive/15 hover:text-destructive"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        </div>
        <div className="mt-auto truncate font-medium" title={holidayLabel ?? ''}>
          {holidayLabel ?? 'Holiday'}
        </div>
      </div>
    );
  }

  if (state === 'school') {
    return (
      <div
        className={
          baseClass +
          ' border-emerald-500/30 bg-emerald-500/10 text-emerald-900 hover:bg-emerald-500/15 dark:text-emerald-200'
        }
      >
        <div className="flex items-start justify-between">
          <span className="font-mono text-[11px] font-semibold tabular-nums">{dayNum}</span>
          {editingHoliday ? null : (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditingHoliday(true)}
                title="Convert to holiday"
                className="rounded p-0.5 text-emerald-700/70 hover:bg-emerald-500/15 hover:text-emerald-700 dark:text-emerald-300"
              >
                <CalendarX className="size-3" />
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onRemoveEntry(iso)}
                title="Remove entry"
                className="rounded p-0.5 text-emerald-700/70 hover:bg-emerald-500/15 hover:text-emerald-700 dark:text-emerald-300"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          )}
        </div>
        {editingHoliday ? (
          <HolidayLabelInput
            value={holidayInput}
            onChange={setHolidayInput}
            onConfirm={async () => {
              await onToggleHoliday(iso, true, holidayInput.trim() || 'Holiday');
              setEditingHoliday(false);
            }}
            onCancel={() => setEditingHoliday(false)}
          />
        ) : (
          <div className="mt-auto font-medium">School day</div>
        )}
        {eventLabel && (
          <div
            className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.1em] opacity-70"
            title={eventLabel}
          >
            ★ {eventLabel}
          </div>
        )}
      </div>
    );
  }

  // unset
  return (
    <div
      className={
        baseClass +
        (weekend
          ? ' border-border/60 bg-muted/40 text-muted-foreground'
          : ' border-border bg-card text-foreground hover:border-primary/30')
      }
    >
      <div className="flex items-start justify-between">
        <span className="font-mono text-[11px] font-semibold tabular-nums">{dayNum}</span>
      </div>
      <div className="mt-auto flex gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => onToggleHoliday(iso, false, null)}
          className="flex-1 rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
        >
          School
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onToggleHoliday(iso, true, 'Holiday')}
          className="flex-1 rounded-sm border border-destructive/30 bg-destructive/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-destructive hover:bg-destructive/20"
        >
          Holiday
        </button>
      </div>
      {eventLabel && (
        <div
          className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.1em] opacity-70"
          title={eventLabel}
        >
          ★ {eventLabel}
        </div>
      )}
    </div>
  );
}

function HolidayLabelInput({
  value,
  onChange,
  onConfirm,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-auto flex flex-col gap-1">
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onConfirm();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="Reason…"
        className="w-full rounded-sm border border-border bg-background px-1 py-0.5 font-mono text-[9px] focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <div className="flex gap-1">
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 rounded-sm border border-destructive/30 bg-destructive/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-destructive hover:bg-destructive/20"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-sm border border-border bg-muted/40 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function EventsPanel({
  termId,
  termStart,
  termEnd,
  events,
  busy,
  onChanged,
  setBusy,
}: {
  termId: string;
  termStart: string;
  termEnd: string;
  events: CalendarEventRow[];
  busy: boolean;
  onChanged: () => void;
  setBusy: (v: boolean) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [start, setStart] = useState(termStart);
  const [end, setEnd] = useState(termEnd);
  const [label, setLabel] = useState('');

  async function create() {
    if (!label.trim()) {
      toast.error('Label is required');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/attendance/calendar/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ termId, startDate: start, endDate: end, label: label.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'create failed');
      toast.success('Event added');
      setLabel('');
      setAdding(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'create failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/attendance/calendar/events?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'delete failed');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'delete failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Informational events
          </div>
          <p className="text-[12px] text-muted-foreground">
            Overlay labels on the attendance grid. Does not affect whether a day is encodable.
          </p>
        </div>
        {!adding && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => setAdding(true)}
            className="gap-1.5"
          >
            <Plus className="size-3.5" />
            Add event
          </Button>
        )}
      </div>

      {adding && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-muted/30 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="evStart">Start</Label>
            <div className="w-[180px]">
              <DatePicker value={start} onChange={setStart} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="evEnd">End</Label>
            <div className="w-[180px]">
              <DatePicker value={end} onChange={setEnd} />
            </div>
          </div>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="evLabel">Label</Label>
            <Input
              id="evLabel"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Mathematics Week"
              className="h-10"
            />
          </div>
          <Button type="button" size="sm" disabled={busy} onClick={create}>
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setAdding(false);
              setLabel('');
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      {events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center text-[12px] text-muted-foreground">
          No events yet. Add one to label ranges like &ldquo;Math Week&rdquo; on the grid.
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {events.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="font-serif text-[14px] font-semibold text-foreground">
                  {e.label}
                </div>
                <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {e.startDate} → {e.endDate}
                </div>
              </div>
              <Badge variant="outline" className="font-mono text-[10px]">
                Label
              </Badge>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => remove(e.id)}
                className="gap-1"
              >
                <Trash2 className="size-3.5" />
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

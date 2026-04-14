import Link from 'next/link';
import { ArrowLeft, ArrowRight, History } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { PageShell } from '@/components/ui/page-shell';
import { PageHeader } from '@/components/ui/page-header';
import { Surface } from '@/components/ui/surface';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// Row shape after we merge the two sources. Both legacy grade_audit_log and
// the new generic audit_log flow through this same shape so the table
// renderer only has to switch on `action`.
type MergedRow = {
  id: string;
  at: string;                 // ISO timestamp
  actor: string;              // email
  action: string;
  entity_type: string;
  entity_id: string | null;
  context: Record<string, unknown>;
  sheet_id: string | null;    // for the "open sheet" link when applicable
  source: 'audit_log' | 'grade_audit_log';
};

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ sheet_id?: string; action?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  // Fetch both sources in parallel, then merge client-side.
  const [newRes, legacyRes] = await Promise.all([
    supabase
      .from('audit_log')
      .select('id, actor_email, action, entity_type, entity_id, context, created_at')
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('grade_audit_log')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(500),
  ]);

  const errors = [newRes.error?.message, legacyRes.error?.message].filter(Boolean);

  type NewRow = {
    id: string;
    actor_email: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    context: Record<string, unknown>;
    created_at: string;
  };
  type LegacyRow = {
    id: string;
    grading_sheet_id: string;
    grade_entry_id: string;
    field_changed: string;
    old_value: string | null;
    new_value: string | null;
    approval_reference: string | null;
    changed_by: string;
    changed_at: string;
  };

  const merged: MergedRow[] = [
    ...((newRes.data ?? []) as NewRow[]).map(
      (r): MergedRow => ({
        id: `new-${r.id}`,
        at: r.created_at,
        actor: r.actor_email,
        action: r.action,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        context: r.context ?? {},
        sheet_id:
          (r.context as Record<string, unknown> | null)?.['grading_sheet_id'] as
            | string
            | null
            | undefined ??
          (r.entity_type === 'grading_sheet' ? r.entity_id : null),
        source: 'audit_log',
      }),
    ),
    ...((legacyRes.data ?? []) as LegacyRow[]).map(
      (r): MergedRow => ({
        id: `legacy-${r.id}`,
        at: r.changed_at,
        actor: r.changed_by,
        action: r.field_changed.startsWith('ww_totals') || r.field_changed.startsWith('pt_totals') || r.field_changed === 'qa_total'
          ? 'totals.update'
          : 'entry.update',
        entity_type: r.field_changed.startsWith('ww_totals') || r.field_changed.startsWith('pt_totals') || r.field_changed === 'qa_total'
          ? 'grading_sheet'
          : 'grade_entry',
        entity_id: r.grade_entry_id,
        context: {
          field: r.field_changed,
          old: r.old_value,
          new: r.new_value,
          was_locked: true,
          approval_reference: r.approval_reference,
          grading_sheet_id: r.grading_sheet_id,
          legacy: true,
        },
        sheet_id: r.grading_sheet_id,
        source: 'grade_audit_log',
      }),
    ),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 500);

  const filtered = merged.filter((r) => {
    if (params.sheet_id && r.sheet_id !== params.sheet_id) return false;
    if (params.action && r.action !== params.action) return false;
    return true;
  });

  return (
    <PageShell>
      <Link
        href="/admin"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Admin
      </Link>

      <PageHeader
        eyebrow="Administration"
        title="Audit Log"
        description="Every mutating action — sheet creation, lock/unlock, score edits (pre- and post-lock), totals, student sync, assignments, attendance, comments, report card publications. Append-only."
      />

      {(params.sheet_id || params.action) && (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-4">
            <span className="flex flex-wrap items-center gap-2">
              Filtered:
              {params.sheet_id && (
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  sheet {params.sheet_id.slice(0, 8)}…
                </code>
              )}
              {params.action && (
                <code className="rounded bg-muted px-1 py-0.5 text-xs">{params.action}</code>
              )}
            </span>
            <Link
              href="/admin/audit-log"
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Clear
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>{errors.join(' · ')}</AlertDescription>
        </Alert>
      )}

      <Surface padded={false} className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-48">When</TableHead>
              <TableHead className="w-56">Who</TableHead>
              <TableHead className="w-32">Action</TableHead>
              <TableHead>Details</TableHead>
              <TableHead className="w-20 text-right">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <History className="h-6 w-6 opacity-50" />
                    No audit entries match the current filter.
                  </div>
                </TableCell>
              </TableRow>
            )}
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                  {new Date(r.at).toLocaleString()}
                </TableCell>
                <TableCell className="text-xs">{r.actor}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {r.action}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">
                  <ActionDetails row={r} />
                </TableCell>
                <TableCell className="text-right">
                  {r.sheet_id ? (
                    <Link
                      href={`/grading/${r.sheet_id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      sheet
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Surface>
    </PageShell>
  );
}

function ActionDetails({ row }: { row: MergedRow }) {
  const ctx = row.context;
  const str = (k: string): string | null => {
    const v = ctx[k];
    return v == null ? null : String(v);
  };

  switch (row.action) {
    case 'entry.update': {
      const field = str('field') ?? '—';
      const oldV = str('old') ?? '∅';
      const newV = str('new') ?? '∅';
      const locked = ctx['was_locked'] === true;
      const approval = str('approval_reference');
      return (
        <div className="space-y-0.5">
          <div className="font-mono">
            <span className="text-muted-foreground">{field}:</span>{' '}
            <span className="text-muted-foreground line-through">{oldV}</span>{' '}
            → <span className="font-semibold">{newV}</span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {locked ? 'post-lock' : 'pre-lock'}
            {approval ? ` · approval: ${approval}` : ''}
          </div>
        </div>
      );
    }
    case 'totals.update': {
      const field = str('field') ?? '—';
      const oldV = str('old') ?? '∅';
      const newV = str('new') ?? '∅';
      const locked = ctx['was_locked'] === true;
      const approval = str('approval_reference');
      return (
        <div className="space-y-0.5">
          <div className="font-mono">
            <span className="text-muted-foreground">{field}:</span>{' '}
            <span className="text-muted-foreground line-through">{oldV}</span>{' '}
            → <span className="font-semibold">{newV}</span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {locked ? 'post-lock' : 'pre-lock'}
            {approval ? ` · approval: ${approval}` : ''}
          </div>
        </div>
      );
    }
    case 'sheet.create': {
      return (
        <span>
          Created grading sheet{' '}
          <code className="rounded bg-muted px-1 text-[10px]">
            subject {str('subject_id')?.slice(0, 8)}…
          </code>{' '}
          for section{' '}
          <code className="rounded bg-muted px-1 text-[10px]">
            {str('section_id')?.slice(0, 8)}…
          </code>
          {' · seeded '}
          <span className="tabular-nums">{String(ctx['entries_seeded'] ?? 0)}</span>
          {' entries'}
        </span>
      );
    }
    case 'sheet.lock':
      return <span>Locked grading sheet {row.sheet_id?.slice(0, 8)}…</span>;
    case 'sheet.unlock':
      return <span>Unlocked grading sheet {row.sheet_id?.slice(0, 8)}…</span>;
    case 'student.sync': {
      const added = ctx['added'] ?? 0;
      const updated = ctx['updated'] ?? 0;
      const withdrawn = ctx['withdrawn'] ?? 0;
      const reactivated = ctx['reactivated'] ?? 0;
      const errs = ctx['errors'] ?? 0;
      return (
        <span className="tabular-nums">
          Synced admissions — added <b>{String(added)}</b>, updated <b>{String(updated)}</b>,
          withdrew <b>{String(withdrawn)}</b>, reactivated <b>{String(reactivated)}</b>
          {Number(errs) > 0 && (
            <span className="text-destructive"> · {String(errs)} errors</span>
          )}
        </span>
      );
    }
    case 'student.add': {
      return (
        <span>
          Manually added student{' '}
          <code className="rounded bg-muted px-1 text-[10px]">{str('student_number')}</code>
          {' ('}
          {str('first_name')} {str('last_name')}
          {') as #'}
          <span className="tabular-nums">{String(ctx['index_number'] ?? '')}</span>
        </span>
      );
    }
    case 'assignment.create':
      return (
        <span>
          Created <b>{str('role')}</b> assignment for teacher{' '}
          <code className="rounded bg-muted px-1 text-[10px]">
            {str('teacher_user_id')?.slice(0, 8)}…
          </code>{' '}
          on section{' '}
          <code className="rounded bg-muted px-1 text-[10px]">
            {str('section_id')?.slice(0, 8)}…
          </code>
          {ctx['subject_id'] ? (
            <>
              {' / subject '}
              <code className="rounded bg-muted px-1 text-[10px]">
                {String(ctx['subject_id']).slice(0, 8)}…
              </code>
            </>
          ) : null}
        </span>
      );
    case 'assignment.delete':
      return (
        <span>
          Removed <b>{str('role')}</b> assignment (teacher{' '}
          <code className="rounded bg-muted px-1 text-[10px]">
            {str('teacher_user_id')?.slice(0, 8)}…
          </code>
          )
        </span>
      );
    case 'attendance.update': {
      const after = ctx['after'] as Record<string, unknown> | undefined;
      return (
        <span className="tabular-nums">
          Attendance updated for enrolment{' '}
          <code className="rounded bg-muted px-1 text-[10px]">
            {str('section_student_id')?.slice(0, 8)}…
          </code>
          {after && (
            <>
              {' · school '}
              <b>{String(after['school_days'] ?? '—')}</b>
              {' · present '}
              <b>{String(after['days_present'] ?? '—')}</b>
              {' · late '}
              <b>{String(after['days_late'] ?? '—')}</b>
            </>
          )}
        </span>
      );
    }
    case 'comment.update':
      return (
        <span>
          Updated adviser comment for student{' '}
          <code className="rounded bg-muted px-1 text-[10px]">
            {str('student_id')?.slice(0, 8)}…
          </code>
        </span>
      );
    case 'publication.create':
      return (
        <span>
          Published report cards for section{' '}
          <code className="rounded bg-muted px-1 text-[10px]">
            {str('section_id')?.slice(0, 8)}…
          </code>
          {' · term '}
          <code className="rounded bg-muted px-1 text-[10px]">
            {str('term_id')?.slice(0, 8)}…
          </code>
          {' · window '}
          <span className="tabular-nums">
            {str('publish_from')?.slice(0, 10)} → {str('publish_until')?.slice(0, 10)}
          </span>
        </span>
      );
    case 'publication.delete':
      return (
        <span>
          Revoked report card publication for section{' '}
          <code className="rounded bg-muted px-1 text-[10px]">
            {str('section_id')?.slice(0, 8)}…
          </code>
        </span>
      );
    default:
      return <span className="text-muted-foreground">{JSON.stringify(ctx)}</span>;
  }
}

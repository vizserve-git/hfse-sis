import { NextResponse, type NextRequest } from 'next/server';

import { requireRole } from '@/lib/auth/require-role';
import { logAction } from '@/lib/audit/log-action';
import { createServiceClient } from '@/lib/supabase/service';
import { TermDatesSchema } from '@/lib/schemas/ay-setup';

// PATCH /api/sis/ay-setup/terms/[termId]
//
// Body: { startDate: string | null, endDate: string | null }
// Updates `terms.start_date` / `terms.end_date`. Either may be null (clear);
// if both set, cross-field refine on the schema enforces end >= start.
//
// Exists because `rpc('create_academic_year')` inserts 4 terms with NULL
// dates and `/attendance/calendar` needs them populated before the grid
// can render. Without this editor, new AYs require SQL to set term dates.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ termId: string }> },
) {
  const auth = await requireRole([
    'registrar',
    'school_admin',
    'admin',
    'superadmin',
  ]);
  if ('error' in auth) return auth.error;

  const { termId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = TermDatesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { startDate, endDate } = parsed.data;

  const service = createServiceClient();

  // Load before state for the audit diff.
  const { data: before, error: loadErr } = await service
    .from('terms')
    .select('id, academic_year_id, term_number, label, start_date, end_date')
    .eq('id', termId)
    .maybeSingle();
  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!before) {
    return NextResponse.json({ error: 'term not found' }, { status: 404 });
  }

  const { error: updateErr } = await service
    .from('terms')
    .update({ start_date: startDate, end_date: endDate })
    .eq('id', termId);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await logAction({
    service,
    actor: { id: auth.user.id, email: auth.user.email ?? null },
    action: 'ay.term_dates.update',
    entityType: 'term',
    entityId: termId,
    context: {
      academic_year_id: before.academic_year_id,
      term_number: before.term_number,
      label: before.label,
      before: {
        start_date: before.start_date ?? null,
        end_date: before.end_date ?? null,
      },
      after: { start_date: startDate, end_date: endDate },
    },
  });

  return NextResponse.json({ ok: true });
}

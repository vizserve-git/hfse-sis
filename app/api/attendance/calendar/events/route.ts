import { NextResponse, type NextRequest } from 'next/server';

import { requireRole } from '@/lib/auth/require-role';
import { logAction } from '@/lib/audit/log-action';
import { createServiceClient } from '@/lib/supabase/service';
import { CalendarEventCreateSchema } from '@/lib/schemas/attendance';

// POST /api/attendance/calendar/events
// Body: { termId, startDate, endDate, label }
// Creates a calendar_events row (informational overlay; doesn't block attendance).
export async function POST(request: NextRequest) {
  const auth = await requireRole(['registrar', 'school_admin', 'admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = CalendarEventCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { termId, startDate, endDate, label } = parsed.data;

  const service = createServiceClient();
  const { data, error } = await service
    .from('calendar_events')
    .insert({
      term_id: termId,
      start_date: startDate,
      end_date: endDate,
      label,
      created_by: auth.user.id,
    })
    .select('id')
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 });
  }

  await logAction({
    service,
    actor: { id: auth.user.id, email: auth.user.email ?? null },
    action: 'attendance.event.create',
    entityType: 'calendar_event',
    entityId: data.id,
    context: { termId, startDate, endDate, label },
  });

  return NextResponse.json({ ok: true, id: data.id });
}

// DELETE /api/attendance/calendar/events?id=...
export async function DELETE(request: NextRequest) {
  const auth = await requireRole(['registrar', 'school_admin', 'admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const service = createServiceClient();
  const { error } = await service.from('calendar_events').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAction({
    service,
    actor: { id: auth.user.id, email: auth.user.email ?? null },
    action: 'attendance.event.delete',
    entityType: 'calendar_event',
    entityId: id,
    context: {},
  });

  return NextResponse.json({ ok: true });
}

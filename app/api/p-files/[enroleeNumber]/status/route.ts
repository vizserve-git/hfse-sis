import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/require-role';
import { requireCurrentAyCode } from '@/lib/academic-year';
import { logAction } from '@/lib/audit/log-action';
import { createServiceClient } from '@/lib/supabase/service';
import { updateDocumentStatus } from '@/lib/p-files/mutations';
import { DOCUMENT_SLOTS } from '@/lib/p-files/document-config';

// PATCH /api/p-files/[enroleeNumber]/status
// Body: { slotKey: string, action: 'approve' | 'reject' }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ enroleeNumber: string }> },
) {
  const auth = await requireRole(['p-file', 'superadmin']);
  if ('error' in auth) return auth.error;

  const { enroleeNumber } = await params;

  const body = (await request.json().catch(() => null)) as
    | { slotKey?: string; action?: string }
    | null;

  if (!body?.slotKey || !body.action) {
    return NextResponse.json(
      { error: 'slotKey and action are required' },
      { status: 400 },
    );
  }

  const validSlot = DOCUMENT_SLOTS.some((s) => s.key === body.slotKey);
  if (!validSlot) {
    return NextResponse.json(
      { error: `invalid slotKey: ${body.slotKey}` },
      { status: 400 },
    );
  }

  if (body.action !== 'approve' && body.action !== 'reject') {
    return NextResponse.json(
      { error: 'action must be "approve" or "reject"' },
      { status: 400 },
    );
  }

  const service = createServiceClient();
  const ayCode = await requireCurrentAyCode(service);

  const newStatus = body.action === 'approve' ? 'Valid' : 'Rejected';
  const result = await updateDocumentStatus(ayCode, enroleeNumber, body.slotKey, newStatus);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // --- Audit log ---
  const slot = DOCUMENT_SLOTS.find((s) => s.key === body.slotKey);
  await logAction({
    service,
    actor: { id: auth.user.id, email: auth.user.email ?? null },
    action: body.action === 'approve' ? 'pfile.approve' : 'pfile.reject',
    entityType: 'enrolment_document',
    entityId: enroleeNumber,
    context: {
      slotKey: body.slotKey,
      label: slot?.label ?? body.slotKey,
      newStatus,
    },
  });

  return NextResponse.json({ ok: true, status: newStatus });
}

import { createServiceClient } from '@/lib/supabase/service';

function prefixFor(ayCode: string): string {
  return `ay${ayCode.replace(/^AY/i, '').toLowerCase()}`;
}

export async function updateDocumentStatus(
  ayCode: string,
  enroleeNumber: string,
  slotKey: string,
  newStatus: 'Valid' | 'Rejected',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const service = createServiceClient();
  const table = `${prefixFor(ayCode)}_enrolment_documents`;

  const { error } = await service
    .from(table)
    .update({ [`${slotKey}Status`]: newStatus })
    .eq('enroleeNumber', enroleeNumber);

  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

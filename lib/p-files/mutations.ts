import type { SupabaseClient } from '@supabase/supabase-js';

export type RevisionSnapshot = {
  ayCode: string;
  enroleeNumber: string;
  slotKey: string;
  archivedUrl: string;
  archivedPath: string;
  statusSnapshot: string | null;
  expirySnapshot: string | null;
  passportNumberSnapshot: string | null;
  passTypeSnapshot: string | null;
  note: string | null;
  replacedByUserId: string;
  replacedByEmail: string | null;
};

// Inserts one row into `p_file_revisions` capturing the pre-replacement
// snapshot when a P-Files document is replaced. Service-role client only.
export async function createRevision(
  service: SupabaseClient,
  snap: RevisionSnapshot,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await service
    .from('p_file_revisions')
    .insert({
      ay_code: snap.ayCode,
      enrolee_number: snap.enroleeNumber,
      slot_key: snap.slotKey,
      archived_url: snap.archivedUrl,
      archived_path: snap.archivedPath,
      status_snapshot: snap.statusSnapshot,
      expiry_snapshot: snap.expirySnapshot,
      passport_number_snapshot: snap.passportNumberSnapshot,
      pass_type_snapshot: snap.passTypeSnapshot,
      note: snap.note,
      replaced_by_user_id: snap.replacedByUserId,
      replaced_by_email: snap.replacedByEmail,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id as string };
}

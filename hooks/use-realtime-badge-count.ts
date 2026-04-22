import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Role } from '@/lib/auth/roles';

// Realtime pending-count badge for the Markbook sidebar.
//
// Sprint 14.3 fix: previously subscribed to ALL INSERT + UPDATE events on
// `grade_change_requests`, forcing a recount for every row change across the
// school regardless of whether the change was relevant to the viewing user.
// Now each role scopes its subscription with a `postgres_changes` filter so
// only the "count-up" events hit the wire. Count-down cases (registrar
// applies, admin approves) are triggered by the local user's own action —
// local state already reflects the change, no realtime event needed.
//
// Scoping per role:
//   - teacher:     requested_by = userId  (their own requests, any status change)
//   - registrar:   status = 'approved'    (catches admin approvals → count up)
//   - admin+:      status = 'pending'     (catches new requests → count up)
//
// Expected traffic reduction at HFSE scale: ~90% of events now filtered out
// at the server boundary instead of triggering a recount round-trip.

export function useRealtimeBadgeCount(
  role: Role,
  userId: string,
  initialCount: number,
): number {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  useEffect(() => {
    const supabase = createClient();

    async function recount() {
      let query = supabase
        .from('grade_change_requests')
        .select('id', { count: 'exact', head: true });

      if (role === 'teacher') {
        query = query.eq('requested_by', userId).eq('status', 'pending');
      } else if (role === 'registrar') {
        query = query.eq('status', 'approved');
      } else if (role === 'admin' || role === 'superadmin') {
        query = query.eq('status', 'pending');
      } else {
        return;
      }

      const { count: fresh } = await query;
      if (fresh != null) setCount(fresh);
    }

    // Per-role subscription filter. Supabase `postgres_changes` supports a
    // single-column filter per listener; for teachers we scope by
    // requested_by, for others by status.
    let filter: string | null = null;
    if (role === 'teacher') {
      filter = `requested_by=eq.${userId}`;
    } else if (role === 'registrar') {
      filter = `status=eq.approved`;
    } else if (role === 'admin' || role === 'superadmin') {
      filter = `status=eq.pending`;
    } else {
      // Other roles don't see this badge — skip subscription entirely.
      return;
    }

    const channel = supabase
      .channel('sidebar-badge-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'grade_change_requests', filter },
        () => recount(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'grade_change_requests', filter },
        () => recount(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [role, userId]);

  return count;
}

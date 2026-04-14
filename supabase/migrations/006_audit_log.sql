-- 006_audit_log.sql
--
-- Comprehensive audit log. Replaces the grade-specific `grade_audit_log`
-- (which only captured post-lock grade edits) as the destination for all
-- new audit writes from Sprint 6 onward. `grade_audit_log` itself is kept
-- intact as historical reference per Hard Rule #6 (append-only, never
-- updated/deleted). The audit-log page UI unions both tables.
--
-- Actions logged: sheet.create, sheet.lock, sheet.unlock, entry.update,
-- totals.update, student.sync, student.add, assignment.create,
-- assignment.delete, attendance.update, comment.update,
-- publication.create, publication.delete.
--
-- RLS: registrar+ read, deny all writes on authenticated (service-role
-- bypass writes via `lib/audit/log-action.ts`). Mirrors the 004 pattern.

create table if not exists public.audit_log (
  id              uuid primary key default gen_random_uuid(),
  actor_id        uuid,                                 -- auth.users.id, null for system actions
  actor_email     text not null,                         -- cached at write time for display
  action          text not null,
  entity_type     text not null,
  entity_id       uuid,                                  -- null for batch actions (student.sync)
  context         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
create index if not exists audit_log_entity_idx  on public.audit_log (entity_type, entity_id);
create index if not exists audit_log_action_idx  on public.audit_log (action);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_registrar_read on public.audit_log;
drop policy if exists audit_log_no_insert on public.audit_log;
drop policy if exists audit_log_no_update on public.audit_log;
drop policy if exists audit_log_no_delete on public.audit_log;

create policy audit_log_registrar_read
  on public.audit_log for select
  to authenticated
  using (public.is_registrar_or_above());

create policy audit_log_no_insert
  on public.audit_log for insert
  to authenticated
  with check (false);

create policy audit_log_no_update
  on public.audit_log for update
  to authenticated
  using (false) with check (false);

create policy audit_log_no_delete
  on public.audit_log for delete
  to authenticated
  using (false);

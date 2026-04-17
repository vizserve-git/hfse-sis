-- 011_p_file_revisions.sql
--
-- P-Files revision history. When staff replace a document via the P-Files
-- upload pipeline, the previous file is moved to an archive path under
-- `parent-portal/<prefix>/<enroleeNumber>/<slotKey>/revisions/<iso>.<ext>`
-- and one row is inserted here capturing the pre-replacement snapshot.
--
-- Writers: service-role only (upload route). Readers: service-role only
-- (the GET /api/p-files/[enroleeNumber]/revisions route surfaces rows to
-- the History dialog). No authenticated-role access — P-Files follows the
-- same service-only pattern as the admissions-table reads.
--
-- Hard Rule #6 (append-only audit) applies: rows are never updated or
-- deleted. The `action='pfile.upload'` audit_log row continues to capture
-- the acting user; this table captures the archived artifact itself.

create table if not exists public.p_file_revisions (
  id                         uuid primary key default gen_random_uuid(),
  ay_code                    text not null,                         -- e.g. 'AY2526'
  enrolee_number             text not null,                         -- student key
  slot_key                   text not null,                         -- matches DOCUMENT_SLOTS keys
  archived_url               text not null,                         -- public URL of the archived file
  archived_path              text not null,                         -- path within the parent-portal bucket
  status_snapshot            text,                                  -- {slotKey}Status at archival time
  expiry_snapshot            date,                                  -- {slotKey}Expiry at archival time
  passport_number_snapshot   text,                                  -- meta snapshot (passport slots)
  pass_type_snapshot         text,                                  -- meta snapshot (pass slots)
  note                       text,                                  -- optional staff-entered reason
  replaced_by_user_id        uuid references auth.users(id),
  replaced_by_email          text,
  replaced_at                timestamptz not null default now()
);

create index if not exists p_file_revisions_slot_idx
  on public.p_file_revisions (ay_code, enrolee_number, slot_key, replaced_at desc);

alter table public.p_file_revisions enable row level security;

drop policy if exists p_file_revisions_no_select on public.p_file_revisions;
drop policy if exists p_file_revisions_no_insert on public.p_file_revisions;
drop policy if exists p_file_revisions_no_update on public.p_file_revisions;
drop policy if exists p_file_revisions_no_delete on public.p_file_revisions;

create policy p_file_revisions_no_select
  on public.p_file_revisions for select
  to authenticated
  using (false);

create policy p_file_revisions_no_insert
  on public.p_file_revisions for insert
  to authenticated
  with check (false);

create policy p_file_revisions_no_update
  on public.p_file_revisions for update
  to authenticated
  using (false) with check (false);

create policy p_file_revisions_no_delete
  on public.p_file_revisions for delete
  to authenticated
  using (false);

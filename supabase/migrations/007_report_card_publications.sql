-- 007_report_card_publications.sql
--
-- Per-section, per-term report card publication window. When the registrar
-- "publishes" a report card for (section, term) within a time window, any
-- parent whose child is enrolled in that section can view the report card
-- during `[publish_from, publish_until]`. Outside the window, the parent
-- view renders a "not currently available" state.
--
-- Parent identification: parents are Supabase Auth users in the shared
-- project with **no** `app_metadata.role` (absence of role = parent). The
-- parent→student link lives in the admissions tables
-- `ay{YY}_enrolment_applications` via `motherEmail` / `fatherEmail`; that
-- join happens at the application layer (server components call a
-- service-role admissions helper) because Postgres can't see those
-- tables' parent columns directly.
--
-- RLS: registrar+ full read. Parents (null-role authenticated users) get
-- loose SELECT on publications — the real gate is at the app layer where
-- the server component only fetches publications for sections whose
-- student IDs were first verified against the admissions email lookup.
-- Writes remain denied on `authenticated`; the app uses the service-role
-- client, same pattern as 004.

create table if not exists public.report_card_publications (
  id              uuid primary key default gen_random_uuid(),
  section_id      uuid not null references public.sections(id) on delete cascade,
  term_id         uuid not null references public.terms(id) on delete restrict,
  publish_from    timestamptz not null,
  publish_until   timestamptz not null,
  published_by    text not null,                              -- email of registrar who published
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (section_id, term_id),
  check (publish_until > publish_from)
);

create index if not exists report_card_publications_active_idx
  on public.report_card_publications (section_id, term_id, publish_from, publish_until);

alter table public.report_card_publications enable row level security;

drop policy if exists rcp_registrar_read on public.report_card_publications;
drop policy if exists rcp_parent_read on public.report_card_publications;
drop policy if exists rcp_no_insert on public.report_card_publications;
drop policy if exists rcp_no_update on public.report_card_publications;
drop policy if exists rcp_no_delete on public.report_card_publications;

create policy rcp_registrar_read
  on public.report_card_publications for select
  to authenticated
  using (public.is_registrar_or_above());

-- Parents (null-role authenticated users) can SELECT any publication row.
-- The server component layer filters on a verified (email→student→section)
-- chain before the row ever reaches the user, so broad SELECT is safe.
create policy rcp_parent_read
  on public.report_card_publications for select
  to authenticated
  using (public.current_user_role() is null);

create policy rcp_no_insert
  on public.report_card_publications for insert
  to authenticated
  with check (false);

create policy rcp_no_update
  on public.report_card_publications for update
  to authenticated
  using (false) with check (false);

create policy rcp_no_delete
  on public.report_card_publications for delete
  to authenticated
  using (false);

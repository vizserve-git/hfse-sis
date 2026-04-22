-- 014_attendance_daily.sql
--
-- Attendance module Phase 1 — raw daily ledger + rollup column extensions.
--
-- Until now attendance has been term-summary only: one `attendance_records`
-- row per student × term (`school_days`, `days_present`, `days_late`), entered
-- via the Markbook section grid and consumed by the report card. This
-- migration introduces the daily ledger `attendance_records` should roll up
-- from, per KD #47 (Attendance is the sole writer of daily attendance;
-- Markbook, Records, Parent are read-only consumers).
--
-- Contract frozen in docs/context/16-attendance-module.md:
-- - Status vocabulary: P / L / EX / A / NC (from T1_Attendance_Jan-Mar.xlsx)
-- - `period_id` reserved for Phase 2 (Scheduling module); Phase 1 writes NULL
-- - Write path is service-role only — consistent with the 004 deny-all-on-
--   authenticated pattern. The /api/attendance/* routes are the only callers.
-- - Read scoping mirrors `attendance_records` from 005: registrar+ OR form
--   adviser for the student's section. Subject teachers do NOT see daily
--   attendance — marking is the adviser's homeroom duty.
-- - Rollup (`days_excused`, `days_absent`, `attendance_pct`) columns are
--   additively extended on `attendance_records`; Markbook's existing reads
--   (`school_days`, `days_present`, `days_late`) are unchanged.
--
-- Apply after 013. Safe to re-run — DROP POLICY IF EXISTS is idempotent and
-- every DDL uses IF NOT EXISTS.

-- =====================================================================
-- attendance_daily — raw ledger (append-only)
-- =====================================================================
--
-- Corrections INSERT a new row and supersede the prior by `recorded_at desc`.
-- Reads filter to the latest per (section_student_id, date, period_id).
-- This preserves an in-table audit trail alongside `audit_log`, matching the
-- spirit of Hard Rule #6 (no UPDATE / DELETE on the ledger).

create table if not exists public.attendance_daily (
  id                  uuid primary key default gen_random_uuid(),
  section_student_id  uuid not null references public.section_students(id) on delete restrict,
  term_id             uuid not null references public.terms(id) on delete restrict,
  date                date not null,
  status              text not null check (status in ('P','L','EX','A','NC')),
  -- Phase 2 forward-compat hook. FK to `public.periods` deferred until the
  -- Scheduling module lands and the periods table exists; until then this is
  -- always NULL (whole-day status).
  period_id           uuid,
  recorded_by         uuid references auth.users(id),
  recorded_at         timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

comment on table public.attendance_daily is
  'Raw daily attendance ledger. Append-only: corrections write a new row; latest `recorded_at` per (section_student_id, date, period_id) wins. Source of truth for the `attendance_records` rollup.';

comment on column public.attendance_daily.status is
  'P = present, L = late (counts as present), EX = excused (MC / compassionate / school activity; counts as present), A = absent, NC = no class (holiday or not-yet-enrolled; excluded from school_days).';

comment on column public.attendance_daily.period_id is
  'Phase 1 always NULL (whole-day). Reserved for Phase 2 period-level attendance once the Scheduling module ships a `periods` table.';

-- Primary query index — daily grid on /attendance/[sectionId]?date=...
create index if not exists attendance_daily_term_section_date_idx
  on public.attendance_daily (term_id, section_student_id, date desc);

-- Per-student lookup — Records student-detail Attendance tab
create index if not exists attendance_daily_student_date_idx
  on public.attendance_daily (section_student_id, date desc, recorded_at desc);

-- Import / audit lookup
create index if not exists attendance_daily_recorded_at_idx
  on public.attendance_daily (recorded_at desc);

-- =====================================================================
-- RLS — deny writes on authenticated; scoped read registrar+ / adviser
-- =====================================================================

alter table public.attendance_daily enable row level security;

drop policy if exists attendance_daily_scoped_read on public.attendance_daily;
drop policy if exists attendance_daily_no_insert   on public.attendance_daily;
drop policy if exists attendance_daily_no_update   on public.attendance_daily;
drop policy if exists attendance_daily_no_delete   on public.attendance_daily;

-- Read scoping mirrors the `attendance_records` policy from 005.
create policy attendance_daily_scoped_read
  on public.attendance_daily for select
  to authenticated
  using (
    public.is_registrar_or_above()
    or exists (
      select 1
      from public.section_students ss
      where ss.id = attendance_daily.section_student_id
        and public.is_adviser_for_section(ss.section_id)
    )
  );

-- All writes go through /api/attendance/* using createServiceClient().
-- Defense-in-depth deny on the cookie-bound role, matching 004.
create policy attendance_daily_no_insert
  on public.attendance_daily for insert
  to authenticated
  with check (false);

create policy attendance_daily_no_update
  on public.attendance_daily for update
  to authenticated
  using (false) with check (false);

create policy attendance_daily_no_delete
  on public.attendance_daily for delete
  to authenticated
  using (false);

-- =====================================================================
-- attendance_records — extend rollup columns for Phase 1
-- =====================================================================
--
-- Markbook's existing reads (school_days, days_present, days_late) are
-- untouched. The Attendance module recomputes all six on every daily write
-- in the same transaction (see `lib/attendance/mutations.ts`).

alter table public.attendance_records
  add column if not exists days_excused   smallint not null default 0,
  add column if not exists days_absent    smallint not null default 0,
  add column if not exists attendance_pct numeric(5,2);

comment on column public.attendance_records.days_excused is
  'Count of EX daily entries in the term. Write-through from `attendance_daily`.';
comment on column public.attendance_records.days_absent is
  'Count of A daily entries in the term. Write-through from `attendance_daily`.';
comment on column public.attendance_records.attendance_pct is
  'round(days_present / school_days * 100, 2). NULL when school_days = 0.';

-- =====================================================================
-- recompute_attendance_rollup — single-student rollup recompute
-- =====================================================================
--
-- Called from /api/attendance/* after each daily-ledger write to keep
-- `attendance_records` in sync with the latest daily state.
--
-- Reads the latest row per (section_student_id, date, period_id) in the term
-- via DISTINCT ON + `recorded_at desc` (supersedes prior corrections), then
-- aggregates into the 6 rollup columns and UPSERTs `attendance_records`.
--
-- SECURITY DEFINER because /api/attendance/* calls this via service-role
-- anyway, but setting it explicit means future callers with a cookie JWT
-- (e.g. an RPC from a server action) don't need per-table GRANTs.
--
-- Idempotent: calling twice produces the same result. Safe for a nightly
-- reconciler job if one is ever added.

create or replace function public.recompute_attendance_rollup(
  p_term_id            uuid,
  p_section_student_id uuid
) returns table (
  school_days    int,
  days_present   int,
  days_late      int,
  days_excused   int,
  days_absent    int,
  attendance_pct numeric
) language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_school_days  int;
  v_present      int;
  v_late         int;
  v_excused      int;
  v_absent       int;
  v_pct          numeric(5,2);
begin
  -- Aggregate latest-per-day rows in this term for this student.
  with latest as (
    select distinct on (section_student_id, date, period_id)
      status
    from public.attendance_daily
    where term_id = p_term_id
      and section_student_id = p_section_student_id
    order by section_student_id, date, period_id, recorded_at desc
  )
  select
    count(*) filter (where status <> 'NC'),
    count(*) filter (where status in ('P','L','EX')),
    count(*) filter (where status = 'L'),
    count(*) filter (where status = 'EX'),
    count(*) filter (where status = 'A')
  into v_school_days, v_present, v_late, v_excused, v_absent
  from latest;

  v_pct := case
    when v_school_days > 0 then round((v_present::numeric / v_school_days) * 100, 2)
    else null
  end;

  insert into public.attendance_records (
    term_id, section_student_id,
    school_days, days_present, days_late, days_excused, days_absent,
    attendance_pct, updated_at
  ) values (
    p_term_id, p_section_student_id,
    v_school_days, v_present, v_late, v_excused, v_absent,
    v_pct, now()
  )
  on conflict (term_id, section_student_id) do update set
    school_days    = excluded.school_days,
    days_present   = excluded.days_present,
    days_late      = excluded.days_late,
    days_excused   = excluded.days_excused,
    days_absent    = excluded.days_absent,
    attendance_pct = excluded.attendance_pct,
    updated_at     = now();

  return query select v_school_days, v_present, v_late, v_excused, v_absent, v_pct;
end;
$$;

comment on function public.recompute_attendance_rollup(uuid, uuid) is
  'Recomputes `attendance_records` for one (term_id, section_student_id) from the latest daily-ledger rows. Idempotent. Called after every attendance_daily write.';

-- Grant execute to authenticated so server components + service-role can call
-- via Supabase `rpc()`. Writes still pass through the RLS deny-all on
-- `attendance_records` because the function runs SECURITY DEFINER.
grant execute on function public.recompute_attendance_rollup(uuid, uuid) to authenticated;

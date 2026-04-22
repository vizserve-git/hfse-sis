-- 015_attendance_calendar_and_metadata.sql
--
-- Attendance module Phase 1.1 — adopts HFSE's full attendance-sheet process.
-- Ships five schema additions in one migration because they land together on
-- the UI:
--
-- 1. `school_calendar`     — per-term list of school days vs holidays.
--                            Greys out holiday cells in the grid; without at
--                            least one row per term, grid falls back to
--                            "encodable everywhere" (legacy behaviour).
-- 2. `calendar_events`     — informational date-range labels (e.g. "Math
--                            Week Feb 2–6"). Overlaid on the grid headers;
--                            underlying days stay encodable.
-- 3. `section_students`    — adds `bus_no` and `classroom_officer_role`
--                            for the sheet-header display Joann uses.
-- 4. `students`            — adds `urgent_compassionate_allowance` (5 days
--                            per year quota) for the vacation-leave tracker.
-- 5. `attendance_daily`    — adds `ex_reason` (mc / compassionate /
--                            school_activity) so we can count only
--                            `compassionate` EX marks against the quota
--                            without losing the ability to record MC and
--                            school-activity leaves as EX.
--
-- RLS: all writes go through service-role API routes (matching 004 / 014).
-- Reads scoped to `current_user_role() is not null`.
--
-- Apply after 014. Safe to re-run — all DDL uses IF NOT EXISTS / DO blocks.

-- =====================================================================
-- 1. school_calendar
-- =====================================================================
--
-- One row per (term × date) that the registrar has classified. Dates not
-- in this table are implicitly "unclassified" — the grid does not render
-- them once the term has at least one row. The absence of any row for the
-- term means "legacy mode": render every date, no greyed-out holidays.
--
-- `is_holiday = true`: cell greyed out, API rejects writes. Label is the
--                      holiday reason ("CNY Day 1", "Staff Dev Day").
-- `is_holiday = false`: encodable school day. Label is usually null but
--                      the field exists so a registrar can annotate ("Half
--                      day: early dismissal").

create table if not exists public.school_calendar (
  id           uuid primary key default gen_random_uuid(),
  term_id      uuid not null references public.terms(id) on delete cascade,
  date         date not null,
  is_holiday   boolean not null default false,
  label        text,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id),
  unique (term_id, date)
);

create index if not exists school_calendar_term_date_idx
  on public.school_calendar (term_id, date);

comment on table public.school_calendar is
  'Per-term registry of school days (is_holiday=false) and holidays (is_holiday=true). Grid pre-renders only listed dates; empty → legacy mode (every date encodable).';
comment on column public.school_calendar.label is
  'Holiday reason ("CNY Day 1") when is_holiday=true; optional annotation for school days.';

alter table public.school_calendar enable row level security;

drop policy if exists school_calendar_role_read on public.school_calendar;
drop policy if exists school_calendar_no_insert on public.school_calendar;
drop policy if exists school_calendar_no_update on public.school_calendar;
drop policy if exists school_calendar_no_delete on public.school_calendar;

create policy school_calendar_role_read
  on public.school_calendar for select
  to authenticated
  using (public.current_user_role() is not null);

create policy school_calendar_no_insert
  on public.school_calendar for insert to authenticated with check (false);
create policy school_calendar_no_update
  on public.school_calendar for update to authenticated using (false) with check (false);
create policy school_calendar_no_delete
  on public.school_calendar for delete to authenticated using (false);

-- =====================================================================
-- 2. calendar_events
-- =====================================================================
--
-- Informational date-range labels ("Mathematics Week", "Assessment Week").
-- Do NOT gate attendance — the underlying school days remain encodable.
-- The grid overlays these as header decorations.

create table if not exists public.calendar_events (
  id           uuid primary key default gen_random_uuid(),
  term_id      uuid not null references public.terms(id) on delete cascade,
  start_date   date not null,
  end_date     date not null,
  label        text not null,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id),
  check (end_date >= start_date)
);

create index if not exists calendar_events_term_idx
  on public.calendar_events (term_id, start_date);

comment on table public.calendar_events is
  'Informational labels spanning one or more dates. Purely display; does not affect attendance-day encodability.';

alter table public.calendar_events enable row level security;

drop policy if exists calendar_events_role_read on public.calendar_events;
drop policy if exists calendar_events_no_insert on public.calendar_events;
drop policy if exists calendar_events_no_update on public.calendar_events;
drop policy if exists calendar_events_no_delete on public.calendar_events;

create policy calendar_events_role_read
  on public.calendar_events for select
  to authenticated
  using (public.current_user_role() is not null);

create policy calendar_events_no_insert
  on public.calendar_events for insert to authenticated with check (false);
create policy calendar_events_no_update
  on public.calendar_events for update to authenticated using (false) with check (false);
create policy calendar_events_no_delete
  on public.calendar_events for delete to authenticated using (false);

-- =====================================================================
-- 3. section_students: bus_no + classroom_officer_role
-- =====================================================================

alter table public.section_students
  add column if not exists bus_no                  text,
  add column if not exists classroom_officer_role  text;

comment on column public.section_students.bus_no is
  'School bus assignment — display only on attendance sheet header. Out of scope of report cards.';
comment on column public.section_students.classroom_officer_role is
  'Student role tag (e.g. "HAPI HAUS"). Display only.';

-- =====================================================================
-- 4. students: urgent/compassionate leave allowance
-- =====================================================================
--
-- Per-year quota (default 5 per HFSE policy). Days used are derived at read
-- time from `attendance_daily` where `status='EX' AND ex_reason='compassionate'`
-- within the student's current-AY enrolments — no stored counter (single
-- source of truth = ledger).

alter table public.students
  add column if not exists urgent_compassionate_allowance smallint not null default 5;

comment on column public.students.urgent_compassionate_allowance is
  'Annual quota for urgent / compassionate leave days. Default 5 per HFSE policy. Days used are derived from attendance_daily.ex_reason=''compassionate''.';

-- =====================================================================
-- 5. attendance_daily: ex_reason (subtype of EX)
-- =====================================================================
--
-- When `status='EX'`, the registrar / adviser can tag the reason. Null
-- is allowed and treated as generic/MC for counting purposes. Only
-- `compassionate` counts against `students.urgent_compassionate_allowance`.

alter table public.attendance_daily
  add column if not exists ex_reason text;

-- Add/replace the check constraint in an idempotent way.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'attendance_daily_ex_reason_chk'
      and conrelid = 'public.attendance_daily'::regclass
  ) then
    alter table public.attendance_daily drop constraint attendance_daily_ex_reason_chk;
  end if;
end $$;

alter table public.attendance_daily
  add constraint attendance_daily_ex_reason_chk
  check (
    ex_reason is null
    or ex_reason in ('mc', 'compassionate', 'school_activity')
  );

-- Also enforce that ex_reason is only set when status='EX'.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'attendance_daily_ex_reason_requires_ex_chk'
      and conrelid = 'public.attendance_daily'::regclass
  ) then
    alter table public.attendance_daily drop constraint attendance_daily_ex_reason_requires_ex_chk;
  end if;
end $$;

alter table public.attendance_daily
  add constraint attendance_daily_ex_reason_requires_ex_chk
  check (ex_reason is null or status = 'EX');

comment on column public.attendance_daily.ex_reason is
  'Optional EX subtype: mc | compassionate | school_activity. Only ''compassionate'' consumes the student''s urgent_compassionate_allowance quota.';

-- Partial index for the quota counter — only compassionate EX rows matter.
create index if not exists attendance_daily_compassionate_idx
  on public.attendance_daily (section_student_id, recorded_at desc)
  where ex_reason = 'compassionate';

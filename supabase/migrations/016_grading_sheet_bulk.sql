-- 016_grading_sheet_bulk.sql
--
-- Sprint 13 bite 2 — bulk grading-sheet creation.
--
-- Ceremony removed: "registrar manually clicks New Sheet 800 times per AY".
-- One RPC builds every (section × subject × term) sheet that should exist
-- given the AY's `subject_configs`. Idempotent — ON CONFLICT DO NOTHING on
-- the existing `(term_id, section_id, subject_id)` unique constraint.
--
-- Two variants:
--   create_grading_sheets_for_ay(p_ay_id uuid)      — for AY rollover
--   create_grading_sheets_for_section(p_section_id) — for mid-year section create
--
-- Sheet skeleton fields: subject_config_id (FK to the sizing config), is_locked
-- false, empty `ww_totals` / `pt_totals` arrays (sheets start empty and the
-- registrar fills totals on the grading page).
--
-- Apply after 015. Safe to re-run — `create or replace` + ON CONFLICT DO NOTHING.

create or replace function public.create_grading_sheets_for_ay(p_ay_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int;
begin
  with candidate as (
    select
      t.id        as term_id,
      s.id        as section_id,
      sc.subject_id as subject_id,
      sc.id       as subject_config_id
    from public.sections s
    join public.subject_configs sc
      on sc.academic_year_id = s.academic_year_id
     and sc.level_id = s.level_id
    join public.terms t
      on t.academic_year_id = s.academic_year_id
    where s.academic_year_id = p_ay_id
  ),
  ins as (
    insert into public.grading_sheets
      (term_id, section_id, subject_id, subject_config_id, is_locked)
    select term_id, section_id, subject_id, subject_config_id, false
    from candidate
    on conflict (term_id, section_id, subject_id) do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  return jsonb_build_object(
    'ay_id', p_ay_id,
    'inserted', coalesce(v_inserted, 0)
  );
end;
$$;

comment on function public.create_grading_sheets_for_ay(uuid) is
  'Idempotent bulk-create of (term × section × subject) grading sheets for every (section, subject_config) pair in the AY. Returns {ay_id, inserted}.';

grant execute on function public.create_grading_sheets_for_ay(uuid) to authenticated;

-- Single-section variant for mid-year section creation. Same body, narrowed
-- where clause.

create or replace function public.create_grading_sheets_for_section(p_section_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int;
begin
  with candidate as (
    select
      t.id        as term_id,
      s.id        as section_id,
      sc.subject_id as subject_id,
      sc.id       as subject_config_id
    from public.sections s
    join public.subject_configs sc
      on sc.academic_year_id = s.academic_year_id
     and sc.level_id = s.level_id
    join public.terms t
      on t.academic_year_id = s.academic_year_id
    where s.id = p_section_id
  ),
  ins as (
    insert into public.grading_sheets
      (term_id, section_id, subject_id, subject_config_id, is_locked)
    select term_id, section_id, subject_id, subject_config_id, false
    from candidate
    on conflict (term_id, section_id, subject_id) do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  return jsonb_build_object(
    'section_id', p_section_id,
    'inserted', coalesce(v_inserted, 0)
  );
end;
$$;

comment on function public.create_grading_sheets_for_section(uuid) is
  'Idempotent bulk-create for one section across every subject in its level × every term in its AY. Called after mid-year section create. Returns {section_id, inserted}.';

grant execute on function public.create_grading_sheets_for_section(uuid) to authenticated;

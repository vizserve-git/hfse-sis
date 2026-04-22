-- 017_teacher_assignments_copy.sql
--
-- Sprint 13 bite 5 — copy teacher assignments forward on AY rollover.
--
-- Ceremony removed: "retype every (user × section × subject × role) row on
-- every AY rollover." Most teachers stay on the same (section × subject)
-- year to year. This RPC copies each source-AY row to the equivalent row on
-- the target AY, mapping sections by `(level_id, name)` — which matches how
-- `create_academic_year` copies sections forward, so the lookup succeeds for
-- every retained section.
--
-- Safety:
--   * No deletes — never removes assignments from the target AY.
--   * Skips rows whose section has no target-AY equivalent (retired sections).
--   * Skips rows that would duplicate an existing target-AY assignment.
--   * Two unique constraints on the destination table are PARTIAL indexes
--     (role='subject_teacher' / role='form_adviser'), so ON CONFLICT can't
--     target them generically. We use explicit WHERE NOT EXISTS instead of
--     ON CONFLICT.
--
-- Returns: { copied, skipped_no_section, skipped_already_existed, source_total }

create or replace function public.copy_teacher_assignments(
  p_source_ay uuid,
  p_target_ay uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_total             int;
  v_skipped_no_section       int;
  v_skipped_already_existed  int;
  v_copied                   int;
begin
  if p_source_ay = p_target_ay then
    raise exception 'source and target AY must differ';
  end if;

  -- Total source rows, for reporting.
  select count(*) into v_source_total
  from public.teacher_assignments ta
  join public.sections s on s.id = ta.section_id
  where s.academic_year_id = p_source_ay;

  -- Candidate rows with their target-AY section mapped by (level_id, name).
  with source_rows as (
    select
      ta.teacher_user_id,
      ta.subject_id,
      ta.role,
      src_sec.id       as source_section_id,
      src_sec.level_id as level_id,
      src_sec.name     as section_name
    from public.teacher_assignments ta
    join public.sections src_sec on src_sec.id = ta.section_id
    where src_sec.academic_year_id = p_source_ay
  ),
  with_target as (
    select
      sr.teacher_user_id,
      sr.subject_id,
      sr.role,
      tgt_sec.id as target_section_id
    from source_rows sr
    left join public.sections tgt_sec
      on tgt_sec.academic_year_id = p_target_ay
     and tgt_sec.level_id = sr.level_id
     and tgt_sec.name = sr.section_name
  ),
  to_insert as (
    select wt.teacher_user_id, wt.target_section_id, wt.subject_id, wt.role
    from with_target wt
    where wt.target_section_id is not null
      -- subject_teacher: skip if (user, section, subject) already exists
      and not exists (
        select 1 from public.teacher_assignments existing
        where existing.role = 'subject_teacher'
          and wt.role = 'subject_teacher'
          and existing.teacher_user_id = wt.teacher_user_id
          and existing.section_id = wt.target_section_id
          and existing.subject_id = wt.subject_id
      )
      -- form_adviser: skip if target section already has ANY form adviser
      and not exists (
        select 1 from public.teacher_assignments existing
        where existing.role = 'form_adviser'
          and wt.role = 'form_adviser'
          and existing.section_id = wt.target_section_id
      )
  ),
  ins as (
    insert into public.teacher_assignments
      (teacher_user_id, section_id, subject_id, role)
    select teacher_user_id, target_section_id, subject_id, role
    from to_insert
    returning 1
  )
  select count(*) into v_copied from ins;

  -- Skipped stats for the audit trail.
  select count(*) into v_skipped_no_section
  from (
    select 1
    from public.teacher_assignments ta
    join public.sections src_sec on src_sec.id = ta.section_id
    left join public.sections tgt_sec
      on tgt_sec.academic_year_id = p_target_ay
     and tgt_sec.level_id = src_sec.level_id
     and tgt_sec.name = src_sec.name
    where src_sec.academic_year_id = p_source_ay
      and tgt_sec.id is null
  ) x;

  v_skipped_already_existed :=
    greatest(coalesce(v_source_total, 0) - coalesce(v_copied, 0) - coalesce(v_skipped_no_section, 0), 0);

  return jsonb_build_object(
    'source_total', coalesce(v_source_total, 0),
    'copied', coalesce(v_copied, 0),
    'skipped_no_section', coalesce(v_skipped_no_section, 0),
    'skipped_already_existed', coalesce(v_skipped_already_existed, 0)
  );
end;
$$;

comment on function public.copy_teacher_assignments(uuid, uuid) is
  'Copy teacher_assignments from source AY to target AY, mapping sections by (level_id, name). Idempotent via NOT EXISTS checks; never deletes.';

grant execute on function public.copy_teacher_assignments(uuid, uuid) to authenticated;

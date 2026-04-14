-- 008_publication_notified_at.sql
--
-- Tracks when parents were emailed about a given publication window, so the
-- POST route on /api/report-card-publications can stay idempotent: if we've
-- already sent notifications for this (section, term) row, re-saving the
-- window (e.g. extending publish_until) won't re-spam parents. Resetting
-- this column to NULL (e.g. manually via SQL) will cause the next POST to
-- send again.

alter table public.report_card_publications
  add column if not exists notified_at timestamptz;

comment on column public.report_card_publications.notified_at is
  'Timestamp of the last parent-notification email batch for this row. NULL = never notified; set it to NULL to force a re-send on the next upsert.';

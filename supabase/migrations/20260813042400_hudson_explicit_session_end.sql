alter table public.hudson_session_starts
  drop constraint hudson_session_starts_status_check;

alter table public.hudson_session_starts
  add constraint hudson_session_starts_status_check
  check (status in ('reserved', 'ready', 'ending', 'ended', 'failed'));

alter table public.hudson_session_starts
  add column ended_at timestamptz,
  add column end_reason text;

alter table public.hudson_session_starts
  drop constraint hudson_session_starts_ready_conversation_check;

alter table public.hudson_session_starts
  add constraint hudson_session_starts_conversation_lifecycle_check check (
    (status in ('ready', 'ending', 'ended') and conversation_url is not null and conversation_id is not null)
    or (status in ('reserved', 'failed') and conversation_url is null and conversation_id is null)
  );

alter table public.hudson_session_starts
  add constraint hudson_session_starts_ended_at_check check (
    (status = 'ended' and ended_at is not null)
    or (status <> 'ended' and ended_at is null)
  );

comment on column public.hudson_session_starts.ended_at is
  'Server-recorded completion time after the governed Tavus end command succeeds.';

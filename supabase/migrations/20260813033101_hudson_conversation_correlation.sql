alter table public.hudson_session_starts
  add column conversation_id text;

alter table public.hudson_session_starts
  add constraint hudson_session_starts_conversation_id_key unique (conversation_id);

alter table public.hudson_session_starts
  drop constraint hudson_session_starts_ready_url_check;

alter table public.hudson_session_starts
  add constraint hudson_session_starts_ready_conversation_check check (
    (status = 'ready' and conversation_url is not null and conversation_id is not null)
    or (status <> 'ready' and conversation_url is null and conversation_id is null)
  );

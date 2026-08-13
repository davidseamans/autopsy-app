create table public.hudson_session_starts (
  request_id uuid primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null references public.autopsy_runs(id) on delete cascade,
  mode text not null check (mode in ('autopsy', 'first_5_jobs')),
  status text not null default 'reserved' check (status in ('reserved', 'ready', 'failed')),
  conversation_url text,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hudson_session_starts_ready_url_check check (
    (status = 'ready' and conversation_url is not null)
    or (status <> 'ready' and conversation_url is null)
  )
);

comment on table public.hudson_session_starts is
  'Server-only atomic idempotency authority for governed Hudson conversation starts.';

create index hudson_session_starts_owner_created_idx
  on public.hudson_session_starts (owner_user_id, created_at desc);
create index hudson_session_starts_run_created_idx
  on public.hudson_session_starts (run_id, created_at desc);

alter table public.hudson_session_starts enable row level security;
alter table public.hudson_session_starts force row level security;
revoke all on table public.hudson_session_starts from anon, authenticated;
grant select, insert, update, delete on table public.hudson_session_starts to service_role;

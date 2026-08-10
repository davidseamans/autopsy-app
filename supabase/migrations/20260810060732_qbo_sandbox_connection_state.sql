create table public.qbo_oauth_states (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index qbo_oauth_states_user_id_idx on public.qbo_oauth_states(user_id);
create index qbo_oauth_states_expires_at_idx on public.qbo_oauth_states(expires_at);

create table public.qbo_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  realm_id text not null unique check (realm_id ~ '^[0-9]{1,30}$'),
  environment text not null check (environment = 'sandbox'),
  scope text not null check (scope = 'com.intuit.quickbooks.accounting'),
  access_token_encrypted jsonb not null check (access_token_encrypted ->> 'algorithm' = 'aes-256-gcm'),
  refresh_token_encrypted jsonb not null check (refresh_token_encrypted ->> 'algorithm' = 'aes-256-gcm'),
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.qbo_oauth_states enable row level security;
alter table public.qbo_connections enable row level security;

revoke all on table public.qbo_oauth_states from anon, authenticated;
revoke all on table public.qbo_connections from anon, authenticated;
grant select, insert, update, delete on table public.qbo_oauth_states to service_role;
grant select, insert, update, delete on table public.qbo_connections to service_role;

comment on table public.qbo_oauth_states is
  'Single-use, short-lived hashed OAuth states for authenticated QBO sandbox connection starts.';
comment on table public.qbo_connections is
  'Tenant-bound QBO sandbox OAuth tokens encrypted by the server before persistence.';

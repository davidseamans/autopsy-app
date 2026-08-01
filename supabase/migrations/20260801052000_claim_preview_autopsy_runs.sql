-- Transfer a completed Flight Deck preview assessment to the candidate's
-- permanent account without weakening the owner-scoped Autopsy RLS boundary.

create table if not exists public.autopsy_preview_claims (
  id uuid primary key default gen_random_uuid(),
  preview_user_id uuid not null unique references auth.users(id) on delete restrict,
  claim_token_hash text not null unique check (claim_token_hash ~ '^[0-9a-f]{64}$'),
  run_id uuid unique references public.autopsy_runs(id) on delete restrict,
  expires_at timestamptz not null default (now() + interval '30 days'),
  claimed_by uuid references auth.users(id) on delete restrict,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint autopsy_preview_claims_claim_state check (
    (claimed_by is null and claimed_at is null)
    or (claimed_by is not null and claimed_at is not null and run_id is not null)
  )
);

create index if not exists autopsy_preview_claims_unclaimed_idx
  on public.autopsy_preview_claims(preview_user_id, expires_at)
  where claimed_at is null;

alter table public.autopsy_preview_claims enable row level security;
revoke all on public.autopsy_preview_claims from public, anon, authenticated;
grant select, insert, update on public.autopsy_preview_claims to service_role;

create or replace function public.claim_preview_autopsy_run(
  p_run_id uuid,
  p_claim_token_hash text,
  p_claimant_user_id uuid,
  p_claimant_email text
)
returns table (run_id uuid, owner_user_id uuid, claimed_at timestamptz)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_claim public.autopsy_preview_claims%rowtype;
  v_run public.autopsy_runs%rowtype;
  v_claimant auth.users%rowtype;
  v_claimed_at timestamptz := now();
begin
  select * into v_claimant
  from auth.users
  where id = p_claimant_user_id;

  if not found or coalesce((v_claimant.raw_app_meta_data ->> 'autopsy_preview')::boolean, false) then
    raise exception 'A permanent candidate account is required.' using errcode = '42501';
  end if;

  select * into v_claim
  from public.autopsy_preview_claims
  where claim_token_hash = lower(btrim(p_claim_token_hash))
    and claimed_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'This Autopsy recovery link is invalid or has expired.' using errcode = '42501';
  end if;

  select * into v_run
  from public.autopsy_runs
  where id = p_run_id
    and owner_user_id = v_claim.preview_user_id
  for update;

  if not found then
    raise exception 'This Autopsy run does not belong to the recovery link.' using errcode = '42501';
  end if;

  if v_run.status <> 'completed' then
    raise exception 'Complete the Autopsy before saving it to a permanent account.' using errcode = '55000';
  end if;

  update public.autopsy_runs
  set owner_user_id = p_claimant_user_id,
      tester_email = coalesce(nullif(lower(btrim(p_claimant_email)), ''), tester_email)
  where id = v_run.id;

  update public.autopsy_preview_claims
  set run_id = v_run.id,
      claimed_by = p_claimant_user_id,
      claimed_at = v_claimed_at
  where id = v_claim.id;

  return query select v_run.id, p_claimant_user_id, v_claimed_at;
end;
$$;

revoke all on function public.claim_preview_autopsy_run(uuid,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.claim_preview_autopsy_run(uuid,text,uuid,text)
  to service_role;

comment on table public.autopsy_preview_claims is
  'Server-only one-time ownership handoff from a Flight Deck preview identity to a permanent candidate account. Raw claim tokens are never stored.';
comment on function public.claim_preview_autopsy_run(uuid,text,uuid,text) is
  'Atomically claims one completed preview Autopsy run. Server service role only; token hash and preview owner must both match.';

-- Persist the short First 5 Jobs orientation independently of Business Details.
-- Orientation records understanding; verified Business Details remains the
-- commercial gate for quoting and transaction entry.

create table if not exists public.stage1_onboarding_progress (
  id uuid primary key default gen_random_uuid(),
  autopsy_run_id uuid not null references public.autopsy_runs(id) on delete cascade,
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  welcome_acknowledged boolean not null default false,
  abn_path text check (abn_path in ('already_have_abn', 'apply_for_abn')),
  business_name_path text check (business_name_path in ('own_legal_name', 'register_business_name')),
  operating_standards_acknowledged boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (autopsy_run_id)
);

comment on table public.stage1_onboarding_progress is
  'One privacy-safe First 5 Jobs orientation checklist per eligible Autopsy run. No TFN or government identity document is stored.';

alter table public.stage1_onboarding_progress enable row level security;
revoke all on public.stage1_onboarding_progress from anon, authenticated;
grant select, insert, update on public.stage1_onboarding_progress to authenticated;
grant all on public.stage1_onboarding_progress to service_role;

create policy stage1_onboarding_select_own
  on public.stage1_onboarding_progress for select to authenticated
  using (
    owner_user_id = (select auth.uid())
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  );

create policy stage1_onboarding_insert_own
  on public.stage1_onboarding_progress for insert to authenticated
  with check (
    owner_user_id = (select auth.uid())
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  );

create policy stage1_onboarding_update_own
  on public.stage1_onboarding_progress for update to authenticated
  using (
    owner_user_id = (select auth.uid())
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  )
  with check (
    owner_user_id = (select auth.uid())
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  );

create or replace function public.save_stage1_onboarding_progress(
  p_run_id uuid,
  p_welcome_acknowledged boolean,
  p_abn_path text,
  p_business_name_path text,
  p_operating_standards_acknowledged boolean
)
returns public.stage1_onboarding_progress
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_complete boolean;
  v_row public.stage1_onboarding_progress;
begin
  if v_user_id is null then raise exception 'A valid session is required.'; end if;
  if not public.current_user_can_use_stage1_run(p_run_id) then
    raise exception 'This Autopsy run is not cleared for First 5 Jobs.';
  end if;
  if p_abn_path not in ('already_have_abn', 'apply_for_abn') then
    raise exception 'Choose an ABN path.';
  end if;
  if p_business_name_path not in ('own_legal_name', 'register_business_name') then
    raise exception 'Choose a business-name path.';
  end if;

  v_complete := coalesce(p_welcome_acknowledged, false)
    and coalesce(p_operating_standards_acknowledged, false);

  insert into public.stage1_onboarding_progress (
    autopsy_run_id, owner_user_id, welcome_acknowledged, abn_path,
    business_name_path, operating_standards_acknowledged, completed_at, updated_at
  ) values (
    p_run_id, v_user_id, coalesce(p_welcome_acknowledged, false), p_abn_path,
    p_business_name_path, coalesce(p_operating_standards_acknowledged, false),
    case when v_complete then now() else null end, now()
  )
  on conflict (autopsy_run_id) do update set
    welcome_acknowledged = excluded.welcome_acknowledged,
    abn_path = excluded.abn_path,
    business_name_path = excluded.business_name_path,
    operating_standards_acknowledged = excluded.operating_standards_acknowledged,
    completed_at = excluded.completed_at,
    updated_at = now()
  where stage1_onboarding_progress.owner_user_id = v_user_id
  returning * into v_row;

  if v_row.id is null then raise exception 'Orientation progress could not be saved.'; end if;
  return v_row;
end;
$$;

revoke all on function public.save_stage1_onboarding_progress(uuid, boolean, text, text, boolean) from public, anon;
grant execute on function public.save_stage1_onboarding_progress(uuid, boolean, text, text, boolean) to authenticated, service_role;


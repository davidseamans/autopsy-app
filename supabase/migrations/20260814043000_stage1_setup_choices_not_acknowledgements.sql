-- Replace acknowledgement-based orientation completion with saved operational setup choices.
-- Hudson remains help/support; progression is not earned by ticking understanding boxes.

comment on table public.stage1_onboarding_progress is
  'Saved First 5 Jobs ABN and trading-name setup choices per eligible Autopsy run. Legacy acknowledgement columns are retained temporarily for compatibility and are not progression evidence.';

comment on column public.stage1_onboarding_progress.welcome_acknowledged is
  'Legacy compatibility field. No longer collected or used for progression.';
comment on column public.stage1_onboarding_progress.operating_standards_acknowledged is
  'Legacy compatibility field. No longer collected or used for progression.';
comment on column public.stage1_onboarding_progress.completed_at is
  'Timestamp when the required ABN and trading-name setup choices were saved.';

update public.stage1_onboarding_progress
set welcome_acknowledged = false,
    operating_standards_acknowledged = false
where welcome_acknowledged or operating_standards_acknowledged;

create or replace function public.save_stage1_setup_choices(
  p_run_id uuid,
  p_abn_path text,
  p_business_name_path text
)
returns public.stage1_onboarding_progress
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
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

  insert into public.stage1_onboarding_progress (
    autopsy_run_id, owner_user_id, welcome_acknowledged, abn_path,
    business_name_path, operating_standards_acknowledged, completed_at, updated_at
  ) values (
    p_run_id, v_user_id, false, p_abn_path,
    p_business_name_path, false, now(), now()
  )
  on conflict (autopsy_run_id) do update set
    welcome_acknowledged = false,
    abn_path = excluded.abn_path,
    business_name_path = excluded.business_name_path,
    operating_standards_acknowledged = false,
    completed_at = now(),
    updated_at = now()
  where stage1_onboarding_progress.owner_user_id = v_user_id
  returning * into v_row;

  if v_row.id is null then raise exception 'First 5 Jobs setup choices could not be saved.'; end if;
  return v_row;
end;
$$;

revoke all on function public.save_stage1_setup_choices(uuid, text, text) from public, anon;
grant execute on function public.save_stage1_setup_choices(uuid, text, text) to authenticated, service_role;

-- Keep the original RPC safe while older deployed clients still exist. Its
-- acknowledgement inputs are accepted for compatibility but deliberately ignored.
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
begin
  return public.save_stage1_setup_choices(p_run_id, p_abn_path, p_business_name_path);
end;
$$;

revoke all on function public.save_stage1_onboarding_progress(uuid, boolean, text, text, boolean) from public, anon;
grant execute on function public.save_stage1_onboarding_progress(uuid, boolean, text, text, boolean) to authenticated, service_role;

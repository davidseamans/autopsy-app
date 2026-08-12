create or replace function public.get_current_paid_autopsy_destination()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_uid uuid := auth.uid();
  v_run_id uuid;
begin
  if v_actor_uid is null then
    return jsonb_build_object('kind', 'blocked');
  end if;

  select e.autopsy_run_id into v_run_id
  from public.autopsy_entitlements e
  join public.autopsy_runs r on r.id = e.autopsy_run_id
  where e.user_id = v_actor_uid
    and e.status = 'consumed'
    and r.owner_user_id = v_actor_uid
    and r.status = 'in_progress'
  order by e.consumed_at desc nulls last
  limit 1;

  if v_run_id is not null then
    return jsonb_build_object('kind', 'assessment', 'run_id', v_run_id);
  end if;

  select e.autopsy_run_id into v_run_id
  from public.autopsy_entitlements e
  join public.autopsy_runs r on r.id = e.autopsy_run_id
  where e.user_id = v_actor_uid
    and e.status = 'consumed'
    and r.owner_user_id = v_actor_uid
    and r.status = 'completed'
  order by r.completed_at desc nulls last
  limit 1;

  if v_run_id is not null then
    return jsonb_build_object('kind', 'verdict', 'run_id', v_run_id);
  end if;

  if exists (
    select 1 from public.autopsy_entitlements e
    where e.user_id = v_actor_uid and e.status = 'active'
  ) then
    return jsonb_build_object('kind', 'assessment');
  end if;

  return jsonb_build_object('kind', 'blocked');
end;
$$;

revoke all on function public.get_current_paid_autopsy_destination()
  from public, anon;
grant execute on function public.get_current_paid_autopsy_destination()
  to authenticated, service_role;

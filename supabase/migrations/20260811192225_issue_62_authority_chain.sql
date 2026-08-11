-- Issue #62: close the entitlement retry seam without weakening the existing
-- payment, ownership or progression boundaries.

begin;

create unique index if not exists autopsy_entitlements_autopsy_run_id_key
  on public.autopsy_entitlements (autopsy_run_id)
  where autopsy_run_id is not null;

create or replace function public.create_authorized_autopsy_run(
  p_run_name text,
  p_industry text,
  p_scenario text default 'startup',
  p_tester_email text default null,
  p_operator_class text default 'unproven'
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_uid uuid := auth.uid();
  v_is_preview boolean := coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'autopsy_preview')::boolean, false
  );
  v_entitlement public.autopsy_entitlements%rowtype;
  v_context public.initial_conversations%rowtype;
  v_run_id uuid;
  v_variant_version text;
begin
  if v_actor_uid is null then
    raise exception 'Autopsy admission is not authorised.' using errcode = '42501';
  end if;

  if v_is_preview then
    select id into v_run_id
    from public.autopsy_runs
    where owner_user_id = v_actor_uid
      and status = 'in_progress'
      and created_at >= now() - interval '4 hours'
    order by created_at desc
    limit 1;
    if v_run_id is not null then
      return v_run_id;
    end if;
  else
    select e.* into v_entitlement
    from public.autopsy_entitlements e
    where e.user_id = v_actor_uid and e.status = 'active'
    order by e.granted_at asc
    for update skip locked
    limit 1;

    if not found then
      -- A response can be lost after the transaction commits. Return only the
      -- caller's still-in-progress run already bound to a consumed entitlement;
      -- completed historical runs never become reusable admission.
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
        return v_run_id;
      end if;
      raise exception 'No unused paid Autopsy admission is available.'
        using errcode = '42501';
    end if;

    select c.* into v_context
    from public.autopsy_orders o
    join public.initial_conversations c on c.id = o.conversation_id
    where o.id = v_entitlement.order_id and o.user_id = v_actor_uid;
  end if;

  select max(version) into v_variant_version
  from public.autopsy_dimension_conversation_variants where is_active = true;

  insert into public.autopsy_runs (
    run_name, industry, scenario, tester_email, operator_class, status,
    owner_user_id, business_stage, ownership_experience, industry_context,
    conversation_variant_version
  ) values (
    p_run_name,
    coalesce(nullif(v_context.industry_context, ''), p_industry),
    coalesce(p_scenario, 'startup'),
    p_tester_email,
    coalesce(p_operator_class, 'unproven'),
    'in_progress',
    v_actor_uid,
    coalesce(v_context.business_stage, 'startup'),
    v_context.ownership_experience,
    coalesce(nullif(v_context.industry_context, ''), p_industry),
    v_variant_version
  ) returning id into v_run_id;

  perform public.freeze_autopsy_questions(v_run_id);

  if not v_is_preview then
    update public.autopsy_entitlements
    set status = 'consumed', autopsy_run_id = v_run_id,
        consumed_at = now(), updated_at = now()
    where id = v_entitlement.id and status = 'active';
    if not found then
      raise exception 'Autopsy admission was consumed concurrently.'
        using errcode = '40001';
    end if;
  end if;

  return v_run_id;
end;
$$;

revoke all on function public.create_authorized_autopsy_run(text,text,text,text,text)
  from public, anon;
grant execute on function public.create_authorized_autopsy_run(text,text,text,text,text)
  to authenticated, service_role;

commit;

begin;

alter table public.initial_conversations
  add column if not exists candidate_first_name text null,
  add column if not exists broad_region text null,
  add column if not exists identity_carry_consent boolean null,
  add column if not exists identity_carry_consented_at timestamptz null;

alter table public.initial_conversations
  drop constraint if exists initial_conversations_candidate_first_name_check,
  add constraint initial_conversations_candidate_first_name_check
    check (candidate_first_name is null or (
      char_length(btrim(candidate_first_name)) between 1 and 80
      and candidate_first_name !~ '[,;]'
    )),
  drop constraint if exists initial_conversations_broad_region_check,
  add constraint initial_conversations_broad_region_check
    check (broad_region is null or char_length(btrim(broad_region)) between 1 and 120),
  drop constraint if exists initial_conversations_identity_consent_check,
  add constraint initial_conversations_identity_consent_check
    check (
      identity_carry_consent is null
      or identity_carry_consent = false
      or (candidate_first_name is not null and broad_region is not null)
    );

comment on column public.initial_conversations.candidate_first_name is
  'First name disclosed during the voluntary pre-assessment conversation. Continuity metadata only; never maturity evidence.';
comment on column public.initial_conversations.broad_region is
  'City or general area disclosed during the voluntary pre-assessment conversation. Exact addresses are prohibited.';
comment on column public.initial_conversations.identity_carry_consent is
  'Null until resolved; true permits first name and broad region to carry into Autopsy; false prohibits carry-over.';
comment on column public.initial_conversations.identity_carry_consented_at is
  'Time the candidate granted or declined continuity permission.';

alter table public.autopsy_runs
  add column if not exists candidate_first_name text null,
  add column if not exists broad_region text null,
  add column if not exists identity_context_consented_at timestamptz null;

alter table public.autopsy_runs
  drop constraint if exists autopsy_runs_candidate_first_name_check,
  add constraint autopsy_runs_candidate_first_name_check
    check (candidate_first_name is null or char_length(btrim(candidate_first_name)) between 1 and 80),
  drop constraint if exists autopsy_runs_broad_region_check,
  add constraint autopsy_runs_broad_region_check
    check (broad_region is null or char_length(btrim(broad_region)) between 1 and 120);

comment on column public.autopsy_runs.candidate_first_name is
  'Consented continuity metadata copied from the paid conversation; never assessment evidence.';
comment on column public.autopsy_runs.broad_region is
  'Consented broad location copied from the paid conversation; never assessment evidence.';

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
    if v_run_id is not null then return v_run_id; end if;
  else
    select e.autopsy_run_id into v_run_id
    from public.autopsy_entitlements e
    join public.autopsy_runs r on r.id = e.autopsy_run_id
    where e.user_id = v_actor_uid
      and e.status = 'consumed'
      and r.owner_user_id = v_actor_uid
      and r.status = 'in_progress'
    order by e.consumed_at desc nulls last
    limit 1;
    if v_run_id is not null then return v_run_id; end if;

    select e.* into v_entitlement
    from public.autopsy_entitlements e
    where e.user_id = v_actor_uid and e.status = 'active'
    order by e.granted_at asc
    for update skip locked
    limit 1;
    if not found then
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
    conversation_variant_version, candidate_first_name, broad_region,
    identity_context_consented_at
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
    v_variant_version,
    case when v_context.identity_carry_consent is true then v_context.candidate_first_name end,
    case when v_context.identity_carry_consent is true then v_context.broad_region end,
    case when v_context.identity_carry_consent is true then v_context.identity_carry_consented_at end
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

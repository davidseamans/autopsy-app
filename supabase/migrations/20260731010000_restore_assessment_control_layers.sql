-- Restore the authorised assessment boundary and reconnect the context,
-- ownership, privacy-safe interpretation and progression layers.
-- This migration is intentionally additive/idempotent because production
-- contains historical schema changes that are not fully represented in the
-- repository migration ledger.

begin;

create table if not exists public.initial_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'open'
    check (status in ('open', 'completed', 'converted', 'abandoned')),
  business_stage text null,
  ownership_experience text null,
  industry_context text null,
  is_assessment_context boolean not null default false
    check (is_assessment_context = false),
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.initial_conversation_turns (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.initial_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  turn_number integer not null check (turn_number > 0),
  speaker text not null check (speaker in ('candidate', 'john')),
  content text not null check (char_length(btrim(content)) > 0),
  is_canonical_evidence boolean not null default false
    check (is_canonical_evidence = false),
  created_at timestamptz not null default now(),
  unique (conversation_id, turn_number)
);

create table if not exists public.autopsy_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  conversation_id uuid not null references public.initial_conversations(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'checkout_created', 'paid', 'failed', 'expired', 'refunded')),
  currency text not null default 'aud' check (currency = 'aud'),
  amount_minor integer not null default 4900 check (amount_minor = 4900),
  stripe_checkout_session_id text null unique,
  stripe_payment_intent_id text null unique,
  paid_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id)
);

create table if not exists public.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  livemode boolean not null check (livemode = false),
  processed_at timestamptz not null default now()
);

create table if not exists public.autopsy_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  order_id uuid not null unique references public.autopsy_orders(id) on delete restrict,
  status text not null default 'active'
    check (status in ('active', 'consumed', 'revoked', 'refunded')),
  autopsy_run_id uuid null references public.autopsy_runs(id) on delete restrict,
  granted_at timestamptz not null default now(),
  consumed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.autopsy_answer_interpretations (
  run_id uuid not null references public.autopsy_runs(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  selected_option_id uuid not null references public.answer_options(id) on delete restrict,
  confidence numeric(4,3) null check (confidence between 0 and 1),
  fact_flags jsonb not null default '[]'::jsonb,
  prompt_version text not null,
  contract_version text not null,
  policy_gate_version text not null,
  reconciled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (run_id, question_id)
);

comment on table public.autopsy_answer_interpretations is
  'Privacy-safe assessment metadata only. Raw audio and candidate transcript are not stored here.';

create index if not exists initial_conversations_user_idx
  on public.initial_conversations(user_id, created_at desc);
create index if not exists initial_conversation_turns_conversation_idx
  on public.initial_conversation_turns(conversation_id, turn_number);
create index if not exists autopsy_orders_user_idx
  on public.autopsy_orders(user_id, created_at desc);
create index if not exists autopsy_entitlements_user_status_idx
  on public.autopsy_entitlements(user_id, status);

alter table public.initial_conversations enable row level security;
alter table public.initial_conversation_turns enable row level security;
alter table public.autopsy_orders enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.autopsy_entitlements enable row level security;
alter table public.autopsy_answer_interpretations enable row level security;

grant select, insert, update on public.initial_conversations to authenticated;
grant select, insert on public.initial_conversation_turns to authenticated;
grant select on public.autopsy_orders to authenticated;
grant select on public.autopsy_entitlements to authenticated;
grant select on public.autopsy_answer_interpretations to authenticated;
grant all on public.initial_conversations, public.initial_conversation_turns,
  public.autopsy_orders, public.stripe_webhook_events,
  public.autopsy_entitlements, public.autopsy_answer_interpretations to service_role;

drop policy if exists initial_conversations_select_own on public.initial_conversations;
create policy initial_conversations_select_own on public.initial_conversations
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists initial_conversations_insert_own on public.initial_conversations;
create policy initial_conversations_insert_own on public.initial_conversations
  for insert to authenticated
  with check ((select auth.uid()) = user_id and is_assessment_context = false);
drop policy if exists initial_conversations_update_own on public.initial_conversations;
create policy initial_conversations_update_own on public.initial_conversations
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and is_assessment_context = false);

drop policy if exists initial_conversation_turns_select_own on public.initial_conversation_turns;
create policy initial_conversation_turns_select_own on public.initial_conversation_turns
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists initial_conversation_turns_insert_own on public.initial_conversation_turns;
create policy initial_conversation_turns_insert_own on public.initial_conversation_turns
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and is_canonical_evidence = false
    and exists (
      select 1 from public.initial_conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );

drop policy if exists autopsy_orders_select_own on public.autopsy_orders;
create policy autopsy_orders_select_own on public.autopsy_orders
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists autopsy_entitlements_select_own on public.autopsy_entitlements;
create policy autopsy_entitlements_select_own on public.autopsy_entitlements
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists autopsy_answer_interpretations_select_own
  on public.autopsy_answer_interpretations;
create policy autopsy_answer_interpretations_select_own
  on public.autopsy_answer_interpretations for select to authenticated
  using (exists (
    select 1 from public.autopsy_runs r
    where r.id = run_id and r.owner_user_id = (select auth.uid())
  ));

create or replace function public.record_paid_autopsy_checkout(
  p_stripe_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_order_id uuid,
  p_user_id uuid,
  p_amount_minor integer,
  p_currency text
) returns table (order_id uuid, entitlement_id uuid, already_processed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.autopsy_orders%rowtype;
  v_entitlement_id uuid;
begin
  if p_livemode then raise exception 'Live Stripe events are not authorised'; end if;
  if p_amount_minor <> 4900 or lower(p_currency) <> 'aud' then
    raise exception 'Checkout amount or currency does not match the authorised Autopsy price';
  end if;
  insert into public.stripe_webhook_events (stripe_event_id, event_type, livemode)
  values (p_stripe_event_id, p_event_type, p_livemode)
  on conflict (stripe_event_id) do nothing;
  if not found then
    select e.id into v_entitlement_id from public.autopsy_entitlements e
    where e.order_id = p_order_id;
    return query select p_order_id, v_entitlement_id, true;
    return;
  end if;
  select * into v_order from public.autopsy_orders o
  where o.id = p_order_id and o.user_id = p_user_id
    and o.stripe_checkout_session_id = p_checkout_session_id
  for update;
  if not found then raise exception 'No matching Autopsy order'; end if;
  if v_order.amount_minor <> p_amount_minor
     or v_order.currency <> lower(p_currency) then
    raise exception 'Order amount or currency mismatch';
  end if;
  update public.autopsy_orders
  set status = 'paid', stripe_payment_intent_id = p_payment_intent_id,
      paid_at = coalesce(paid_at, now()), updated_at = now()
  where id = p_order_id;
  insert into public.autopsy_entitlements (user_id, order_id)
  values (p_user_id, p_order_id)
  on conflict (order_id) do update set updated_at = now()
  returning id into v_entitlement_id;
  update public.initial_conversations
  set status = 'converted', completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where id = v_order.conversation_id and user_id = p_user_id;
  return query select p_order_id, v_entitlement_id, false;
end;
$$;

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
    if exists (
      select 1 from public.autopsy_runs
      where owner_user_id = v_actor_uid and archived_at is null
    ) then
      raise exception 'This preview admission has already been used.'
        using errcode = '42501';
    end if;
  else
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
    where id = v_entitlement.id;
  end if;

  return v_run_id;
end;
$$;

create or replace function public.get_autopsy_gateway_payload(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owned_run public.autopsy_runs%rowtype;
  v_run jsonb;
  v_questions jsonb;
  v_dimension_scores jsonb;
begin
  select * into v_owned_run from public.autopsy_runs
  where id = p_run_id and owner_user_id = auth.uid();
  if not found then
    raise exception 'Autopsy run is not available.' using errcode = '42501';
  end if;
  v_run := to_jsonb(v_owned_run);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'run_question_id', rq.id,
      'question_id', q.id,
      'q_id', q.q_id,
      'position', rq.position,
      'dimension_code', q.dimension_code,
      'prompt', q.prompt,
      'conversation_prompt', coalesce(cv.conversational_prompt, q.prompt),
      'conversation_follow_up', cv.follow_up_text,
      'conversation_guardrail', cv.guardrail_text,
      'conversation_variant_version', cv.version,
      'is_hard_fail', q.is_hard_fail,
      'answered', a.id is not null,
      'selected_option', a.selected_option,
      'selected_score_value', a.score_value,
      'options', (
        select coalesce(jsonb_agg(to_jsonb(ao) order by ao.score_value asc), '[]'::jsonb)
        from public.answer_options ao
        where ao.question_id = q.id and ao.is_active = true
      )
    ) order by rq.position asc, rq.created_at asc
  ), '[]'::jsonb) into v_questions
  from public.run_questions rq
  join public.questions q on q.id = rq.question_id
  left join public.autopsy_answers a
    on a.run_id = rq.run_id and a.question_id = q.id
  left join lateral (
    select x.* from public.autopsy_dimension_conversation_variants x
    where x.question_id = q.id
      and x.stage_code = coalesce(v_owned_run.business_stage, 'startup')
      and x.is_active = true
      and (x.experience_code = v_owned_run.ownership_experience
        or x.experience_code is null)
    order by (x.experience_code = v_owned_run.ownership_experience) desc,
      x.updated_at desc
    limit 1
  ) cv on true
  where rq.run_id = p_run_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'dimension_code', x.dimension_code, 'score', x.score,
      'label', initcap(replace(x.dimension_code, '_', ' '))
    ) order by x.score asc, x.dimension_code asc
  ), '[]'::jsonb) into v_dimension_scores
  from (
    select q.dimension_code, coalesce(sum(a.score_value), 0)::int as score
    from public.questions q
    left join public.autopsy_answers a
      on a.question_id = q.id and a.run_id = p_run_id
    where q.is_active = true group by q.dimension_code
  ) x;

  return jsonb_build_object(
    'run', v_run, 'questions', v_questions,
    'dimension_scores', v_dimension_scores,
    'integrity', jsonb_build_object(
      'question_count', jsonb_array_length(v_questions),
      'answered_count', (select count(*) from public.autopsy_answers where run_id = p_run_id),
      'score_total_live', (select coalesce(sum(score_value),0)::int
        from public.autopsy_answers where run_id = p_run_id)
    )
  );
end;
$$;

create or replace function public.record_autopsy_answer(
  p_run_id uuid, p_question_id uuid, p_selected_option uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_score integer;
begin
  if not exists (
    select 1 from public.autopsy_runs
    where id = p_run_id and owner_user_id = auth.uid()
      and status = 'in_progress'
  ) then
    raise exception 'Autopsy run is not available for answers.'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.run_questions
    where run_id = p_run_id and question_id = p_question_id
  ) then
    raise exception 'Question is not part of this Autopsy run.'
      using errcode = '22023';
  end if;

  select score_value into v_score from public.answer_options
  where id = p_selected_option and question_id = p_question_id and is_active = true;
  if v_score is null then raise exception 'Invalid answer option for question'; end if;

  delete from public.autopsy_answers
  where run_id = p_run_id and question_id = p_question_id;
  insert into public.autopsy_answers
    (run_id, question_id, selected_option, score_value)
  values (p_run_id, p_question_id, p_selected_option, v_score);
  update public.run_questions set response_value = v_score, score_value = v_score
  where run_id = p_run_id and question_id = p_question_id;
end;
$$;

create or replace function public.record_autopsy_interpretation(
  p_run_id uuid,
  p_question_id uuid,
  p_selected_option uuid,
  p_confidence numeric,
  p_fact_flags jsonb,
  p_prompt_version text,
  p_contract_version text,
  p_policy_gate_version text,
  p_reconciled boolean default false
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.autopsy_runs
    where id = p_run_id and owner_user_id = auth.uid()
  ) then
    raise exception 'Autopsy run is not available.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.answer_options
    where id = p_selected_option and question_id = p_question_id
  ) then
    raise exception 'Interpretation does not match the governed question.'
      using errcode = '22023';
  end if;
  insert into public.autopsy_answer_interpretations (
    run_id, question_id, selected_option_id, confidence, fact_flags,
    prompt_version, contract_version, policy_gate_version, reconciled, updated_at
  ) values (
    p_run_id, p_question_id, p_selected_option,
    greatest(0, least(1, p_confidence)), coalesce(p_fact_flags, '[]'::jsonb),
    p_prompt_version, p_contract_version, p_policy_gate_version,
    p_reconciled, now()
  ) on conflict (run_id, question_id) do update set
    selected_option_id = excluded.selected_option_id,
    confidence = excluded.confidence,
    fact_flags = excluded.fact_flags,
    prompt_version = excluded.prompt_version,
    contract_version = excluded.contract_version,
    policy_gate_version = excluded.policy_gate_version,
    reconciled = excluded.reconciled,
    updated_at = now();
end;
$$;

-- Finalisation retains the existing governed scoring implementation and adds
-- only the missing ownership boundary.
create or replace function public.finalize_autopsy_run(p_run_id uuid)
returns public.autopsy_runs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.autopsy_runs;
  v_stage_progress_id uuid;
begin
  select * into v_run from public.autopsy_runs
  where id = p_run_id and owner_user_id = auth.uid();
  if not found then
    raise exception 'Autopsy run is not available.' using errcode = '42501';
  end if;
  if (select count(*) from public.autopsy_answers where run_id = p_run_id) <> 12 then
    raise exception 'All twelve governed subjects must be answered before finalisation.'
      using errcode = '23514';
  end if;

  if v_run.status not in ('completed', 'finalized') then
    select * into v_run from public.finalize_autopsy_run_internal(p_run_id);
    perform public.apply_hard_fail(p_run_id);
    update public.autopsy_runs set status = 'completed', completed_at = now()
    where id = p_run_id;
    select * into v_run from public.autopsy_runs where id = p_run_id;
  end if;

  if v_run.verdict_name = 'Ready for Test Run'
     and v_run.permission_level = 'granted'
     and coalesce(v_run.hard_fail_triggered, false) is false then
    select a.stage_progress_id into v_stage_progress_id
    from public.activate_stage1_from_autopsy_run(p_run_id) a limit 1;
    if v_stage_progress_id is null then
      raise exception 'Stage 1 activation did not return a linked stage progress row.'
        using errcode = '23502';
    end if;
  end if;
  return v_run;
end;
$$;

revoke all on function public.create_autopsy_run(text,text,text,text,text)
  from public, anon;
revoke all on function public.create_authorized_autopsy_run(text,text,text,text,text)
  from public, anon;
revoke all on function public.get_autopsy_gateway_payload(uuid)
  from public, anon;
revoke all on function public.record_autopsy_answer(uuid,uuid,uuid)
  from public, anon;
revoke all on function public.record_autopsy_interpretation(
  uuid,uuid,uuid,numeric,jsonb,text,text,text,boolean
) from public, anon;
revoke all on function public.finalize_autopsy_run(uuid)
  from public, anon;
revoke all on function public.record_paid_autopsy_checkout(
  text,text,boolean,text,text,uuid,uuid,integer,text
) from public, anon, authenticated;

grant execute on function public.create_authorized_autopsy_run(text,text,text,text,text)
  to authenticated, service_role;
grant execute on function public.get_autopsy_gateway_payload(uuid)
  to authenticated, service_role;
grant execute on function public.record_autopsy_answer(uuid,uuid,uuid)
  to authenticated, service_role;
grant execute on function public.record_autopsy_interpretation(
  uuid,uuid,uuid,numeric,jsonb,text,text,text,boolean
) to authenticated, service_role;
grant execute on function public.finalize_autopsy_run(uuid)
  to authenticated, service_role;
grant execute on function public.record_paid_autopsy_checkout(
  text,text,boolean,text,text,uuid,uuid,integer,text
) to service_role;

commit;

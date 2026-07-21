-- Autopsy $49 test-payment boundary
-- Canonical authority: davidseamans/autopsy-canonical#65
-- Implementation issue: davidseamans/autopsy-app#32
--
-- The free conversation is relationship context only. It is not an assessment
-- and its turns are not canonical maturity evidence. A paid entitlement opens
-- one explicitly authorised Autopsy assessment.

begin;

create table public.initial_conversations (
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

comment on table public.initial_conversations is
  'Non-assessment trust-building conversations before the paid Autopsy boundary.';

create table public.initial_conversation_turns (
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

create table public.autopsy_orders (
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

create table public.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  livemode boolean not null check (livemode = false),
  processed_at timestamptz not null default now()
);

create table public.autopsy_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  order_id uuid not null unique references public.autopsy_orders(id) on delete restrict,
  status text not null default 'active'
    check (status in ('active', 'consumed', 'revoked', 'refunded')),
  autopsy_run_id uuid null,
  granted_at timestamptz not null default now(),
  consumed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index initial_conversations_user_idx on public.initial_conversations(user_id, created_at desc);
create index initial_conversation_turns_conversation_idx on public.initial_conversation_turns(conversation_id, turn_number);
create index autopsy_orders_user_idx on public.autopsy_orders(user_id, created_at desc);
create index autopsy_entitlements_user_status_idx on public.autopsy_entitlements(user_id, status);

alter table public.initial_conversations enable row level security;
alter table public.initial_conversation_turns enable row level security;
alter table public.autopsy_orders enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.autopsy_entitlements enable row level security;

grant select, insert, update on public.initial_conversations to authenticated;
grant select, insert on public.initial_conversation_turns to authenticated;
grant select on public.autopsy_orders to authenticated;
grant select on public.autopsy_entitlements to authenticated;

grant all on public.initial_conversations to service_role;
grant all on public.initial_conversation_turns to service_role;
grant all on public.autopsy_orders to service_role;
grant all on public.stripe_webhook_events to service_role;
grant all on public.autopsy_entitlements to service_role;

create policy initial_conversations_select_own on public.initial_conversations
  for select to authenticated using (user_id = auth.uid());
create policy initial_conversations_insert_own on public.initial_conversations
  for insert to authenticated with check (user_id = auth.uid() and is_assessment_context = false);
create policy initial_conversations_update_own on public.initial_conversations
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and is_assessment_context = false);

create policy initial_conversation_turns_select_own on public.initial_conversation_turns
  for select to authenticated using (user_id = auth.uid());
create policy initial_conversation_turns_insert_own on public.initial_conversation_turns
  for insert to authenticated with check (
    user_id = auth.uid()
    and is_canonical_evidence = false
    and exists (
      select 1 from public.initial_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

create policy autopsy_orders_select_own on public.autopsy_orders
  for select to authenticated using (user_id = auth.uid());
create policy autopsy_entitlements_select_own on public.autopsy_entitlements
  for select to authenticated using (user_id = auth.uid());

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
  if p_livemode then
    raise exception 'Live Stripe events are not authorised';
  end if;
  if p_amount_minor <> 4900 or lower(p_currency) <> 'aud' then
    raise exception 'Checkout amount or currency does not match the authorised Autopsy price';
  end if;

  insert into public.stripe_webhook_events (stripe_event_id, event_type, livemode)
  values (p_stripe_event_id, p_event_type, p_livemode)
  on conflict (stripe_event_id) do nothing;

  if not found then
    select e.id into v_entitlement_id
    from public.autopsy_entitlements e where e.order_id = p_order_id;
    return query select p_order_id, v_entitlement_id, true;
    return;
  end if;

  select * into v_order
  from public.autopsy_orders o
  where o.id = p_order_id
    and o.user_id = p_user_id
    and o.stripe_checkout_session_id = p_checkout_session_id
  for update;

  if not found then
    raise exception 'No matching Autopsy order';
  end if;
  if v_order.amount_minor <> p_amount_minor or v_order.currency <> lower(p_currency) then
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
  set status = 'converted', completed_at = coalesce(completed_at, now()), updated_at = now()
  where id = v_order.conversation_id and user_id = p_user_id;

  return query select p_order_id, v_entitlement_id, false;
end;
$$;

revoke all on function public.record_paid_autopsy_checkout(text, text, boolean, text, text, uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.record_paid_autopsy_checkout(text, text, boolean, text, text, uuid, uuid, integer, text) to service_role;

commit;

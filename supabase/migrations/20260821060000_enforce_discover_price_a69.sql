-- Supersede the previous payment boundary without rewriting migration history.
-- Canonical authority: Discover is A$69 once for the complete six-week journey.
-- Historical paid orders remain valid records; every new or resumed unpaid order is A$69.

begin;

alter table public.autopsy_orders
  drop constraint if exists autopsy_orders_amount_minor_check;

update public.autopsy_orders
set amount_minor = 6900,
    updated_at = now()
where amount_minor <> 6900
  and status <> 'paid';

alter table public.autopsy_orders
  alter column amount_minor set default 6900;

alter table public.autopsy_orders
  add constraint autopsy_orders_amount_minor_check
  check (amount_minor = 6900) not valid;

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

  insert into public.stripe_webhook_events (stripe_event_id, event_type, livemode)
  values (p_stripe_event_id, p_event_type, p_livemode)
  on conflict (stripe_event_id) do nothing;

  if not found then
    select e.id into v_entitlement_id
    from public.autopsy_entitlements e
    where e.order_id = p_order_id;
    return query select p_order_id, v_entitlement_id, true;
    return;
  end if;

  if p_amount_minor <> 6900 or lower(p_currency) <> 'aud' then
    raise exception 'Checkout amount or currency does not match the authorised A$69 Discover price';
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

  if v_order.amount_minor <> p_amount_minor
     or v_order.currency <> lower(p_currency) then
    raise exception 'Order amount or currency mismatch';
  end if;

  update public.autopsy_orders
  set status = 'paid',
      stripe_payment_intent_id = p_payment_intent_id,
      paid_at = coalesce(paid_at, now()),
      updated_at = now()
  where id = p_order_id;

  insert into public.autopsy_entitlements (user_id, order_id)
  values (p_user_id, p_order_id)
  on conflict on constraint autopsy_entitlements_order_id_key
  do update set updated_at = now()
  returning id into v_entitlement_id;

  update public.initial_conversations
  set status = 'converted',
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where id = v_order.conversation_id
    and user_id = p_user_id;

  return query select p_order_id, v_entitlement_id, false;
end;
$$;

revoke all on function public.record_paid_autopsy_checkout(
  text, text, boolean, text, text, uuid, uuid, integer, text
) from public, anon, authenticated;

grant execute on function public.record_paid_autopsy_checkout(
  text, text, boolean, text, text, uuid, uuid, integer, text
) to service_role;

commit;

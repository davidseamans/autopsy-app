-- Preserve the First 5 Jobs funnel boundary:
-- anonymous prospecting is aggregate activity; named contacts enter at Potential Quote.

create or replace function public.create_stage1_guided_quote_from_contact(
  p_contact_id uuid,
  p_client_name text,
  p_client_contact_name text,
  p_client_email text,
  p_client_phone text,
  p_site_address text,
  p_service_description text,
  p_valid_until date,
  p_payment_terms text,
  p_clean_type_code text,
  p_items jsonb
)
returns table (quote_id uuid, quote_sequence_number bigint, total_inc_gst numeric)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_contact public.stage1_leads%rowtype;
  v_rule public.stage1_clean_type_pricing_rules%rowtype;
  v_item jsonb;
  v_total_hours numeric(12,2) := 0;
  v_labour_service_amount numeric(12,2) := 0;
  v_consumables_cost numeric(12,2);
  v_consumables_sell numeric(12,2);
  v_subtotal numeric(12,2);
  v_gst numeric(12,2);
  v_total numeric(12,2);
  v_quote_id uuid;
  v_quote_sequence bigint;
begin
  if v_user_id is null then raise exception 'A valid session is required.'; end if;

  select * into v_contact
  from public.stage1_leads
  where id = p_contact_id and created_by = v_user_id
  for update;

  if not found then raise exception 'Potential quote not found.'; end if;
  if not public.current_user_has_verified_business_identity()
    or not public.current_user_can_use_stage1_run(v_contact.autopsy_run_id) then
    raise exception 'First 5 Jobs access is not available.';
  end if;
  if v_contact.status not in ('new', 'potential') then
    raise exception 'This contact is not waiting for a quote.';
  end if;
  if btrim(coalesce(v_contact.contact_phone, '')) = ''
    and btrim(coalesce(v_contact.contact_email, '')) = '' then
    raise exception 'A phone number or email is required before preparing a quote.';
  end if;

  select * into v_rule
  from public.stage1_clean_type_pricing_rules
  where code = p_clean_type_code and active
  order by rule_version desc
  limit 1;

  if not found then raise exception 'Choose a valid type of clean.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    raise exception 'Add between 1 and 20 quote lines.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_total_hours := v_total_hours + coalesce((v_item->>'quantity')::numeric, 0);
    v_labour_service_amount := v_labour_service_amount
      + round(coalesce((v_item->>'quantity')::numeric, 0)
        * coalesce((v_item->>'unitPriceExGst')::numeric, 0), 2);
  end loop;
  if v_total_hours <= 0 then raise exception 'Estimated hours must be greater than zero.'; end if;

  select created.quote_id, created.quote_sequence_number
  into v_quote_id, v_quote_sequence
  from public.create_stage1_quote_from_lead(
    p_contact_id,
    coalesce(nullif(btrim(p_client_contact_name), ''), v_contact.contact_name),
    coalesce(nullif(btrim(p_client_email), ''), v_contact.contact_email),
    coalesce(nullif(btrim(p_client_phone), ''), v_contact.contact_phone),
    p_site_address, p_service_description, p_valid_until, p_payment_terms, p_items
  ) created;

  v_consumables_cost := greatest(
    v_rule.minimum_consumables_cost,
    round(v_total_hours * v_rule.consumables_cost_per_hour, 2)
  );
  v_consumables_sell := round(
    v_consumables_cost / (1 - (v_rule.target_consumables_margin_pct / 100)), 2
  );
  v_subtotal := v_labour_service_amount + v_consumables_sell;
  v_gst := round(v_subtotal * 0.10, 2);
  v_total := v_subtotal + v_gst;

  update public.stage1_quotes set
    client_name = coalesce(nullif(btrim(p_client_name), ''), v_contact.client_name),
    clean_type_code = v_rule.code,
    clean_type_label = v_rule.label,
    pricing_rule_version = v_rule.rule_version,
    labour_service_amount_ex_gst = v_labour_service_amount,
    estimated_consumables_cost = v_consumables_cost,
    consumables_sell_amount = v_consumables_sell,
    subtotal_ex_gst = v_subtotal,
    gst_amount = v_gst,
    total_inc_gst = v_total,
    amount = v_total
  where id = v_quote_id and created_by = v_user_id;

  update public.stage1_leads set
    client_name = coalesce(nullif(btrim(p_client_name), ''), client_name),
    estimated_value = v_total,
    updated_at = now()
  where id = p_contact_id and created_by = v_user_id;

  return query select v_quote_id, v_quote_sequence, v_total;
end;
$$;

revoke all on function public.create_stage1_guided_quote_from_contact(
  uuid,text,text,text,text,text,text,date,text,text,jsonb
) from public, anon, service_role;
grant execute on function public.create_stage1_guided_quote_from_contact(
  uuid,text,text,text,text,text,text,date,text,text,jsonb
) to authenticated;

comment on function public.create_stage1_guided_quote_from_contact(
  uuid,text,text,text,text,text,text,date,text,text,jsonb
) is 'Owner-bound transition from a lightweight Potential Quote contact to a written guided quote.';

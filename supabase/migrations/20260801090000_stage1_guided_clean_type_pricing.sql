-- Give the apprentice operator one guided pricing decision while retaining the
-- exact Stage 1 estimate used by the quote and the later job-cost comparison.
-- This reference data and document lineage are Stage 1 only; Core/QBO are untouched.

create table if not exists public.stage1_clean_type_pricing_rules (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  label text not null,
  guidance text not null,
  rule_version integer not null check (rule_version > 0),
  consumables_cost_per_hour numeric(12,2) not null check (consumables_cost_per_hour >= 0),
  minimum_consumables_cost numeric(12,2) not null check (minimum_consumables_cost >= 0),
  target_consumables_margin_pct numeric(5,2) not null
    check (target_consumables_margin_pct >= 0 and target_consumables_margin_pct < 100),
  display_order integer not null check (display_order > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (code, rule_version)
);

create unique index if not exists stage1_clean_type_one_active_rule
  on public.stage1_clean_type_pricing_rules(code)
  where active;

comment on table public.stage1_clean_type_pricing_rules is
  'Versioned Stage 1-only consumables assumptions for the guided First 5 Jobs quote.';

alter table public.stage1_clean_type_pricing_rules enable row level security;
revoke all on public.stage1_clean_type_pricing_rules from anon, authenticated;
grant select on public.stage1_clean_type_pricing_rules to authenticated;
grant all on public.stage1_clean_type_pricing_rules to service_role;

create policy stage1_clean_type_rules_authenticated_read
  on public.stage1_clean_type_pricing_rules for select to authenticated
  using (true);

insert into public.stage1_clean_type_pricing_rules (
  code, label, guidance, rule_version, consumables_cost_per_hour,
  minimum_consumables_cost, target_consumables_margin_pct, display_order, active
) values
  ('routine', 'Routine clean', 'Regular cleaning with ordinary consumables use.', 1, 1.50, 5.00, 30.00, 1, true),
  ('initial_heavy', 'Initial or heavy clean', 'A first, deep or heavier clean using more supplies.', 1, 3.00, 10.00, 30.00, 2, true),
  ('specialist', 'Specialist or high-consumable clean', 'Work expected to use specialist products or substantially more supplies.', 1, 5.00, 20.00, 30.00, 3, true)
on conflict (code, rule_version) do update set
  label = excluded.label,
  guidance = excluded.guidance,
  consumables_cost_per_hour = excluded.consumables_cost_per_hour,
  minimum_consumables_cost = excluded.minimum_consumables_cost,
  target_consumables_margin_pct = excluded.target_consumables_margin_pct,
  display_order = excluded.display_order,
  active = excluded.active;

alter table public.stage1_quotes
  add column if not exists clean_type_code text,
  add column if not exists clean_type_label text,
  add column if not exists pricing_rule_version integer,
  add column if not exists labour_service_amount_ex_gst numeric(12,2),
  add column if not exists estimated_consumables_cost numeric(12,2),
  add column if not exists consumables_sell_amount numeric(12,2);

comment on column public.stage1_quotes.estimated_consumables_cost is
  'Stage 1 consumables budget retained for later estimate-versus-actual job costing.';
comment on column public.stage1_quotes.consumables_sell_amount is
  'Customer-facing supplies allowance calculated from the snapshotted Stage 1 pricing rule.';

create or replace function public.create_stage1_guided_quote(
  p_run_id uuid,
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

  v_consumables_cost := greatest(
    v_rule.minimum_consumables_cost,
    round(v_total_hours * v_rule.consumables_cost_per_hour, 2)
  );
  v_consumables_sell := round(
    v_consumables_cost / (1 - (v_rule.target_consumables_margin_pct / 100)),
    2
  );

  select created.quote_id, created.quote_sequence_number
  into v_quote_id, v_quote_sequence
  from public.create_stage1_quote(
    p_run_id, p_client_name, p_client_contact_name, p_client_email,
    p_client_phone, p_site_address, p_service_description, p_valid_until,
    p_payment_terms, p_items
  ) created;

  v_subtotal := v_labour_service_amount + v_consumables_sell;
  v_gst := round(v_subtotal * 0.10, 2);
  v_total := v_subtotal + v_gst;

  update public.stage1_quotes set
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
  where id = v_quote_id;

  update public.stage1_leads lead set
    estimated_value = v_total,
    updated_at = now()
  from public.stage1_quotes quote
  where quote.id = v_quote_id and lead.id = quote.stage1_lead_id;

  return query select v_quote_id, v_quote_sequence, v_total;
end;
$$;

revoke all on function public.create_stage1_guided_quote(uuid,text,text,text,text,text,text,date,text,text,jsonb)
  from public, anon;
grant execute on function public.create_stage1_guided_quote(uuid,text,text,text,text,text,text,date,text,text,jsonb)
  to authenticated;

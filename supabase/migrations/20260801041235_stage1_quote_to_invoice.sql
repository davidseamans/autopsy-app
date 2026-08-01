-- Complete the Stage 1 commercial document chain without writing to Core:
-- verified business identity -> written quote -> accepted job -> tax invoice.

comment on column public.business_identity_profile.business_name is
  'Customer-facing business name. May be the owner name or a registered business name.';

alter table public.stage1_quotes
  add column if not exists client_contact_name text,
  add column if not exists client_email text,
  add column if not exists client_phone text,
  add column if not exists service_description text,
  add column if not exists valid_until date,
  add column if not exists payment_terms text,
  add column if not exists subtotal_ex_gst numeric(12,2) not null default 0,
  add column if not exists gst_amount numeric(12,2) not null default 0,
  add column if not exists total_inc_gst numeric(12,2) not null default 0;

create table if not exists public.stage1_quote_line_items (
  id uuid primary key default gen_random_uuid(),
  stage1_quote_id uuid not null references public.stage1_quotes(id) on delete cascade,
  line_position integer not null check (line_position > 0),
  description text not null check (btrim(description) <> ''),
  quantity numeric(12,2) not null check (quantity > 0),
  unit_price_ex_gst numeric(12,2) not null check (unit_price_ex_gst >= 0),
  line_total_ex_gst numeric(12,2) not null check (line_total_ex_gst >= 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (stage1_quote_id, line_position)
);

create index if not exists stage1_quote_line_items_quote_idx
  on public.stage1_quote_line_items(stage1_quote_id);
create index if not exists stage1_quote_line_items_created_by_idx
  on public.stage1_quote_line_items(created_by);

alter table public.stage1_quote_line_items enable row level security;
revoke all on public.stage1_quote_line_items from anon, authenticated;
grant select, insert on public.stage1_quote_line_items to authenticated;
grant all on public.stage1_quote_line_items to service_role;

create policy stage1_quote_line_items_select_own
  on public.stage1_quote_line_items for select to authenticated
  using (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.stage1_quotes quote
      where quote.id = stage1_quote_line_items.stage1_quote_id
        and quote.created_by = (select auth.uid())
    )
  );

create policy stage1_quote_line_items_verified_insert
  on public.stage1_quote_line_items for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.current_user_has_verified_business_identity()
    and exists (
      select 1 from public.stage1_quotes quote
      where quote.id = stage1_quote_line_items.stage1_quote_id
        and quote.created_by = (select auth.uid())
        and public.current_user_can_use_stage1_run(quote.autopsy_run_id)
    )
  );

create sequence if not exists public.stage1_invoice_sequence start with 1001;
grant usage, select on sequence public.stage1_invoice_sequence to authenticated, service_role;

alter table public.stage1_revenue_events
  add column if not exists source_quote_id uuid references public.stage1_quotes(id) on delete restrict,
  add column if not exists invoice_sequence_number bigint,
  add column if not exists invoice_status text,
  add column if not exists due_date date,
  add column if not exists issuer_business_name text,
  add column if not exists issuer_registered_name text,
  add column if not exists issuer_abn text,
  add column if not exists issuer_contact_name text,
  add column if not exists issuer_phone text,
  add column if not exists issuer_email text;

create unique index if not exists stage1_revenue_events_source_quote_invoice_key
  on public.stage1_revenue_events(source_quote_id)
  where source_quote_id is not null and revenue_type = 'invoice';
create unique index if not exists stage1_revenue_events_invoice_sequence_key
  on public.stage1_revenue_events(invoice_sequence_number)
  where invoice_sequence_number is not null;

create or replace function public.create_stage1_quote(
  p_run_id uuid,
  p_client_name text,
  p_client_contact_name text,
  p_client_email text,
  p_client_phone text,
  p_site_address text,
  p_service_description text,
  p_valid_until date,
  p_payment_terms text,
  p_items jsonb
)
returns table (quote_id uuid, quote_sequence_number bigint, total_inc_gst numeric)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_lead_id uuid;
  v_quote_id uuid;
  v_quote_sequence bigint;
  v_item jsonb;
  v_position integer := 0;
  v_description text;
  v_quantity numeric(12,2);
  v_unit_price numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_gst numeric(12,2);
  v_total numeric(12,2);
begin
  if v_user_id is null then raise exception 'A valid session is required.'; end if;
  if not public.current_user_has_verified_business_identity() then
    raise exception 'Verified Business Details are required.';
  end if;
  if not public.current_user_can_use_stage1_run(p_run_id) then
    raise exception 'This Autopsy run is not cleared for First 5 Jobs.';
  end if;
  if btrim(coalesce(p_client_name, '')) = ''
    or btrim(coalesce(p_site_address, '')) = ''
    or btrim(coalesce(p_service_description, '')) = '' then
    raise exception 'Client, service address and work description are required.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    raise exception 'Add between 1 and 20 quote lines.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_position := v_position + 1;
    v_description := btrim(coalesce(v_item->>'description', ''));
    v_quantity := coalesce((v_item->>'quantity')::numeric, 0);
    v_unit_price := coalesce((v_item->>'unitPriceExGst')::numeric, -1);
    if v_description = '' or v_quantity <= 0 or v_unit_price < 0 then
      raise exception 'Every quote line needs a description, positive quantity and valid price.';
    end if;
    v_subtotal := v_subtotal + round(v_quantity * v_unit_price, 2);
  end loop;

  v_gst := round(v_subtotal * 0.10, 2);
  v_total := v_subtotal + v_gst;

  insert into public.stage1_leads (
    autopsy_run_id, client_name, site_address, source, status,
    estimated_value, notes, created_by
  ) values (
    p_run_id, btrim(p_client_name), btrim(p_site_address), 'stage1_standard_quote', 'quoted',
    v_total, nullif(btrim(p_service_description), ''), v_user_id
  ) returning id into v_lead_id;

  insert into public.stage1_quotes (
    autopsy_run_id, stage1_lead_id, client_name, site_address, amount,
    status, issued_at, quote_notes, created_by, client_contact_name,
    client_email, client_phone, service_description, valid_until,
    payment_terms, subtotal_ex_gst, gst_amount, total_inc_gst
  ) values (
    p_run_id, v_lead_id, btrim(p_client_name), btrim(p_site_address), v_total,
    'sent', now(), nullif(btrim(p_service_description), ''), v_user_id,
    nullif(btrim(p_client_contact_name), ''), nullif(btrim(p_client_email), ''),
    nullif(btrim(p_client_phone), ''), btrim(p_service_description), p_valid_until,
    coalesce(nullif(btrim(p_payment_terms), ''), 'Payment due within 7 days of invoice.'),
    v_subtotal, v_gst, v_total
  ) returning id, stage1_quotes.quote_sequence_number into v_quote_id, v_quote_sequence;

  v_position := 0;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_position := v_position + 1;
    v_description := btrim(v_item->>'description');
    v_quantity := (v_item->>'quantity')::numeric;
    v_unit_price := (v_item->>'unitPriceExGst')::numeric;
    insert into public.stage1_quote_line_items (
      stage1_quote_id, line_position, description, quantity,
      unit_price_ex_gst, line_total_ex_gst, created_by
    ) values (
      v_quote_id, v_position, v_description, v_quantity,
      v_unit_price, round(v_quantity * v_unit_price, 2), v_user_id
    );
  end loop;

  return query select v_quote_id, v_quote_sequence, v_total;
end;
$$;

revoke all on function public.create_stage1_quote(uuid,text,text,text,text,text,text,date,text,jsonb) from public, anon;
grant execute on function public.create_stage1_quote(uuid,text,text,text,text,text,text,date,text,jsonb) to authenticated;

create or replace function public.accept_stage1_quote(p_quote_id uuid)
returns table (job_id uuid, job_sequence_number integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_quote public.stage1_quotes%rowtype;
  v_job public.stage1_jobs%rowtype;
begin
  select * into v_quote from public.stage1_quotes
  where id = p_quote_id and created_by = v_user_id for update;
  if not found then raise exception 'Quote not found.'; end if;
  if not public.current_user_has_verified_business_identity()
    or not public.current_user_can_use_stage1_run(v_quote.autopsy_run_id) then
    raise exception 'First 5 Jobs access is not available.';
  end if;
  if v_quote.stage1_job_id is not null then
    select * into v_job from public.stage1_jobs where id = v_quote.stage1_job_id;
    return query select v_job.id, v_job.job_sequence_number;
    return;
  end if;

  insert into public.stage1_jobs (
    autopsy_run_id, stage_progress_id, client_name, job_title,
    job_status, notes, created_by
  ) values (
    v_quote.autopsy_run_id, v_quote.stage_progress_id, v_quote.client_name,
    coalesce(v_quote.site_address, v_quote.client_name), 'draft',
    format('Created from Stage 1 quote Q-%s.', v_quote.quote_sequence_number), v_user_id
  ) returning * into v_job;

  update public.stage1_quotes set
    status = 'accepted', accepted_at = coalesce(accepted_at, now()),
    stage1_job_id = v_job.id, updated_at = now()
  where id = v_quote.id;

  return query select v_job.id, v_job.job_sequence_number;
end;
$$;

revoke all on function public.accept_stage1_quote(uuid) from public, anon;
grant execute on function public.accept_stage1_quote(uuid) to authenticated;

create or replace function public.create_stage1_invoice_from_quote(
  p_quote_id uuid,
  p_due_date date default (current_date + 7)
)
returns table (invoice_id uuid, invoice_sequence_number bigint, invoice_reference text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_quote public.stage1_quotes%rowtype;
  v_profile public.business_identity_profile%rowtype;
  v_existing public.stage1_revenue_events%rowtype;
  v_invoice_id uuid;
  v_invoice_sequence bigint;
  v_reference text;
begin
  select * into v_quote from public.stage1_quotes
  where id = p_quote_id and created_by = v_user_id for update;
  if not found then raise exception 'Quote not found.'; end if;
  if v_quote.status <> 'accepted' or v_quote.stage1_job_id is null then
    raise exception 'Accept the quote and create the job before invoicing.';
  end if;
  if not public.current_user_has_verified_business_identity()
    or not public.current_user_can_use_stage1_run(v_quote.autopsy_run_id) then
    raise exception 'First 5 Jobs access is not available.';
  end if;

  select * into v_existing from public.stage1_revenue_events
  where source_quote_id = v_quote.id and revenue_type = 'invoice';
  if found then
    return query select v_existing.id, v_existing.invoice_sequence_number, v_existing.reference;
    return;
  end if;

  select * into v_profile from public.business_identity_profile
  where owner_user_id = v_user_id;
  if not found then raise exception 'Verified Business Details are required.'; end if;

  v_invoice_sequence := nextval('public.stage1_invoice_sequence');
  v_reference := format('INV-%s', v_invoice_sequence);

  insert into public.stage1_revenue_events (
    stage1_job_id, amount, revenue_type, source, reference, created_by,
    event_date, description, approved_by_customer, document_reference,
    amount_inc_gst, gst_treatment, gst_amount, amount_ex_gst,
    source_quote_id, invoice_sequence_number, invoice_status, due_date,
    issuer_business_name, issuer_registered_name, issuer_abn,
    issuer_contact_name, issuer_phone, issuer_email
  ) values (
    v_quote.stage1_job_id, v_quote.subtotal_ex_gst, 'invoice',
    'stage1_quote_conversion', v_reference, v_user_id, current_date,
    coalesce(v_quote.service_description, 'Stage 1 client invoice'), true,
    v_reference, v_quote.total_inc_gst, 'gst_included', v_quote.gst_amount,
    v_quote.subtotal_ex_gst, v_quote.id, v_invoice_sequence, 'issued', p_due_date,
    v_profile.business_name, v_profile.abr_registered_name, v_profile.abn,
    v_profile.contact_name, v_profile.phone, v_profile.email
  ) returning id into v_invoice_id;

  return query select v_invoice_id, v_invoice_sequence, v_reference;
end;
$$;

revoke all on function public.create_stage1_invoice_from_quote(uuid,date) from public, anon;
grant execute on function public.create_stage1_invoice_from_quote(uuid,date) to authenticated;

create or replace function public.prevent_accepted_stage1_quote_rewrite()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'accepted' and (
    old.client_name is distinct from new.client_name
    or old.client_contact_name is distinct from new.client_contact_name
    or old.client_email is distinct from new.client_email
    or old.client_phone is distinct from new.client_phone
    or old.site_address is distinct from new.site_address
    or old.service_description is distinct from new.service_description
    or old.subtotal_ex_gst is distinct from new.subtotal_ex_gst
    or old.gst_amount is distinct from new.gst_amount
    or old.total_inc_gst is distinct from new.total_inc_gst
    or old.amount is distinct from new.amount
  ) then
    raise exception 'Accepted quote details are locked. Issue a replacement quote instead.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_accepted_stage1_quote_rewrite on public.stage1_quotes;
create trigger prevent_accepted_stage1_quote_rewrite
before update on public.stage1_quotes
for each row execute function public.prevent_accepted_stage1_quote_rewrite();

-- Make the Stage 1 commercial funnel explicit without writing to Core:
-- lead -> written quote -> accepted job.

alter table public.stage1_leads
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists next_action_at timestamptz;

alter table public.stage1_jobs
  add column if not exists source_stage1_lead_id uuid references public.stage1_leads(id) on delete restrict,
  add column if not exists source_stage1_quote_id uuid references public.stage1_quotes(id) on delete restrict;

create index if not exists stage1_leads_run_status_idx
  on public.stage1_leads(autopsy_run_id, status, created_at desc);
create index if not exists stage1_jobs_source_lead_idx
  on public.stage1_jobs(source_stage1_lead_id)
  where source_stage1_lead_id is not null;
create unique index if not exists stage1_jobs_source_quote_key
  on public.stage1_jobs(source_stage1_quote_id)
  where source_stage1_quote_id is not null;

update public.stage1_jobs job
set source_stage1_quote_id = quote.id,
    source_stage1_lead_id = quote.stage1_lead_id
from public.stage1_quotes quote
where quote.stage1_job_id = job.id
  and job.source_stage1_quote_id is null;

create or replace function public.create_stage1_lead(
  p_run_id uuid,
  p_client_name text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_site_address text,
  p_source text,
  p_estimated_value numeric,
  p_next_action_at timestamptz,
  p_notes text
)
returns table (lead_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_lead_id uuid;
begin
  if v_user_id is null then raise exception 'A valid session is required.'; end if;
  if not public.current_user_has_verified_business_identity() then
    raise exception 'Verified Business Details are required.';
  end if;
  if not public.current_user_can_use_stage1_run(p_run_id) then
    raise exception 'This Autopsy run is not cleared for First 5 Jobs.';
  end if;
  if btrim(coalesce(p_client_name, '')) = '' then
    raise exception 'A customer or prospect name is required.';
  end if;
  if coalesce(p_estimated_value, 0) < 0 then
    raise exception 'Estimated value cannot be negative.';
  end if;

  insert into public.stage1_leads (
    autopsy_run_id, client_name, contact_name, contact_email, contact_phone,
    site_address, source, status, estimated_value, next_action_at, notes, created_by
  ) values (
    p_run_id, btrim(p_client_name), nullif(btrim(p_contact_name), ''),
    nullif(btrim(p_contact_email), ''), nullif(btrim(p_contact_phone), ''),
    nullif(btrim(p_site_address), ''), coalesce(nullif(btrim(p_source), ''), 'Other'),
    'new', coalesce(p_estimated_value, 0), p_next_action_at,
    nullif(btrim(p_notes), ''), v_user_id
  ) returning id into v_lead_id;

  return query select v_lead_id;
end;
$$;

revoke all on function public.create_stage1_lead(uuid,text,text,text,text,text,text,numeric,timestamptz,text) from public, anon;
grant execute on function public.create_stage1_lead(uuid,text,text,text,text,text,text,numeric,timestamptz,text) to authenticated;

create or replace function public.create_stage1_quote_from_lead(
  p_lead_id uuid,
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
  v_lead public.stage1_leads%rowtype;
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
  select * into v_lead from public.stage1_leads
  where id = p_lead_id and created_by = v_user_id for update;
  if not found then raise exception 'Lead not found.'; end if;
  if not public.current_user_has_verified_business_identity()
    or not public.current_user_can_use_stage1_run(v_lead.autopsy_run_id) then
    raise exception 'First 5 Jobs access is not available.';
  end if;
  if exists (
    select 1 from public.stage1_quotes
    where stage1_lead_id = v_lead.id and status in ('sent', 'accepted')
  ) then
    raise exception 'This lead already has an active quote.';
  end if;
  if btrim(coalesce(p_site_address, v_lead.site_address, '')) = ''
    or btrim(coalesce(p_service_description, '')) = '' then
    raise exception 'Service address and work description are required.';
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

  update public.stage1_leads set
    contact_name = coalesce(nullif(btrim(p_client_contact_name), ''), contact_name),
    contact_email = coalesce(nullif(btrim(p_client_email), ''), contact_email),
    contact_phone = coalesce(nullif(btrim(p_client_phone), ''), contact_phone),
    site_address = coalesce(nullif(btrim(p_site_address), ''), site_address),
    status = 'quoted', estimated_value = v_total, updated_at = now()
  where id = v_lead.id;

  insert into public.stage1_quotes (
    autopsy_run_id, stage_progress_id, stage1_lead_id, client_name, site_address,
    amount, status, issued_at, quote_notes, created_by, client_contact_name,
    client_email, client_phone, service_description, valid_until,
    payment_terms, subtotal_ex_gst, gst_amount, total_inc_gst
  ) values (
    v_lead.autopsy_run_id, v_lead.stage_progress_id, v_lead.id, v_lead.client_name,
    coalesce(nullif(btrim(p_site_address), ''), v_lead.site_address), v_total,
    'sent', now(), nullif(btrim(p_service_description), ''), v_user_id,
    coalesce(nullif(btrim(p_client_contact_name), ''), v_lead.contact_name),
    coalesce(nullif(btrim(p_client_email), ''), v_lead.contact_email),
    coalesce(nullif(btrim(p_client_phone), ''), v_lead.contact_phone),
    btrim(p_service_description), p_valid_until,
    coalesce(nullif(btrim(p_payment_terms), ''), 'Payment due within 7 days of invoice.'),
    v_subtotal, v_gst, v_total
  ) returning id, stage1_quotes.quote_sequence_number into v_quote_id, v_quote_sequence;

  v_position := 0;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_position := v_position + 1;
    insert into public.stage1_quote_line_items (
      stage1_quote_id, line_position, description, quantity,
      unit_price_ex_gst, line_total_ex_gst, created_by
    ) values (
      v_quote_id, v_position, btrim(v_item->>'description'),
      (v_item->>'quantity')::numeric, (v_item->>'unitPriceExGst')::numeric,
      round((v_item->>'quantity')::numeric * (v_item->>'unitPriceExGst')::numeric, 2),
      v_user_id
    );
  end loop;

  return query select v_quote_id, v_quote_sequence, v_total;
end;
$$;

revoke all on function public.create_stage1_quote_from_lead(uuid,text,text,text,text,text,date,text,jsonb) from public, anon;
grant execute on function public.create_stage1_quote_from_lead(uuid,text,text,text,text,text,date,text,jsonb) to authenticated;

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
    job_status, notes, created_by, source_stage1_lead_id, source_stage1_quote_id
  ) values (
    v_quote.autopsy_run_id, v_quote.stage_progress_id, v_quote.client_name,
    coalesce(v_quote.site_address, v_quote.client_name), 'draft',
    format('Created from Stage 1 quote Q-%s.', v_quote.quote_sequence_number), v_user_id,
    v_quote.stage1_lead_id, v_quote.id
  ) returning * into v_job;

  update public.stage1_quotes set
    status = 'accepted', accepted_at = coalesce(accepted_at, now()),
    stage1_job_id = v_job.id, updated_at = now()
  where id = v_quote.id;

  update public.stage1_leads set status = 'won', updated_at = now()
  where id = v_quote.stage1_lead_id and created_by = v_user_id;

  return query select v_job.id, v_job.job_sequence_number;
end;
$$;

revoke all on function public.accept_stage1_quote(uuid) from public, anon;
grant execute on function public.accept_stage1_quote(uuid) to authenticated;

create or replace function public.set_stage1_quote_outcome(
  p_quote_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_quote public.stage1_quotes%rowtype;
  v_status text := lower(btrim(coalesce(p_status, '')));
begin
  if v_status not in ('sent', 'declined', 'rejected', 'expired') then
    raise exception 'Use quote acceptance to create a job.';
  end if;
  select * into v_quote from public.stage1_quotes
  where id = p_quote_id and created_by = v_user_id for update;
  if not found then raise exception 'Quote not found.'; end if;
  if v_quote.stage1_job_id is not null then raise exception 'Converted quotes cannot be changed.'; end if;

  update public.stage1_quotes set
    status = v_status,
    rejected_at = case when v_status in ('declined', 'rejected', 'expired') then now() else null end,
    rejection_reason = case when v_status in ('declined', 'rejected') then nullif(btrim(p_reason), '') else null end,
    updated_at = now()
  where id = v_quote.id;

  update public.stage1_leads set
    status = case when v_status = 'sent' then 'quoted' else 'lost' end,
    updated_at = now()
  where id = v_quote.stage1_lead_id and created_by = v_user_id;
end;
$$;

revoke all on function public.set_stage1_quote_outcome(uuid,text,text) from public, anon;
grant execute on function public.set_stage1_quote_outcome(uuid,text,text) to authenticated;

alter table public.stage1_leads
  add column if not exists source_activity_id uuid
  references public.stage1_lead_activities(id) on delete set null;

create index if not exists stage1_leads_source_activity_id_idx
  on public.stage1_leads(source_activity_id);

create or replace function public.create_stage1_lead_activity_with_contacts(
  p_run_id uuid,
  p_activity_date date,
  p_method text,
  p_attempts integer,
  p_contacts_made integer,
  p_leads_generated integer,
  p_potential_customers jsonb
)
returns table(activity_id uuid, created_lead_count integer)
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_activity_id uuid;
  v_customer jsonb;
  v_customer_count integer;
begin
  if v_user_id is null then raise exception 'A valid session is required.'; end if;
  if not public.current_user_has_verified_business_identity() then
    raise exception 'Verified Business Details are required.';
  end if;
  if not public.current_user_can_use_stage1_run(p_run_id) then
    raise exception 'This Autopsy run is not cleared for First 5 Jobs.';
  end if;
  if p_activity_date is null then raise exception 'An activity date is required.'; end if;
  if btrim(coalesce(p_method, '')) = '' then raise exception 'A lead method is required.'; end if;
  if coalesce(p_attempts, -1) < 0 or coalesce(p_contacts_made, -1) < 0 or coalesce(p_leads_generated, -1) < 0 then
    raise exception 'Activity totals cannot be negative.';
  end if;
  if p_contacts_made > p_attempts then raise exception 'Responses cannot exceed the number approached.'; end if;
  if p_leads_generated > p_contacts_made then raise exception 'Potential customers cannot exceed responses.'; end if;
  if p_potential_customers is null or jsonb_typeof(p_potential_customers) <> 'array' then
    raise exception 'Potential-customer details must be supplied as a list.';
  end if;

  v_customer_count := jsonb_array_length(p_potential_customers);
  if v_customer_count <> p_leads_generated then
    raise exception 'Each potential customer must have one contact record.';
  end if;
  if v_customer_count > 50 then
    raise exception 'No more than 50 potential customers may be recorded in one activity.';
  end if;

  for v_customer in select value from jsonb_array_elements(p_potential_customers)
  loop
    if btrim(coalesce(v_customer->>'client_name', '')) = '' then
      raise exception 'Every potential customer requires a customer or business name.';
    end if;
    if btrim(coalesce(v_customer->>'contact_email', '')) = ''
       and btrim(coalesce(v_customer->>'contact_phone', '')) = '' then
      raise exception 'Every potential customer requires a phone number or email.';
    end if;
  end loop;

  insert into public.stage1_lead_activities (
    autopsy_run_id, activity_date, method, attempts, contacts_made, leads_generated, created_by
  ) values (
    p_run_id, p_activity_date, btrim(p_method), p_attempts, p_contacts_made, p_leads_generated, v_user_id
  )
  returning id into v_activity_id;

  for v_customer in select value from jsonb_array_elements(p_potential_customers)
  loop
    insert into public.stage1_leads (
      autopsy_run_id, source_activity_id, client_name, contact_name, contact_email,
      contact_phone, site_address, source, status, estimated_value, next_action_at, notes, created_by
    ) values (
      p_run_id, v_activity_id, btrim(v_customer->>'client_name'),
      nullif(btrim(v_customer->>'contact_name'), ''),
      nullif(btrim(v_customer->>'contact_email'), ''),
      nullif(btrim(v_customer->>'contact_phone'), ''),
      nullif(btrim(v_customer->>'site_address'), ''),
      btrim(p_method), 'new', 0, null, null, v_user_id
    );
  end loop;

  return query select v_activity_id, v_customer_count;
end;
$function$;

revoke all on function public.create_stage1_lead_activity_with_contacts(uuid,date,text,integer,integer,integer,jsonb) from public, anon;
grant execute on function public.create_stage1_lead_activity_with_contacts(uuid,date,text,integer,integer,integer,jsonb) to authenticated;

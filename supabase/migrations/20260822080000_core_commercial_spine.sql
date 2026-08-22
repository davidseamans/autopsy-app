-- BOS-E01: universal, tenant-isolated Core commercial spine.
-- Repository migration only. This file does not activate Control or mutate a
-- live Supabase project merely by being committed.

begin;

do $$
begin
  if to_regclass('public.control_tenants') is null
     or to_regclass('public.control_tenant_memberships') is null
     or to_regclass('public.core_accounts') is null
     or to_regclass('public.core_contacts') is null
     or to_regclass('public.core_sites') is null
     or to_regclass('public.core_leads') is null
     or to_regclass('public.core_pipeline') is null
     or to_regclass('public.core_quotes') is null
     or to_regclass('public.core_jobs') is null then
    raise exception 'BOS-E01 requires the accepted CONTROL-001 Core baseline';
  end if;
end
$$;

-- Core may retain an optional provenance code, but must never default every
-- Lead to the Cleaning Sleeve or use that value to drive Core behaviour.
alter table public.core_leads
  alter column industry_code drop default,
  alter column industry_code drop not null;

comment on column public.core_leads.industry_code is
  'Optional external or Sleeve provenance only. Core must not interpret this value as pricing, compliance or workflow authority.';

-- Every existing universal identity receives a composite candidate key. All
-- commercial lineage edges below then prove Tenant identity as well as UUID.
create unique index if not exists core_accounts_tenant_id_id_uidx
  on public.core_accounts (tenant_id, id);
create unique index if not exists core_contacts_tenant_id_id_uidx
  on public.core_contacts (tenant_id, id);
create unique index if not exists core_sites_tenant_id_id_uidx
  on public.core_sites (tenant_id, id);
create unique index if not exists core_leads_tenant_id_id_uidx
  on public.core_leads (tenant_id, id);
create unique index if not exists core_pipeline_tenant_id_id_uidx
  on public.core_pipeline (tenant_id, id);
create unique index if not exists core_quotes_tenant_id_id_uidx
  on public.core_quotes (tenant_id, id);
create unique index if not exists core_jobs_tenant_id_id_uidx
  on public.core_jobs (tenant_id, id);

alter table public.core_contacts drop constraint if exists contacts_account_id_fkey;
alter table public.core_contacts add constraint core_contacts_account_tenant_fk
  foreign key (tenant_id, account_id)
  references public.core_accounts (tenant_id, id) on delete restrict;

alter table public.core_sites drop constraint if exists sites_account_id_fkey;
alter table public.core_sites add constraint core_sites_account_tenant_fk
  foreign key (tenant_id, account_id)
  references public.core_accounts (tenant_id, id) on delete restrict;

alter table public.core_pipeline drop constraint if exists pipeline_account_id_fkey;
alter table public.core_pipeline drop constraint if exists pipeline_site_id_fkey;
alter table public.core_pipeline drop constraint if exists pipeline_lead_id_fkey;
alter table public.core_pipeline add constraint core_pipeline_account_tenant_fk
  foreign key (tenant_id, account_id)
  references public.core_accounts (tenant_id, id) on delete restrict;
alter table public.core_pipeline add constraint core_pipeline_site_tenant_fk
  foreign key (tenant_id, site_id)
  references public.core_sites (tenant_id, id) on delete restrict;
alter table public.core_pipeline add constraint core_pipeline_lead_tenant_fk
  foreign key (tenant_id, lead_id)
  references public.core_leads (tenant_id, id) on delete set null;

alter table public.core_quotes drop constraint if exists quotes_pipeline_id_fkey;
alter table public.core_quotes drop constraint if exists quotes_site_id_fkey;
alter table public.core_quotes drop constraint if exists quotes_lead_id_fkey;
alter table public.core_quotes drop constraint if exists quotes_job_id_fkey;
alter table public.core_quotes add constraint core_quotes_pipeline_tenant_fk
  foreign key (tenant_id, pipeline_id)
  references public.core_pipeline (tenant_id, id) on delete restrict;
alter table public.core_quotes add constraint core_quotes_site_tenant_fk
  foreign key (tenant_id, site_id)
  references public.core_sites (tenant_id, id) on delete restrict;
alter table public.core_quotes add constraint core_quotes_lead_tenant_fk
  foreign key (tenant_id, lead_id)
  references public.core_leads (tenant_id, id) on delete set null;
alter table public.core_quotes add constraint core_quotes_job_tenant_fk
  foreign key (tenant_id, job_id)
  references public.core_jobs (tenant_id, id) on delete restrict;

alter table public.core_jobs drop constraint if exists jobs_quote_id_fkey;
alter table public.core_jobs drop constraint if exists jobs_site_id_fkey;
alter table public.core_jobs drop constraint if exists jobs_account_id_fkey;
alter table public.core_jobs drop constraint if exists jobs_pipeline_id_fkey;
alter table public.core_jobs drop constraint if exists jobs_lead_id_fkey;
alter table public.core_jobs add constraint core_jobs_quote_tenant_fk
  foreign key (tenant_id, quote_id)
  references public.core_quotes (tenant_id, id) on delete restrict;
alter table public.core_jobs add constraint core_jobs_site_tenant_fk
  foreign key (tenant_id, site_id)
  references public.core_sites (tenant_id, id) on delete restrict;
alter table public.core_jobs add constraint core_jobs_account_tenant_fk
  foreign key (tenant_id, account_id)
  references public.core_accounts (tenant_id, id) on delete set null;
alter table public.core_jobs add constraint core_jobs_pipeline_tenant_fk
  foreign key (tenant_id, pipeline_id)
  references public.core_pipeline (tenant_id, id) on delete set null;
alter table public.core_jobs add constraint core_jobs_lead_tenant_fk
  foreign key (tenant_id, lead_id)
  references public.core_leads (tenant_id, id) on delete set null;

create table public.core_scopes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.control_tenants(id) on delete restrict,
  opportunity_id uuid not null,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'superseded')),
  current_version_number integer not null default 1
    check (current_version_number > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint core_scopes_opportunity_tenant_fk
    foreign key (tenant_id, opportunity_id)
    references public.core_pipeline (tenant_id, id) on delete restrict
);

create unique index core_scopes_one_live_per_opportunity_idx
  on public.core_scopes (tenant_id, opportunity_id)
  where status <> 'superseded';

create table public.core_scope_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.control_tenants(id) on delete restrict,
  scope_id uuid not null,
  version_number integer not null check (version_number > 0),
  summary text not null check (length(btrim(summary)) > 0),
  requirements jsonb not null default '{}'::jsonb
    check (jsonb_typeof(requirements) = 'object'),
  assumptions text[] not null default '{}',
  exclusions text[] not null default '{}',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, scope_id, version_number),
  constraint core_scope_versions_scope_tenant_fk
    foreign key (tenant_id, scope_id)
    references public.core_scopes (tenant_id, id) on delete restrict
);

create table public.core_quote_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.control_tenants(id) on delete restrict,
  quote_id uuid not null,
  scope_version_id uuid not null,
  version_number integer not null check (version_number > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  amount_ex_tax numeric(14,2) not null check (amount_ex_tax >= 0),
  tax_amount numeric(14,2) not null check (tax_amount >= 0),
  amount_inc_tax numeric(14,2) not null check (amount_inc_tax >= 0),
  valid_until date,
  terms jsonb not null default '{}'::jsonb
    check (jsonb_typeof(terms) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, quote_id, version_number),
  constraint core_quote_versions_amount_coherence
    check (amount_inc_tax = amount_ex_tax + tax_amount),
  constraint core_quote_versions_quote_tenant_fk
    foreign key (tenant_id, quote_id)
    references public.core_quotes (tenant_id, id) on delete restrict,
  constraint core_quote_versions_scope_tenant_fk
    foreign key (tenant_id, scope_version_id)
    references public.core_scope_versions (tenant_id, id) on delete restrict
);

create table public.core_quote_acceptances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.control_tenants(id) on delete restrict,
  quote_version_id uuid not null,
  accepted_by_contact_id uuid,
  accepted_by_name text not null check (length(btrim(accepted_by_name)) > 0),
  accepted_at timestamptz not null,
  evidence_reference text not null check (length(btrim(evidence_reference)) > 0),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, quote_version_id),
  constraint core_quote_acceptances_version_tenant_fk
    foreign key (tenant_id, quote_version_id)
    references public.core_quote_versions (tenant_id, id) on delete restrict,
  constraint core_quote_acceptances_contact_tenant_fk
    foreign key (tenant_id, accepted_by_contact_id)
    references public.core_contacts (tenant_id, id) on delete restrict
);

create table public.core_commercial_baselines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.control_tenants(id) on delete restrict,
  acceptance_id uuid not null,
  quote_version_id uuid not null,
  scope_version_id uuid not null,
  account_id uuid not null,
  site_id uuid not null,
  opportunity_id uuid not null,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  amount_ex_tax numeric(14,2) not null check (amount_ex_tax >= 0),
  tax_amount numeric(14,2) not null check (tax_amount >= 0),
  amount_inc_tax numeric(14,2) not null check (amount_inc_tax >= 0),
  effective_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, acceptance_id),
  unique (tenant_id, quote_version_id),
  constraint core_commercial_baselines_amount_coherence
    check (amount_inc_tax = amount_ex_tax + tax_amount),
  constraint core_commercial_baselines_acceptance_tenant_fk
    foreign key (tenant_id, acceptance_id)
    references public.core_quote_acceptances (tenant_id, id) on delete restrict,
  constraint core_commercial_baselines_quote_version_tenant_fk
    foreign key (tenant_id, quote_version_id)
    references public.core_quote_versions (tenant_id, id) on delete restrict,
  constraint core_commercial_baselines_scope_version_tenant_fk
    foreign key (tenant_id, scope_version_id)
    references public.core_scope_versions (tenant_id, id) on delete restrict,
  constraint core_commercial_baselines_account_tenant_fk
    foreign key (tenant_id, account_id)
    references public.core_accounts (tenant_id, id) on delete restrict,
  constraint core_commercial_baselines_site_tenant_fk
    foreign key (tenant_id, site_id)
    references public.core_sites (tenant_id, id) on delete restrict,
  constraint core_commercial_baselines_opportunity_tenant_fk
    foreign key (tenant_id, opportunity_id)
    references public.core_pipeline (tenant_id, id) on delete restrict
);

alter table public.core_jobs
  add column commercial_baseline_id uuid,
  add column activated_at timestamptz;

alter table public.core_jobs add constraint core_jobs_baseline_tenant_fk
  foreign key (tenant_id, commercial_baseline_id)
  references public.core_commercial_baselines (tenant_id, id) on delete restrict;

create unique index core_jobs_one_per_commercial_baseline_idx
  on public.core_jobs (tenant_id, commercial_baseline_id)
  where commercial_baseline_id is not null;

create table public.core_job_activation_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.control_tenants(id) on delete restrict,
  commercial_baseline_id uuid not null,
  job_id uuid,
  scope_confirmed boolean not null,
  funding_confirmed boolean not null,
  capacity_confirmed boolean not null,
  operational_readiness_confirmed boolean not null,
  decision text not null check (decision in ('blocked', 'activated')),
  reason text,
  decided_by uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint core_job_activation_baseline_tenant_fk
    foreign key (tenant_id, commercial_baseline_id)
    references public.core_commercial_baselines (tenant_id, id) on delete restrict,
  constraint core_job_activation_job_tenant_fk
    foreign key (tenant_id, job_id)
    references public.core_jobs (tenant_id, id) on delete restrict,
  constraint core_job_activation_decision_coherence check (
    (decision = 'activated'
      and job_id is not null
      and scope_confirmed
      and funding_confirmed
      and capacity_confirmed
      and operational_readiness_confirmed)
    or
    (decision = 'blocked' and job_id is null)
  )
);

create unique index core_job_activation_one_success_idx
  on public.core_job_activation_decisions (tenant_id, commercial_baseline_id)
  where decision = 'activated';

create table public.core_commercial_state_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.control_tenants(id) on delete restrict,
  entity_type text not null check (entity_type in (
    'account', 'contact', 'lead', 'opportunity', 'scope', 'scope_version',
    'quote', 'quote_version', 'acceptance', 'commercial_baseline', 'job_activation'
  )),
  entity_id uuid not null,
  previous_state text,
  new_state text not null check (length(btrim(new_state)) > 0),
  event_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(event_metadata) = 'object'),
  changed_by uuid not null references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now()
);

create index core_scopes_tenant_opportunity_idx
  on public.core_scopes (tenant_id, opportunity_id);
create index core_scope_versions_tenant_scope_idx
  on public.core_scope_versions (tenant_id, scope_id, version_number desc);
create index core_quote_versions_tenant_quote_idx
  on public.core_quote_versions (tenant_id, quote_id, version_number desc);
create index core_quote_acceptances_tenant_version_idx
  on public.core_quote_acceptances (tenant_id, quote_version_id);
create index core_commercial_baselines_tenant_opportunity_idx
  on public.core_commercial_baselines (tenant_id, opportunity_id);
create index core_job_activation_decisions_tenant_baseline_idx
  on public.core_job_activation_decisions (tenant_id, commercial_baseline_id, decided_at desc);
create index core_commercial_state_events_tenant_entity_idx
  on public.core_commercial_state_events (tenant_id, entity_type, entity_id, changed_at desc);

create or replace function public.core_reject_immutable_commercial_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception '% records are append-only', tg_table_name using errcode = '42501';
end;
$$;

create trigger core_scope_versions_immutable
before update or delete on public.core_scope_versions
for each row execute function public.core_reject_immutable_commercial_change();
create trigger core_quote_versions_immutable
before update or delete on public.core_quote_versions
for each row execute function public.core_reject_immutable_commercial_change();
create trigger core_quote_acceptances_immutable
before update or delete on public.core_quote_acceptances
for each row execute function public.core_reject_immutable_commercial_change();
create trigger core_commercial_baselines_immutable
before update or delete on public.core_commercial_baselines
for each row execute function public.core_reject_immutable_commercial_change();
create trigger core_job_activation_decisions_immutable
before update or delete on public.core_job_activation_decisions
for each row execute function public.core_reject_immutable_commercial_change();
create trigger core_commercial_state_events_immutable
before update or delete on public.core_commercial_state_events
for each row execute function public.core_reject_immutable_commercial_change();

create or replace function public.core_has_commercial_authority(
  p_tenant_id uuid,
  p_action text
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.control_tenant_memberships membership
    where membership.tenant_id = p_tenant_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and (
        membership.role = 'owner'
        or (
          membership.role = 'staff'
          and p_action in ('create_intake', 'draft_scope', 'draft_quote')
        )
      )
  );
$$;

create or replace function public.core_create_commercial_intake(
  p_tenant_id uuid,
  p_account_name text,
  p_contact_name text,
  p_contact_phone text,
  p_contact_email text,
  p_site_name text,
  p_site_address text,
  p_lead_name text,
  p_lead_source text,
  p_service_requirement text,
  p_estimated_value numeric default null
) returns table(
  account_id uuid,
  contact_id uuid,
  lead_id uuid,
  opportunity_id uuid,
  site_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_account_id uuid;
  v_contact_id uuid;
  v_lead_id uuid;
  v_opportunity_id uuid;
  v_site_id uuid;
begin
  if v_actor is null or not public.core_has_commercial_authority(p_tenant_id, 'create_intake') then
    raise exception 'Commercial intake is not authorised.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_account_name, ''))) = 0
     or length(btrim(coalesce(p_contact_name, ''))) = 0
     or length(btrim(coalesce(p_site_address, ''))) = 0
     or length(btrim(coalesce(p_lead_name, ''))) = 0
     or length(btrim(coalesce(p_service_requirement, ''))) = 0 then
    raise exception 'Account, contact, site address, Lead and requirement are required.';
  end if;
  if length(btrim(coalesce(p_contact_phone, ''))) = 0
     and length(btrim(coalesce(p_contact_email, ''))) = 0 then
    raise exception 'A contact phone or email is required.';
  end if;
  if p_estimated_value is not null and p_estimated_value < 0 then
    raise exception 'Estimated value cannot be negative.';
  end if;

  insert into public.core_accounts (tenant_id, name)
  values (p_tenant_id, btrim(p_account_name))
  returning id into v_account_id;

  insert into public.core_contacts (tenant_id, account_id, name, phone, email)
  values (
    p_tenant_id, v_account_id, btrim(p_contact_name),
    nullif(btrim(coalesce(p_contact_phone, '')), ''),
    nullif(btrim(coalesce(p_contact_email, '')), '')
  ) returning id into v_contact_id;

  insert into public.core_sites (tenant_id, account_id, name, address)
  values (
    p_tenant_id, v_account_id,
    nullif(btrim(coalesce(p_site_name, '')), ''), btrim(p_site_address)
  ) returning id into v_site_id;

  insert into public.core_leads (
    tenant_id, name, source, status, lead_quality, contact_phone,
    contact_email, service_requirement, site_name, site_address, industry_code,
    converted_to_pipeline_at
  ) values (
    p_tenant_id, btrim(p_lead_name), nullif(btrim(coalesce(p_lead_source, '')), ''),
    'qualified', 'qualified',
    nullif(btrim(coalesce(p_contact_phone, '')), ''),
    nullif(btrim(coalesce(p_contact_email, '')), ''), btrim(p_service_requirement),
    nullif(btrim(coalesce(p_site_name, '')), ''), btrim(p_site_address), null, now()
  ) returning id into v_lead_id;

  insert into public.core_pipeline (
    tenant_id, account_id, site_id, lead_id, stage, value
  ) values (
    p_tenant_id, v_account_id, v_site_id, v_lead_id, 'qualified', p_estimated_value
  ) returning id into v_opportunity_id;

  insert into public.core_commercial_state_events (
    tenant_id, entity_type, entity_id, new_state, changed_by
  ) values
    (p_tenant_id, 'account', v_account_id, 'created', v_actor),
    (p_tenant_id, 'contact', v_contact_id, 'created', v_actor),
    (p_tenant_id, 'lead', v_lead_id, 'qualified', v_actor),
    (p_tenant_id, 'opportunity', v_opportunity_id, 'qualified', v_actor);

  return query select v_account_id, v_contact_id, v_lead_id, v_opportunity_id, v_site_id;
end;
$$;

create or replace function public.core_create_scope_version(
  p_tenant_id uuid,
  p_opportunity_id uuid,
  p_summary text,
  p_requirements jsonb,
  p_scope_id uuid default null,
  p_assumptions text[] default '{}',
  p_exclusions text[] default '{}'
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_scope_id uuid := p_scope_id;
  v_scope_version_id uuid;
  v_version integer;
begin
  if v_actor is null or not public.core_has_commercial_authority(p_tenant_id, 'draft_scope') then
    raise exception 'Scope drafting is not authorised.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_summary, ''))) = 0
     or p_requirements is null
     or jsonb_typeof(p_requirements) <> 'object' then
    raise exception 'A Scope summary and requirements object are required.';
  end if;
  if not exists (
    select 1 from public.core_pipeline opportunity
    where opportunity.tenant_id = p_tenant_id
      and opportunity.id = p_opportunity_id
      and opportunity.stage not in ('lost', 'won')
  ) then
    raise exception 'Opportunity not found, closed or access denied.' using errcode = '42501';
  end if;

  if v_scope_id is null then
    insert into public.core_scopes (
      tenant_id, opportunity_id, status, current_version_number, created_by
    ) values (p_tenant_id, p_opportunity_id, 'draft', 1, v_actor)
    returning id, current_version_number into v_scope_id, v_version;
  else
    select scope.current_version_number + 1
    into v_version
    from public.core_scopes scope
    where scope.tenant_id = p_tenant_id
      and scope.id = v_scope_id
      and scope.opportunity_id = p_opportunity_id
      and scope.status <> 'superseded'
    for update;
    if not found then
      raise exception 'Scope not found or access denied.' using errcode = '42501';
    end if;
    update public.core_scopes
    set current_version_number = v_version, status = 'draft', updated_at = now()
    where tenant_id = p_tenant_id and id = v_scope_id;
  end if;

  insert into public.core_scope_versions (
    tenant_id, scope_id, version_number, summary, requirements,
    assumptions, exclusions, created_by
  ) values (
    p_tenant_id, v_scope_id, v_version, btrim(p_summary), p_requirements,
    coalesce(p_assumptions, '{}'), coalesce(p_exclusions, '{}'), v_actor
  ) returning id into v_scope_version_id;

  insert into public.core_commercial_state_events (
    tenant_id, entity_type, entity_id, previous_state, new_state,
    event_metadata, changed_by
  ) values (
    p_tenant_id, 'scope_version', v_scope_version_id, null, 'drafted',
    jsonb_build_object('scope_id', v_scope_id, 'version_number', v_version), v_actor
  );

  return v_scope_version_id;
end;
$$;

create or replace function public.core_create_quote_version(
  p_tenant_id uuid,
  p_opportunity_id uuid,
  p_scope_version_id uuid,
  p_currency_code text,
  p_amount_ex_tax numeric,
  p_tax_amount numeric,
  p_quote_id uuid default null,
  p_valid_until date default null,
  p_terms jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_quote_id uuid := p_quote_id;
  v_quote_version_id uuid;
  v_version integer;
  v_site_id uuid;
  v_lead_id uuid;
  v_amount_inc_tax numeric;
begin
  if v_actor is null or not public.core_has_commercial_authority(p_tenant_id, 'draft_quote') then
    raise exception 'Quote drafting is not authorised.' using errcode = '42501';
  end if;
  if p_amount_ex_tax is null or p_amount_ex_tax < 0
     or p_tax_amount is null or p_tax_amount < 0 then
    raise exception 'Quote amounts must be non-negative.';
  end if;
  if coalesce(p_currency_code, '') !~ '^[A-Z]{3}$'
     or p_terms is null or jsonb_typeof(p_terms) <> 'object' then
    raise exception 'A three-letter currency and terms object are required.';
  end if;

  select opportunity.site_id, opportunity.lead_id
  into v_site_id, v_lead_id
  from public.core_pipeline opportunity
  join public.core_scope_versions scope_version
    on scope_version.tenant_id = opportunity.tenant_id
   and scope_version.id = p_scope_version_id
  join public.core_scopes scope
    on scope.tenant_id = scope_version.tenant_id
   and scope.id = scope_version.scope_id
   and scope.opportunity_id = opportunity.id
  where opportunity.tenant_id = p_tenant_id
    and opportunity.id = p_opportunity_id
    and opportunity.stage not in ('lost', 'won');
  if not found then
    raise exception 'Opportunity and Scope version do not share authorised lineage.' using errcode = '42501';
  end if;

  v_amount_inc_tax := p_amount_ex_tax + p_tax_amount;
  if v_quote_id is null then
    insert into public.core_quotes (
      tenant_id, pipeline_id, site_id, lead_id, amount, status, quote_type
    ) values (
      p_tenant_id, p_opportunity_id, v_site_id, v_lead_id,
      v_amount_inc_tax, 'draft', 'primary'
    ) returning id into v_quote_id;
    v_version := 1;
  else
    perform 1
    from public.core_quotes quote
    where quote.tenant_id = p_tenant_id
      and quote.id = v_quote_id
      and quote.pipeline_id = p_opportunity_id
      and quote.status not in ('accepted', 'converted')
    for update;
    if not found then
      raise exception 'Quote not found, committed or access denied.' using errcode = '42501';
    end if;

    select coalesce(max(version.version_number), 0) + 1
    into v_version
    from public.core_quote_versions version
    where version.tenant_id = p_tenant_id and version.quote_id = v_quote_id;

    update public.core_quotes
    set amount = v_amount_inc_tax, status = 'draft', issued_at = null
    where tenant_id = p_tenant_id and id = v_quote_id;
  end if;

  insert into public.core_quote_versions (
    tenant_id, quote_id, scope_version_id, version_number, currency_code,
    amount_ex_tax, tax_amount, amount_inc_tax, valid_until, terms, created_by
  ) values (
    p_tenant_id, v_quote_id, p_scope_version_id, v_version, p_currency_code,
    p_amount_ex_tax, p_tax_amount, v_amount_inc_tax, p_valid_until, p_terms, v_actor
  ) returning id into v_quote_version_id;

  update public.core_pipeline
  set stage = 'quoted', value = v_amount_inc_tax,
      converted_to_quote_at = coalesce(converted_to_quote_at, now())
  where tenant_id = p_tenant_id and id = p_opportunity_id;

  insert into public.core_commercial_state_events (
    tenant_id, entity_type, entity_id, new_state, event_metadata, changed_by
  ) values (
    p_tenant_id, 'quote_version', v_quote_version_id, 'drafted',
    jsonb_build_object('quote_id', v_quote_id, 'version_number', v_version), v_actor
  );

  return v_quote_version_id;
end;
$$;

create or replace function public.core_issue_quote_version(
  p_tenant_id uuid,
  p_quote_version_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_quote_id uuid;
begin
  if v_actor is null or not public.core_has_commercial_authority(p_tenant_id, 'issue_quote') then
    raise exception 'Quote issue is not authorised.' using errcode = '42501';
  end if;

  select version.quote_id into v_quote_id
  from public.core_quote_versions version
  join public.core_quotes quote
    on quote.tenant_id = version.tenant_id and quote.id = version.quote_id
  where version.tenant_id = p_tenant_id
    and version.id = p_quote_version_id
    and version.version_number = (
      select max(latest.version_number)
      from public.core_quote_versions latest
      where latest.tenant_id = version.tenant_id and latest.quote_id = version.quote_id
    )
    and quote.status = 'draft';
  if not found then
    raise exception 'Only the latest draft Quote version may be issued.' using errcode = '42501';
  end if;

  update public.core_quotes
  set status = 'sent', issued_at = now()
  where tenant_id = p_tenant_id and id = v_quote_id;

  insert into public.core_commercial_state_events (
    tenant_id, entity_type, entity_id, previous_state, new_state,
    event_metadata, changed_by
  ) values (
    p_tenant_id, 'quote_version', p_quote_version_id, 'drafted', 'issued',
    jsonb_build_object('quote_id', v_quote_id), v_actor
  );

  return v_quote_id;
end;
$$;

create or replace function public.core_record_quote_acceptance(
  p_tenant_id uuid,
  p_quote_version_id uuid,
  p_accepted_by_name text,
  p_evidence_reference text,
  p_accepted_by_contact_id uuid default null,
  p_accepted_at timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_existing_baseline_id uuid;
  v_acceptance_id uuid;
  v_baseline_id uuid;
  v_quote_id uuid;
  v_scope_version_id uuid;
  v_opportunity_id uuid;
  v_account_id uuid;
  v_site_id uuid;
  v_currency text;
  v_ex_tax numeric;
  v_tax numeric;
  v_inc_tax numeric;
begin
  if v_actor is null or not public.core_has_commercial_authority(p_tenant_id, 'accept_quote') then
    raise exception 'Quote acceptance recording is not authorised.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_accepted_by_name, ''))) = 0
     or length(btrim(coalesce(p_evidence_reference, ''))) = 0 then
    raise exception 'Acceptance name and evidence reference are required.';
  end if;

  select baseline.id into v_existing_baseline_id
  from public.core_commercial_baselines baseline
  where baseline.tenant_id = p_tenant_id
    and baseline.quote_version_id = p_quote_version_id;
  if v_existing_baseline_id is not null then
    return v_existing_baseline_id;
  end if;

  select
    version.quote_id, version.scope_version_id, quote.pipeline_id,
    opportunity.account_id, opportunity.site_id, version.currency_code,
    version.amount_ex_tax, version.tax_amount, version.amount_inc_tax
  into
    v_quote_id, v_scope_version_id, v_opportunity_id,
    v_account_id, v_site_id, v_currency, v_ex_tax, v_tax, v_inc_tax
  from public.core_quote_versions version
  join public.core_quotes quote
    on quote.tenant_id = version.tenant_id and quote.id = version.quote_id
  join public.core_pipeline opportunity
    on opportunity.tenant_id = quote.tenant_id and opportunity.id = quote.pipeline_id
  where version.tenant_id = p_tenant_id
    and version.id = p_quote_version_id
    and quote.status in ('sent', 'followed_up')
    and exists (
      select 1 from public.core_commercial_state_events event
      where event.tenant_id = version.tenant_id
        and event.entity_type = 'quote_version'
        and event.entity_id = version.id
        and event.new_state = 'issued'
    );
  if not found then
    raise exception 'Only an issued Quote version may be accepted.' using errcode = '42501';
  end if;

  if p_accepted_by_contact_id is not null and not exists (
    select 1 from public.core_contacts contact
    where contact.tenant_id = p_tenant_id
      and contact.id = p_accepted_by_contact_id
      and contact.account_id = v_account_id
  ) then
    raise exception 'Acceptance contact does not belong to the Account.' using errcode = '42501';
  end if;

  insert into public.core_quote_acceptances (
    tenant_id, quote_version_id, accepted_by_contact_id, accepted_by_name,
    accepted_at, evidence_reference, recorded_by
  ) values (
    p_tenant_id, p_quote_version_id, p_accepted_by_contact_id,
    btrim(p_accepted_by_name), p_accepted_at, btrim(p_evidence_reference), v_actor
  ) returning id into v_acceptance_id;

  insert into public.core_commercial_baselines (
    tenant_id, acceptance_id, quote_version_id, scope_version_id,
    account_id, site_id, opportunity_id, currency_code, amount_ex_tax,
    tax_amount, amount_inc_tax, effective_at, created_by
  ) values (
    p_tenant_id, v_acceptance_id, p_quote_version_id, v_scope_version_id,
    v_account_id, v_site_id, v_opportunity_id, v_currency, v_ex_tax,
    v_tax, v_inc_tax, p_accepted_at, v_actor
  ) returning id into v_baseline_id;

  update public.core_quotes
  set status = 'accepted', accepted_at = p_accepted_at
  where tenant_id = p_tenant_id and id = v_quote_id;
  update public.core_pipeline
  set stage = 'won', won_at = p_accepted_at
  where tenant_id = p_tenant_id and id = v_opportunity_id;

  insert into public.core_commercial_state_events (
    tenant_id, entity_type, entity_id, previous_state, new_state,
    event_metadata, changed_by
  ) values
    (p_tenant_id, 'acceptance', v_acceptance_id, null, 'recorded',
      jsonb_build_object('quote_version_id', p_quote_version_id), v_actor),
    (p_tenant_id, 'commercial_baseline', v_baseline_id, null, 'committed',
      jsonb_build_object('acceptance_id', v_acceptance_id), v_actor),
    (p_tenant_id, 'opportunity', v_opportunity_id, 'quoted', 'won',
      jsonb_build_object('commercial_baseline_id', v_baseline_id), v_actor);

  return v_baseline_id;
end;
$$;

create or replace function public.core_activate_job_from_baseline(
  p_tenant_id uuid,
  p_commercial_baseline_id uuid,
  p_scope_confirmed boolean,
  p_funding_confirmed boolean,
  p_capacity_confirmed boolean,
  p_operational_readiness_confirmed boolean,
  p_reason text default null,
  p_scheduled_date date default null,
  p_po_number text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_existing_job_id uuid;
  v_job_id uuid;
  v_quote_id uuid;
  v_site_id uuid;
  v_account_id uuid;
  v_opportunity_id uuid;
  v_lead_id uuid;
begin
  if v_actor is null or not public.core_has_commercial_authority(p_tenant_id, 'activate_job') then
    raise exception 'Job activation is not authorised.' using errcode = '42501';
  end if;

  select job.id into v_existing_job_id
  from public.core_jobs job
  where job.tenant_id = p_tenant_id
    and job.commercial_baseline_id = p_commercial_baseline_id;
  if v_existing_job_id is not null then
    return v_existing_job_id;
  end if;

  select
    version.quote_id, baseline.site_id, baseline.account_id,
    baseline.opportunity_id, opportunity.lead_id
  into v_quote_id, v_site_id, v_account_id, v_opportunity_id, v_lead_id
  from public.core_commercial_baselines baseline
  join public.core_quote_versions version
    on version.tenant_id = baseline.tenant_id and version.id = baseline.quote_version_id
  join public.core_pipeline opportunity
    on opportunity.tenant_id = baseline.tenant_id and opportunity.id = baseline.opportunity_id
  where baseline.tenant_id = p_tenant_id
    and baseline.id = p_commercial_baseline_id;
  if not found then
    raise exception 'Commercial Baseline not found or access denied.' using errcode = '42501';
  end if;

  if not coalesce(p_scope_confirmed, false)
     or not coalesce(p_funding_confirmed, false)
     or not coalesce(p_capacity_confirmed, false)
     or not coalesce(p_operational_readiness_confirmed, false) then
    insert into public.core_job_activation_decisions (
      tenant_id, commercial_baseline_id, scope_confirmed, funding_confirmed,
      capacity_confirmed, operational_readiness_confirmed,
      decision, reason, decided_by
    ) values (
      p_tenant_id, p_commercial_baseline_id,
      coalesce(p_scope_confirmed, false), coalesce(p_funding_confirmed, false),
      coalesce(p_capacity_confirmed, false),
      coalesce(p_operational_readiness_confirmed, false),
      'blocked', nullif(btrim(coalesce(p_reason, '')), ''), v_actor
    );

    insert into public.core_commercial_state_events (
      tenant_id, entity_type, entity_id, new_state, event_metadata, changed_by
    ) values (
      p_tenant_id, 'job_activation', p_commercial_baseline_id, 'blocked',
      jsonb_build_object(
        'scope_confirmed', coalesce(p_scope_confirmed, false),
        'funding_confirmed', coalesce(p_funding_confirmed, false),
        'capacity_confirmed', coalesce(p_capacity_confirmed, false),
        'operational_readiness_confirmed', coalesce(p_operational_readiness_confirmed, false)
      ), v_actor
    );
    return null;
  end if;

  insert into public.core_jobs (
    tenant_id, quote_id, site_id, account_id, pipeline_id, lead_id,
    status, scheduled_date, po_number, commercial_baseline_id, activated_at
  ) values (
    p_tenant_id, v_quote_id, v_site_id, v_account_id, v_opportunity_id, v_lead_id,
    'pending', p_scheduled_date, nullif(btrim(coalesce(p_po_number, '')), ''),
    p_commercial_baseline_id, now()
  ) returning id into v_job_id;

  insert into public.core_job_activation_decisions (
    tenant_id, commercial_baseline_id, job_id, scope_confirmed,
    funding_confirmed, capacity_confirmed, operational_readiness_confirmed,
    decision, reason, decided_by
  ) values (
    p_tenant_id, p_commercial_baseline_id, v_job_id, true, true, true, true,
    'activated', nullif(btrim(coalesce(p_reason, '')), ''), v_actor
  );

  update public.core_quotes
  set status = 'converted', job_id = v_job_id
  where tenant_id = p_tenant_id and id = v_quote_id;

  insert into public.core_commercial_state_events (
    tenant_id, entity_type, entity_id, new_state, event_metadata, changed_by
  ) values (
    p_tenant_id, 'job_activation', v_job_id, 'activated',
    jsonb_build_object('commercial_baseline_id', p_commercial_baseline_id), v_actor
  );

  return v_job_id;
end;
$$;

alter table public.core_scopes enable row level security;
alter table public.core_scope_versions enable row level security;
alter table public.core_quote_versions enable row level security;
alter table public.core_quote_acceptances enable row level security;
alter table public.core_commercial_baselines enable row level security;
alter table public.core_job_activation_decisions enable row level security;
alter table public.core_commercial_state_events enable row level security;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'core_scopes', 'core_scope_versions', 'core_quote_versions',
    'core_quote_acceptances', 'core_commercial_baselines',
    'core_job_activation_decisions', 'core_commercial_state_events'
  ]
  loop
    execute format('revoke all on public.%I from public, anon, authenticated', v_table);
    execute format('grant select on public.%I to authenticated', v_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using (exists (select 1 from public.control_tenant_memberships membership where membership.tenant_id = %I.tenant_id and membership.user_id = (select auth.uid()) and membership.status = ''active''))',
      v_table || '_tenant_member_select', v_table, v_table
    );
  end loop;
end
$$;

revoke all on function public.core_has_commercial_authority(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.core_create_commercial_intake(uuid, text, text, text, text, text, text, text, text, text, numeric)
  from public, anon, authenticated, service_role;
revoke all on function public.core_create_scope_version(uuid, uuid, text, jsonb, uuid, text[], text[])
  from public, anon, authenticated, service_role;
revoke all on function public.core_create_quote_version(uuid, uuid, uuid, text, numeric, numeric, uuid, date, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.core_issue_quote_version(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.core_record_quote_acceptance(uuid, uuid, text, text, uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.core_activate_job_from_baseline(uuid, uuid, boolean, boolean, boolean, boolean, text, date, text)
  from public, anon, authenticated, service_role;

grant execute on function public.core_has_commercial_authority(uuid, text)
  to authenticated;
grant execute on function public.core_create_commercial_intake(uuid, text, text, text, text, text, text, text, text, text, numeric)
  to authenticated;
grant execute on function public.core_create_scope_version(uuid, uuid, text, jsonb, uuid, text[], text[])
  to authenticated;
grant execute on function public.core_create_quote_version(uuid, uuid, uuid, text, numeric, numeric, uuid, date, jsonb)
  to authenticated;
grant execute on function public.core_issue_quote_version(uuid, uuid)
  to authenticated;
grant execute on function public.core_record_quote_acceptance(uuid, uuid, text, text, uuid, timestamptz)
  to authenticated;
grant execute on function public.core_activate_job_from_baseline(uuid, uuid, boolean, boolean, boolean, boolean, text, date, text)
  to authenticated;

comment on function public.core_record_quote_acceptance(uuid, uuid, text, text, uuid, timestamptz) is
  'Records an evidenced customer commitment and freezes the Commercial Baseline. It does not activate a Job.';
comment on function public.core_activate_job_from_baseline(uuid, uuid, boolean, boolean, boolean, boolean, text, date, text) is
  'Creates a Job only after scope, funding, capacity and operational readiness are all confirmed.';

commit;

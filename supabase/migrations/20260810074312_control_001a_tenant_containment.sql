-- CONTROL-001A: tenant containment foundation.
--
-- This migration is intentionally fail-closed. It is designed only for the
-- current dummy-data baseline and must not be applied after real Control data
-- is admitted. It does not activate Control navigation.

begin;

do $$
declare
  v_owned_profiles integer;
  v_core_rows integer;
begin
  if to_regclass('public.control_tenants') is not null
     or to_regclass('public.control_tenant_memberships') is not null then
    raise exception 'CONTROL-001A preflight failed: control tenant tables already exist';
  end if;

  select count(*) into v_owned_profiles
  from public.business_identity_profile
  where owner_user_id is not null;

  if v_owned_profiles <> 1 then
    raise exception 'CONTROL-001A preflight failed: expected exactly one owned business identity profile, found %', v_owned_profiles;
  end if;

  select
    (select count(*) from public.core_accounts) +
    (select count(*) from public.core_contacts) +
    (select count(*) from public.core_sites) +
    (select count(*) from public.core_leads) +
    (select count(*) from public.core_pipeline) +
    (select count(*) from public.core_quotes) +
    (select count(*) from public.core_jobs)
  into v_core_rows;

  if v_core_rows <> 67 then
    raise exception 'CONTROL-001A preflight failed: expected the governed 67-row dummy Core baseline, found %', v_core_rows;
  end if;
end
$$;

create table public.control_tenants (
  id uuid primary key default gen_random_uuid(),
  business_identity_profile_id uuid unique
    references public.business_identity_profile(id) on delete restrict,
  name text not null check (length(btrim(name)) > 0),
  lifecycle_status text not null
    check (lifecycle_status in ('fixture', 'offered', 'active', 'suspended', 'closed')),
  source_autopsy_run_id uuid,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint control_tenants_activation_coherence check (
    (lifecycle_status = 'active' and activated_at is not null)
    or (lifecycle_status <> 'active')
  )
);

create table public.control_tenant_memberships (
  tenant_id uuid not null references public.control_tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'staff')),
  status text not null check (status in ('active', 'suspended', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create unique index control_one_active_owner_per_tenant
  on public.control_tenant_memberships (tenant_id)
  where role = 'owner' and status = 'active';

alter table public.control_tenants enable row level security;
alter table public.control_tenant_memberships enable row level security;

revoke all on public.control_tenants from anon, authenticated;
revoke all on public.control_tenant_memberships from anon, authenticated;
grant select on public.control_tenants to authenticated;
grant select on public.control_tenant_memberships to authenticated;

create policy control_memberships_select_self
  on public.control_tenant_memberships
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy control_tenants_select_member
  on public.control_tenants
  for select to authenticated
  using (
    exists (
      select 1
      from public.control_tenant_memberships m
      where m.tenant_id = control_tenants.id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  );

-- The fixed UUID identifies test-fixture provenance. It is not a production
-- tenant identifier and may be retired under a separate governed decision.
insert into public.control_tenants (
  id,
  business_identity_profile_id,
  name,
  lifecycle_status,
  source_autopsy_run_id
)
select
  '00000000-0000-4000-8000-000000000001'::uuid,
  bip.id,
  bip.business_name || ' — CONTROL-001 fixture',
  'fixture',
  bip.source_autopsy_run_id
from public.business_identity_profile bip
where bip.owner_user_id is not null;

insert into public.control_tenant_memberships (tenant_id, user_id, role, status)
select
  '00000000-0000-4000-8000-000000000001'::uuid,
  bip.owner_user_id,
  'owner',
  'active'
from public.business_identity_profile bip
where bip.owner_user_id is not null;

alter table public.core_accounts add column tenant_id uuid;
alter table public.core_contacts add column tenant_id uuid;
alter table public.core_sites add column tenant_id uuid;
alter table public.core_leads add column tenant_id uuid;
alter table public.core_pipeline add column tenant_id uuid;
alter table public.core_quotes add column tenant_id uuid;
alter table public.core_jobs add column tenant_id uuid;

update public.core_accounts set tenant_id = '00000000-0000-4000-8000-000000000001';
update public.core_contacts set tenant_id = '00000000-0000-4000-8000-000000000001';
update public.core_sites set tenant_id = '00000000-0000-4000-8000-000000000001';
update public.core_leads set tenant_id = '00000000-0000-4000-8000-000000000001';
update public.core_pipeline set tenant_id = '00000000-0000-4000-8000-000000000001';
update public.core_quotes set tenant_id = '00000000-0000-4000-8000-000000000001';
update public.core_jobs set tenant_id = '00000000-0000-4000-8000-000000000001';

do $$
begin
  if exists (
    select 1
    from public.core_contacts c
    join public.core_accounts a on a.id = c.account_id
    where c.tenant_id <> a.tenant_id
  ) or exists (
    select 1
    from public.core_sites s
    join public.core_accounts a on a.id = s.account_id
    where s.tenant_id <> a.tenant_id
  ) or exists (
    select 1
    from public.core_pipeline p
    join public.core_accounts a on a.id = p.account_id
    where p.tenant_id <> a.tenant_id
  ) or exists (
    select 1
    from public.core_quotes q
    join public.core_pipeline p on p.id = q.pipeline_id
    where q.tenant_id <> p.tenant_id
  ) or exists (
    select 1
    from public.core_jobs j
    join public.core_quotes q on q.id = j.quote_id
    where j.tenant_id <> q.tenant_id
  ) then
    raise exception 'CONTROL-001A validation failed: cross-tenant principal Core lineage';
  end if;
end
$$;

alter table public.core_accounts alter column tenant_id set not null;
alter table public.core_contacts alter column tenant_id set not null;
alter table public.core_sites alter column tenant_id set not null;
alter table public.core_leads alter column tenant_id set not null;
alter table public.core_pipeline alter column tenant_id set not null;
alter table public.core_quotes alter column tenant_id set not null;
alter table public.core_jobs alter column tenant_id set not null;

alter table public.core_accounts add constraint core_accounts_tenant_id_fkey foreign key (tenant_id) references public.control_tenants(id) on delete restrict;
alter table public.core_contacts add constraint core_contacts_tenant_id_fkey foreign key (tenant_id) references public.control_tenants(id) on delete restrict;
alter table public.core_sites add constraint core_sites_tenant_id_fkey foreign key (tenant_id) references public.control_tenants(id) on delete restrict;
alter table public.core_leads add constraint core_leads_tenant_id_fkey foreign key (tenant_id) references public.control_tenants(id) on delete restrict;
alter table public.core_pipeline add constraint core_pipeline_tenant_id_fkey foreign key (tenant_id) references public.control_tenants(id) on delete restrict;
alter table public.core_quotes add constraint core_quotes_tenant_id_fkey foreign key (tenant_id) references public.control_tenants(id) on delete restrict;
alter table public.core_jobs add constraint core_jobs_tenant_id_fkey foreign key (tenant_id) references public.control_tenants(id) on delete restrict;

create index core_accounts_tenant_id_idx on public.core_accounts (tenant_id);
create index core_contacts_tenant_id_idx on public.core_contacts (tenant_id);
create index core_sites_tenant_id_idx on public.core_sites (tenant_id);
create index core_leads_tenant_id_idx on public.core_leads (tenant_id);
create index core_pipeline_tenant_id_idx on public.core_pipeline (tenant_id);
create index core_quotes_tenant_id_idx on public.core_quotes (tenant_id);
create index core_jobs_tenant_id_idx on public.core_jobs (tenant_id);

-- Replace all existing policies on the seven principal Core tables. The
-- current policy names are not relied upon, which keeps this migration safe
-- across the known restoration-policy naming drift.
do $$
declare
  v_table text;
  v_policy record;
begin
  foreach v_table in array array[
    'core_accounts', 'core_contacts', 'core_sites', 'core_leads',
    'core_pipeline', 'core_quotes', 'core_jobs'
  ]
  loop
    for v_policy in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = v_table
    loop
      execute format('drop policy %I on public.%I', v_policy.policyname, v_table);
    end loop;

    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on public.%I from anon, authenticated', v_table);
    execute format('grant select, insert, update, delete on public.%I to authenticated', v_table);
    execute format(
      'create policy %I on public.%I for all to authenticated using (exists (select 1 from public.control_tenant_memberships m where m.tenant_id = %I.tenant_id and m.user_id = (select auth.uid()) and m.status = ''active'')) with check (exists (select 1 from public.control_tenant_memberships m where m.tenant_id = %I.tenant_id and m.user_id = (select auth.uid()) and m.status = ''active''))',
      v_table || '_tenant_member_all', v_table, v_table, v_table
    );
  end loop;
end
$$;

-- Views execute with the caller's rights so underlying Core RLS remains in
-- force. All four remain quarantined until every supporting relation receives
-- an explicit tenant model; security_invoker alone cannot protect a directly
-- accessible unscoped supporting table.
alter view public.core_job_margin_summary set (security_invoker = true);
alter view public.core_job_revenue_control set (security_invoker = true);
alter view public.core_method_attempt_summary set (security_invoker = true);
alter view public.core_pipeline_funnel_summary set (security_invoker = true);

revoke all on public.core_job_margin_summary from anon, authenticated;
revoke all on public.core_job_revenue_control from anon, authenticated;
revoke all on public.core_method_attempt_summary from anon, authenticated;
revoke all on public.core_pipeline_funnel_summary from anon, authenticated;

-- Supporting relations are not yet tenant-bound. Remove application-role
-- access rather than leave a side door around the principal-table policies.
revoke all on public.core_job_costs from anon, authenticated;
revoke all on public.core_job_handovers from anon, authenticated;
revoke all on public.core_job_referrals from anon, authenticated;
revoke all on public.core_job_value_adjustments from anon, authenticated;
revoke all on public.core_method_activity_logs from anon, authenticated;
revoke all on public.revenue_events from anon, authenticated;

-- The legacy Core functions do not populate the new mandatory tenant key.
-- Quarantine them until CONTROL-001B replaces them with tenant-aware forms.
revoke execute on function public.convert_lead_to_opportunity(uuid, text, text, text, text, text, text, numeric) from public, anon, authenticated;
revoke execute on function public.create_quote_from_pipeline(uuid, numeric, text, text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.promote_referral_to_lead(uuid, text, text, text, text, text, text) from public, anon, authenticated;

do $$
declare
  v_core_rows integer;
begin
  select
    (select count(*) from public.core_accounts) +
    (select count(*) from public.core_contacts) +
    (select count(*) from public.core_sites) +
    (select count(*) from public.core_leads) +
    (select count(*) from public.core_pipeline) +
    (select count(*) from public.core_quotes) +
    (select count(*) from public.core_jobs)
  into v_core_rows;

  if v_core_rows <> 67 then
    raise exception 'CONTROL-001A postflight failed: expected 67 principal Core rows, found %', v_core_rows;
  end if;

  if exists (
    select 1 from public.core_accounts where tenant_id is null
    union all select 1 from public.core_contacts where tenant_id is null
    union all select 1 from public.core_sites where tenant_id is null
    union all select 1 from public.core_leads where tenant_id is null
    union all select 1 from public.core_pipeline where tenant_id is null
    union all select 1 from public.core_quotes where tenant_id is null
    union all select 1 from public.core_jobs where tenant_id is null
  ) then
    raise exception 'CONTROL-001A postflight failed: null principal tenant identity';
  end if;
end
$$;

commit;

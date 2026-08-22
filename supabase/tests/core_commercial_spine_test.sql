begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '82000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'bos-e01-owner-a@example.test', '',
    now(), now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '82000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'bos-e01-owner-b@example.test', '',
    now(), now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '82000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'bos-e01-staff-a@example.test', '',
    now(), now(), now(), '', '', '', ''
  );

insert into public.control_tenants (id, name, lifecycle_status)
values
  ('82000000-0000-0000-0000-000000000011', 'BOS-E01 Tenant A', 'fixture'),
  ('82000000-0000-0000-0000-000000000012', 'BOS-E01 Tenant B', 'fixture');

insert into public.control_tenant_memberships (tenant_id, user_id, role, status)
values
  (
    '82000000-0000-0000-0000-000000000011',
    '82000000-0000-0000-0000-000000000001',
    'owner', 'active'
  ),
  (
    '82000000-0000-0000-0000-000000000012',
    '82000000-0000-0000-0000-000000000002',
    'owner', 'active'
  ),
  (
    '82000000-0000-0000-0000-000000000011',
    '82000000-0000-0000-0000-000000000003',
    'staff', 'active'
  );

select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

create temporary table bos_e01_intake on commit drop as
select * from public.core_create_commercial_intake(
  '82000000-0000-0000-0000-000000000011',
  'BOS-E01 Account',
  'Authorised Contact',
  '0400000000',
  'contact@example.test',
  'Primary Site',
  '1 Test Street',
  'Qualified enquiry',
  'referral',
  'Recurring service requirement',
  1000
);

select is(
  (select count(*)::integer from bos_e01_intake),
  1,
  'owner creates one complete Account-to-Opportunity intake atomically'
);

select is(
  (
    select industry_code
    from public.core_leads
    where id = (select lead_id from bos_e01_intake)
  ),
  null::text,
  'new Core Lead has no Cleaning default'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (
    select count(*)::bigint
    from public.core_accounts
    where tenant_id = '82000000-0000-0000-0000-000000000011'
  ),
  0::bigint,
  'Tenant B owner reads no Tenant A Account rows'
);

select throws_ok(
  $$select public.core_create_commercial_intake(
    '82000000-0000-0000-0000-000000000011',
    'Cross-Tenant Account', 'Contact', '0400000001', null,
    'Site', '2 Test Street', 'Lead', 'other', 'Requirement', 100
  )$$,
  '42501',
  'Commercial intake is not authorised.',
  'a non-member cannot create Tenant A commercial records'
);

reset role;
create or replace function pg_temp.bos_e01_attempt_cross_tenant_contact(
  target_tenant uuid,
  target_account uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  insert into public.core_contacts (tenant_id, account_id, name)
  values (target_tenant, target_account, 'Cross-Tenant Contact');
end;
$function$;

select throws_ok(
  format(
    'select pg_temp.bos_e01_attempt_cross_tenant_contact(%L, %L)',
    '82000000-0000-0000-0000-000000000012',
    (select account_id from bos_e01_intake)
  ),
  '23503',
  null,
  'composite foreign key rejects a cross-Tenant Account reference'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

create temporary table bos_e01_scope on commit drop as
select public.core_create_scope_version(
  '82000000-0000-0000-0000-000000000011',
  (select opportunity_id from bos_e01_intake),
  'Universal service scope',
  '{"service_result":"agreed outcome"}'::jsonb
) as id;

select ok(
  (select id is not null from bos_e01_scope),
  'active staff may draft an authorised Scope version'
);

create temporary table bos_e01_quote on commit drop as
select public.core_create_quote_version(
  '82000000-0000-0000-0000-000000000011',
  (select opportunity_id from bos_e01_intake),
  (select id from bos_e01_scope),
  'AUD', 1000, 100
) as id;

select ok(
  (select id is not null from bos_e01_quote),
  'active staff may draft an authorised Quote version'
);

select throws_ok(
  format(
    'select public.core_issue_quote_version(%L, %L)',
    '82000000-0000-0000-0000-000000000011',
    (select id from bos_e01_quote)
  ),
  '42501',
  'Quote issue is not authorised.',
  'staff cannot issue a Quote'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  format(
    'select public.core_issue_quote_version(%L, %L)',
    '82000000-0000-0000-0000-000000000011',
    (select id from bos_e01_quote)
  ),
  'owner may issue the latest Quote version'
);

create temporary table bos_e01_baseline on commit drop as
select public.core_record_quote_acceptance(
  '82000000-0000-0000-0000-000000000011',
  (select id from bos_e01_quote),
  'Authorised Contact',
  'customer-acceptance:test-reference',
  (select contact_id from bos_e01_intake)
) as id;

select ok(
  (select id is not null from bos_e01_baseline),
  'acceptance creates one immutable Commercial Baseline'
);

select is(
  (
    select count(*)::integer
    from public.core_jobs
    where commercial_baseline_id = (select id from bos_e01_baseline)
  ),
  0,
  'customer acceptance does not itself create a Job'
);

select is(
  public.core_activate_job_from_baseline(
    '82000000-0000-0000-0000-000000000011',
    (select id from bos_e01_baseline),
    true, false, true, true,
    'Funding is not confirmed'
  ),
  null::uuid,
  'missing funding blocks Job activation'
);

create temporary table bos_e01_job on commit drop as
select public.core_activate_job_from_baseline(
  '82000000-0000-0000-0000-000000000011',
  (select id from bos_e01_baseline),
  true, true, true, true,
  'All readiness facts confirmed'
) as id;

select ok(
  (select id is not null from bos_e01_job),
  'all four readiness facts activate one Job'
);

select is(
  public.core_activate_job_from_baseline(
    '82000000-0000-0000-0000-000000000011',
    (select id from bos_e01_baseline),
    true, true, true, true,
    'Safe retry'
  ),
  (select id from bos_e01_job),
  'Job activation retry is idempotent'
);

reset role;
create or replace function pg_temp.bos_e01_attempt_scope_rewrite(
  target_scope_version uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  update public.core_scope_versions
  set summary = 'Silent rewrite'
  where id = target_scope_version;
end;
$function$;

select throws_ok(
  format(
    'select pg_temp.bos_e01_attempt_scope_rewrite(%L)',
    (select id from bos_e01_scope)
  ),
  '42501',
  'core_scope_versions records are append-only',
  'an approved Scope version cannot be silently rewritten'
);

select * from finish();
rollback;

begin;

create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '83000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'bos-e02-owner-a@example.test', '',
    now(), now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '83000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'bos-e02-owner-b@example.test', '',
    now(), now(), now(), '', '', '', ''
  );

insert into public.control_tenants (id, name, lifecycle_status)
values
  ('83000000-0000-0000-0000-000000000011', 'BOS-E02 Tenant A', 'fixture'),
  ('83000000-0000-0000-0000-000000000012', 'BOS-E02 Tenant B', 'fixture');

insert into public.control_tenant_memberships (tenant_id, user_id, role, status)
values
  ('83000000-0000-0000-0000-000000000011', '83000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('83000000-0000-0000-0000-000000000012', '83000000-0000-0000-0000-000000000002', 'owner', 'active');

select set_config(
  'request.jwt.claims',
  '{"sub":"83000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

create temporary table bos_e02_intake on commit drop as
select * from public.core_create_commercial_intake(
  '83000000-0000-0000-0000-000000000011',
  'Operational Account', 'Authorised Contact', '0400000000', null,
  'Operational Site', '1 Event Street', 'Operational enquiry', 'referral',
  'Recurring universal service', 1000
);

create temporary table bos_e02_scope on commit drop as
select public.core_create_scope_version(
  '83000000-0000-0000-0000-000000000011',
  (select opportunity_id from bos_e02_intake),
  'Universal recurring scope', '{"outcome":"agreed"}'::jsonb
) as id;

create temporary table bos_e02_quote on commit drop as
select public.core_create_quote_version(
  '83000000-0000-0000-0000-000000000011',
  (select opportunity_id from bos_e02_intake),
  (select id from bos_e02_scope), 'AUD', 1000, 100
) as id;

select public.core_issue_quote_version(
  '83000000-0000-0000-0000-000000000011',
  (select id from bos_e02_quote)
);

create temporary table bos_e02_baseline on commit drop as
select public.core_record_quote_acceptance(
  '83000000-0000-0000-0000-000000000011',
  (select id from bos_e02_quote), 'Authorised Contact',
  'customer-acceptance:bos-e02', (select contact_id from bos_e02_intake)
) as id;

create temporary table bos_e02_job on commit drop as
select public.core_activate_job_from_baseline(
  '83000000-0000-0000-0000-000000000011',
  (select id from bos_e02_baseline), true, true, true, true,
  'Operational readiness confirmed'
) as id;

reset role;
create or replace function pg_temp.bos_e02_seed_worker()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_worker_id uuid;
begin
  insert into public.core_workers (tenant_id, display_name)
  values ('83000000-0000-0000-0000-000000000011', 'Qualified Worker')
  returning id into v_worker_id;
  return v_worker_id;
end;
$function$;
set local role authenticated;
create temporary table bos_e02_worker on commit drop as
select pg_temp.bos_e02_seed_worker() as id;

reset role;
create or replace function pg_temp.bos_e02_seed_overhead()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_overhead_id uuid;
begin
  insert into public.core_overhead_classes (tenant_id, code, name, created_by)
  values (
    '83000000-0000-0000-0000-000000000011', 'MANAGEMENT',
    'Management and administration', '83000000-0000-0000-0000-000000000001'
  ) returning id into v_overhead_id;
  return v_overhead_id;
end;
$function$;
set local role authenticated;
create temporary table bos_e02_overhead on commit drop as
select pg_temp.bos_e02_seed_overhead() as id;

create temporary table bos_e02_schedule_v1 on commit drop as
select public.core_create_schedule_version(
  '83000000-0000-0000-0000-000000000011',
  (select id from bos_e02_job), (select site_id from bos_e02_intake),
  'Australia/Brisbane', '2026-08-24', '{"frequency":"weekly"}'::jsonb,
  '08:00'::time, 120, 'Initial recurring schedule'
) as id;

select ok((select id is not null from bos_e02_schedule_v1),
  'an activated Job receives an immutable recurring Schedule version');

create temporary table bos_e02_event on commit drop as
select public.core_create_service_event(
  '83000000-0000-0000-0000-000000000011',
  (select id from bos_e02_schedule_v1),
  '2026-08-24 08:00:00+10', '2026-08-24 10:00:00+10'
) as id;

select ok((select id is not null from bos_e02_event),
  'a Schedule version generates a governed Service Event');

create temporary table bos_e02_shift on commit drop as
select public.core_assign_worker_to_event(
  '83000000-0000-0000-0000-000000000011',
  (select id from bos_e02_event), (select id from bos_e02_worker), 0
) as id;

select ok((select id is not null from bos_e02_shift),
  'a qualified Worker is assigned to the Service Event');

select throws_ok(
  format('select public.core_record_shift_closeout(%L, %L)',
    '83000000-0000-0000-0000-000000000011', (select id from bos_e02_shift)),
  '42501', 'Clock-off must stop paid time before closeout begins.',
  'closeout cannot begin while paid time remains open'
);

create temporary table bos_e02_time on commit drop as
select public.core_clock_off_shift(
  '83000000-0000-0000-0000-000000000011',
  (select id from bos_e02_shift),
  '2026-08-24 08:02:00+10', '2026-08-24 10:05:00+10', 0
) as id;

select ok((select id is not null from bos_e02_time),
  'clock-off freezes actual paid time before questions');

create temporary table bos_e02_closeout on commit drop as
select public.core_record_shift_closeout(
  '83000000-0000-0000-0000-000000000011',
  (select id from bos_e02_shift), 'Service completed',
  '[{"description":"Additional consumable","quantity":5,"unit":"item","evidence_reference":"photo:test"}]'::jsonb,
  '[{"description":"Quality defect observed","evidence_reference":"photo:defect"}]'::jsonb,
  '[{"description":"Customer requested additional area","evidence_reference":"note:request"}]'::jsonb
) as id;

select ok((select id is not null from bos_e02_closeout),
  'closeout records operational evidence after clock-off');
select is((select status from public.core_service_events where id = (select id from bos_e02_event)),
  'completed', 'one completed Shift completes the Service Event');
select is((select count(*)::integer from public.core_extra_charge_candidates where closeout_id = (select id from bos_e02_closeout)),
  1, 'Extra Charge candidate is retained for downstream review');
select is((select count(*)::integer from information_schema.columns where table_schema = 'public' and table_name = 'core_extra_charge_candidates' and column_name in ('unit_price', 'sell_price', 'customer_price', 'margin_percent')),
  0, 'Extra Charge evidence carries no customer-price authority');
select is((select count(*)::integer from public.core_quality_cases where closeout_id = (select id from bos_e02_closeout) and case_type = 'quality_defect'),
  1, 'quality defect remains a quality record');
select is((select count(*)::integer from public.core_additional_scope_candidates where closeout_id = (select id from bos_e02_closeout)),
  1, 'additional scope remains separate from quality and billing');
select lives_ok(
  format('select public.core_record_rectification(%L, %L, %L, %L, %L)',
    '83000000-0000-0000-0000-000000000011', (select id from bos_e02_closeout),
    (select id from public.core_quality_cases where closeout_id = (select id from bos_e02_closeout) and case_type = 'quality_defect'),
    'Rectification evidence recorded', 'photo:rectification'),
  'rectification explicitly references a quality defect'
);

create temporary table bos_e02_schedule_v2 on commit drop as
select public.core_create_schedule_version(
  '83000000-0000-0000-0000-000000000011',
  (select id from bos_e02_job), (select site_id from bos_e02_intake),
  'Australia/Brisbane', '2026-08-31', '{"frequency":"fortnightly"}'::jsonb,
  '09:00'::time, 90, 'Customer changed future cadence',
  (select schedule_series_id from public.core_schedule_versions where id = (select id from bos_e02_schedule_v1))
) as id;

select is((select status from public.core_service_events where id = (select id from bos_e02_event)),
  'completed', 'new Schedule version does not rewrite a completed Event');
select is((select count(*)::integer from public.core_schedule_versions where schedule_series_id = (select schedule_series_id from public.core_schedule_versions where id = (select id from bos_e02_schedule_v1))),
  2, 'schedule change appends a second version');

select throws_ok(
  format('select public.core_create_service_event(%L, %L, %L, %L)',
    '83000000-0000-0000-0000-000000000011', (select id from bos_e02_schedule_v1),
    '2026-09-07 08:00:00+10', '2026-09-07 10:00:00+10'),
  '42501', 'Current Schedule version not found or Event is outside its effective period.',
  'a superseded Schedule version cannot generate new Events'
);

create temporary table bos_e02_conflict_event on commit drop as
select public.core_create_service_event(
  '83000000-0000-0000-0000-000000000011', (select id from bos_e02_schedule_v2),
  '2026-09-07 09:00:00+10', '2026-09-07 11:00:00+10'
) as id;

select lives_ok(
  format('select public.core_assign_worker_to_event(%L, %L, %L, 0)',
    '83000000-0000-0000-0000-000000000011',
    (select id from bos_e02_conflict_event), (select id from bos_e02_worker)),
  'completed work no longer blocks later scheduling evidence'
);

create temporary table bos_e02_overhead_shift on commit drop as
select public.core_create_overhead_shift(
  '83000000-0000-0000-0000-000000000011', (select id from bos_e02_overhead),
  (select id from bos_e02_worker), '2026-09-21 08:00:00+10',
  '2026-09-21 09:00:00+10', 'Australia/Brisbane', 0
) as id;
select ok((select id is not null from bos_e02_overhead_shift),
  'governed overhead work can be scheduled without inventing a Job');
select ok((select job_id is null and overhead_class_id is not null from public.core_roster_shifts where id = (select id from bos_e02_overhead_shift)),
  'overhead Shift satisfies the exclusive allocation rule');

create temporary table bos_e02_future_event on commit drop as
select public.core_create_service_event(
  '83000000-0000-0000-0000-000000000011', (select id from bos_e02_schedule_v2),
  '2026-08-31 09:00:00+10', '2026-08-31 10:30:00+10'
) as id;

reset role;
create or replace function pg_temp.bos_e02_seed_requirement(target_event uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  insert into public.core_service_event_requirements (tenant_id, service_event_id, credential_code, created_by)
  values ('83000000-0000-0000-0000-000000000011', target_event, 'site-induction', '83000000-0000-0000-0000-000000000001');
end;
$function$;
select pg_temp.bos_e02_seed_requirement((select id from bos_e02_future_event));
set local role authenticated;

select throws_ok(
  format('select public.core_assign_worker_to_event(%L, %L, %L, 0)',
    '83000000-0000-0000-0000-000000000011',
    (select id from bos_e02_future_event), (select id from bos_e02_worker)),
  '42501', 'Worker lacks a current required credential.',
  'missing credential blocks assignment'
);

create temporary table bos_e02_capacity_event_a on commit drop as
select public.core_create_service_event(
  '83000000-0000-0000-0000-000000000011', (select id from bos_e02_schedule_v2),
  '2026-09-14 09:00:00+10', '2026-09-14 10:30:00+10'
) as id;
create temporary table bos_e02_capacity_event_b on commit drop as
select public.core_create_service_event(
  '83000000-0000-0000-0000-000000000011', (select id from bos_e02_schedule_v2),
  '2026-09-14 10:00:00+10', '2026-09-14 11:00:00+10'
) as id;

select lives_ok(
  format('select public.core_assign_worker_to_event(%L, %L, %L, 0)',
    '83000000-0000-0000-0000-000000000011',
    (select id from bos_e02_capacity_event_a), (select id from bos_e02_worker)),
  'available Worker may take a future assignment'
);
select throws_ok(
  format('select public.core_assign_worker_to_event(%L, %L, %L, 0)',
    '83000000-0000-0000-0000-000000000011',
    (select id from bos_e02_capacity_event_b), (select id from bos_e02_worker)),
  '42501', 'Worker has a conflicting assignment.',
  'overlapping live assignment blocks Worker capacity'
);

select throws_ok(
  $$insert into public.core_extra_charge_candidates (
      tenant_id, closeout_id, description, quantity, unit, captured_by
    ) values (
      '83000000-0000-0000-0000-000000000011',
      '83000000-0000-0000-0000-000000000099', 'Bypass', 1, 'item',
      '83000000-0000-0000-0000-000000000001'
    )$$,
  '42501', null,
  'authenticated clients cannot bypass governed closeout functions'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"83000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is((select count(*)::bigint from public.core_service_events where tenant_id = '83000000-0000-0000-0000-000000000011'),
  0::bigint, 'Tenant B cannot read Tenant A Service Events');
select throws_ok(
  format('select public.core_create_service_event(%L, %L, %L, %L)',
    '83000000-0000-0000-0000-000000000011', (select id from bos_e02_schedule_v2),
    '2026-09-14 09:00:00+10', '2026-09-14 10:30:00+10'),
  '42501', 'Service Event creation is not authorised.',
  'Tenant B cannot create Tenant A Service Events'
);

reset role;
create or replace function pg_temp.bos_e02_rewrite_completed_event(target_event uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  update public.core_service_events set status = 'cancelled', version = version + 1
  where id = target_event;
end;
$function$;

select throws_ok(
  format('select pg_temp.bos_e02_rewrite_completed_event(%L)', (select id from bos_e02_event)),
  '42501', 'Completed Service Events are immutable.',
  'completed Service Event cannot be silently rewritten'
);

select * from finish();
rollback;

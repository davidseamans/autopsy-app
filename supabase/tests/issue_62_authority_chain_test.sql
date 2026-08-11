begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '62000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'issue62-a@example.test', '',
    now(), now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '62000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'issue62-b@example.test', '',
    now(), now(), now(), '', '', '', ''
  );

insert into public.stage_definitions (
  stage_code, stage_number, stage_name, stage_label, dragon_name, purpose,
  user_promise, unlock_condition, is_mvp_scope, display_order
) values
  (
    'stage_1_first_five_jobs', 1, 'First Five Jobs', 'First Five Jobs',
    'Issue 62 Stage 1 fixture', 'Prove controlled delivery.',
    'Collect bounded operating evidence.', 'Authorised Autopsy gate.', true, 1
  ),
  (
    'stage_2_core_foundation', 2, 'Core Foundation', 'Core Foundation',
    'Issue 62 Stage 2 fixture', 'Prove the stage boundary.',
    'Keep Core separately governed.', 'Explicit Core admission.', false, 2
  );

insert into public.initial_conversations (id, user_id, industry_context)
values (
  '62000000-0000-0000-0000-000000000011',
  '62000000-0000-0000-0000-000000000001',
  'cleaning'
);
insert into public.autopsy_orders (id, user_id, conversation_id, status)
values (
  '62000000-0000-0000-0000-000000000021',
  '62000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000011',
  'paid'
);
insert into public.autopsy_entitlements (id, user_id, order_id)
values (
  '62000000-0000-0000-0000-000000000031',
  '62000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000021'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"62000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table issue62_runs (attempt integer primary key, run_id uuid not null);
insert into issue62_runs
values (
  1,
  public.create_authorized_autopsy_run(
    'Issue 62 proof', 'cleaning', 'startup', 'issue62-a@example.test', 'unproven'
  )
);
insert into issue62_runs
values (
  2,
  public.create_authorized_autopsy_run(
    'Ignored retry payload', 'other', 'startup', 'issue62-a@example.test', 'unproven'
  )
);

select is(
  (select count(distinct run_id)::integer from issue62_runs),
  1,
  'safe retry returns the one entitlement-bound in-progress run'
);
select is(
  (
    select count(*)::integer
    from public.autopsy_runs
    where owner_user_id = '62000000-0000-0000-0000-000000000001'
  ),
  1,
  'one paid entitlement creates exactly one Autopsy run'
);
select is(
  (
    select status
    from public.autopsy_entitlements
    where id = '62000000-0000-0000-0000-000000000031'
  ),
  'consumed',
  'the entitlement is consumed atomically'
);
select is(
  (
    select autopsy_run_id
    from public.autopsy_entitlements
    where id = '62000000-0000-0000-0000-000000000031'
  ),
  (select run_id from issue62_runs where attempt = 1),
  'the consumed entitlement is bound to the created run'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"62000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.create_authorized_autopsy_run(
    'Cross-owner attempt', 'cleaning', 'startup', 'issue62-b@example.test', 'unproven'
  )$$,
  '42501',
  'No unused paid Autopsy admission is available.',
  'another user cannot consume or resume the entitlement'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"62000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
update public.autopsy_runs
set status = 'abandoned', archived_at = now(), archive_reason = 'Issue 62 retry proof'
where id = (select run_id from issue62_runs where attempt = 1);
select throws_ok(
  $$select public.create_authorized_autopsy_run(
    'Reuse attempt', 'cleaning', 'startup', 'issue62-a@example.test', 'unproven'
  )$$,
  '42501',
  'No unused paid Autopsy admission is available.',
  'a closed run cannot turn a consumed entitlement into a new admission'
);

insert into public.initial_conversations (id, user_id, industry_context)
values (
  '62000000-0000-0000-0000-000000000019',
  '62000000-0000-0000-0000-000000000001',
  'cleaning'
);
insert into public.autopsy_orders (id, user_id, conversation_id, status)
values (
  '62000000-0000-0000-0000-000000000029',
  '62000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000019',
  'paid'
);
select throws_ok(
  format(
    'insert into public.autopsy_entitlements '
    '(id, user_id, order_id, status, autopsy_run_id, consumed_at) values '
    '(''62000000-0000-0000-0000-000000000039'', '
    '''62000000-0000-0000-0000-000000000001'', '
    '''62000000-0000-0000-0000-000000000029'', ''consumed'', %L, now())',
    (select run_id from issue62_runs where attempt = 1)
  ),
  '23505'
);

insert into public.stage_progress (
  id, user_id, current_stage_code, current_gate_status, autopsy_run_id
) values (
  '62000000-0000-0000-0000-000000000041',
  '62000000-0000-0000-0000-000000000001',
  'stage_1_first_five_jobs',
  'available',
  (select run_id from issue62_runs where attempt = 1)
);

select set_config(
  'request.jwt.claims',
  '{"sub":"62000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select ok(
  public.get_authorized_stage1_admission(
    (select run_id from issue62_runs where attempt = 1)
  ),
  'the run owner is admitted when the Stage 1 gate is available'
);
update public.stage_progress set current_gate_status = 'in_progress'
where id = '62000000-0000-0000-0000-000000000041';
select ok(
  public.get_authorized_stage1_admission(
    (select run_id from issue62_runs where attempt = 1)
  ),
  'the run owner is admitted when the Stage 1 gate is in progress'
);
update public.stage_progress set current_gate_status = 'passed'
where id = '62000000-0000-0000-0000-000000000041';
select ok(
  public.get_authorized_stage1_admission(
    (select run_id from issue62_runs where attempt = 1)
  ),
  'the run owner retains Stage 1 admission when the gate has passed'
);

update public.stage_progress set current_gate_status = 'locked'
where id = '62000000-0000-0000-0000-000000000041';
select isnt(
  public.get_authorized_stage1_admission(
    (select run_id from issue62_runs where attempt = 1)
  ), true,
  'a locked Stage 1 gate denies admission'
);
update public.stage_progress set current_gate_status = 'blocked'
where id = '62000000-0000-0000-0000-000000000041';
select isnt(
  public.get_authorized_stage1_admission(
    (select run_id from issue62_runs where attempt = 1)
  ), true,
  'a blocked Stage 1 gate denies admission'
);
update public.stage_progress set current_gate_status = 'failed'
where id = '62000000-0000-0000-0000-000000000041';
select isnt(
  public.get_authorized_stage1_admission(
    (select run_id from issue62_runs where attempt = 1)
  ), true,
  'a failed Stage 1 gate denies admission'
);
update public.stage_progress set current_gate_status = 'superseded'
where id = '62000000-0000-0000-0000-000000000041';
select isnt(
  public.get_authorized_stage1_admission(
    (select run_id from issue62_runs where attempt = 1)
  ), true,
  'a superseded Stage 1 gate denies admission'
);

update public.stage_progress set current_gate_status = 'available'
where id = '62000000-0000-0000-0000-000000000041';
select set_config(
  'request.jwt.claims',
  '{"sub":"62000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select isnt(
  public.get_authorized_stage1_admission(
    (select run_id from issue62_runs where attempt = 1)
  ), true,
  'a query or localStorage-selected run id cannot admit a different owner'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"62000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
delete from public.stage_progress
where id = '62000000-0000-0000-0000-000000000041';
select isnt(
  public.get_authorized_stage1_admission(
    (select run_id from issue62_runs where attempt = 1)
  ), true,
  'an owned run without a progression row is denied'
);
insert into public.stage_progress (
  id, user_id, current_stage_code, current_gate_status, autopsy_run_id
) values (
  '62000000-0000-0000-0000-000000000042',
  '62000000-0000-0000-0000-000000000001',
  'stage_2_core_foundation',
  'available',
  (select run_id from issue62_runs where attempt = 1)
);
select isnt(
  public.get_authorized_stage1_admission(
    (select run_id from issue62_runs where attempt = 1)
  ), true,
  'an allowed status on a different stage cannot grant Stage 1 admission'
);
select isnt(
  has_function_privilege(
    'anon', 'public.get_authorized_stage1_admission(uuid)', 'EXECUTE'
  ), true,
  'anon cannot execute the Stage 1 admission contract'
);

select * from finish();
rollback;

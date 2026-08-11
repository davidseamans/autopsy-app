begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

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

select * from finish();
rollback;

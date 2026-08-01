-- Business Identity is user-owned, verified by the server against ABN Lookup,
-- and is a hard prerequisite for Stage 1 mutations. The historic singleton row
-- has no trustworthy owner, so it remains quarantined with owner_user_id null.

alter table public.business_identity_profile
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists source_autopsy_run_id uuid references public.autopsy_runs(id) on delete set null,
  add column if not exists verification_source text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.business_identity_profile'::regclass
      and conname = 'business_identity_profile_owner_user_id_key'
  ) then
    alter table public.business_identity_profile
      add constraint business_identity_profile_owner_user_id_key unique (owner_user_id);
  end if;
end $$;

alter table public.business_identity_profile enable row level security;
alter table public.business_identity_audit enable row level security;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('business_identity_profile', 'business_identity_audit')
  loop
    execute format('drop policy if exists %I on public.%I', policy_row.policyname, policy_row.tablename);
  end loop;
end $$;

revoke all on public.business_identity_profile from anon, authenticated;
revoke all on public.business_identity_audit from anon, authenticated;
grant select on public.business_identity_profile to authenticated;
grant select on public.business_identity_audit to authenticated;
grant all on public.business_identity_profile to service_role;
grant all on public.business_identity_audit to service_role;

create policy business_identity_profile_select_own
  on public.business_identity_profile
  for select to authenticated
  using (owner_user_id = (select auth.uid()));

create policy business_identity_audit_select_own
  on public.business_identity_audit
  for select to authenticated
  using (
    exists (
      select 1
      from public.business_identity_profile profile
      where profile.id = business_identity_audit.business_identity_profile_id
        and profile.owner_user_id = (select auth.uid())
    )
  );

create or replace function public.audit_business_identity_critical_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.business_name is distinct from new.business_name then
    insert into public.business_identity_audit (
      business_identity_profile_id, field_name, old_value, new_value, changed_by
    ) values (new.id, 'business_name', old.business_name, new.business_name, new.owner_user_id);
  end if;
  if old.abn is distinct from new.abn then
    insert into public.business_identity_audit (
      business_identity_profile_id, field_name, old_value, new_value, changed_by
    ) values (new.id, 'abn', old.abn, new.abn, new.owner_user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists business_identity_critical_change_audit on public.business_identity_profile;
create trigger business_identity_critical_change_audit
after update of business_name, abn on public.business_identity_profile
for each row execute function public.audit_business_identity_critical_change();

create or replace function public.current_user_has_verified_business_identity()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.business_identity_profile profile
    where profile.owner_user_id = (select auth.uid())
      and profile.business_name <> ''
      and profile.contact_name <> ''
      and profile.phone <> ''
      and profile.email <> ''
      and profile.abn <> ''
      and profile.abn_checksum_valid is true
      and lower(profile.abr_entity_status) = 'active'
      and profile.abr_gst_registered is true
      and profile.verification_source = 'abr_web_services'
  );
$$;

revoke all on function public.current_user_has_verified_business_identity() from public, anon;
grant execute on function public.current_user_has_verified_business_identity() to authenticated, service_role;

create or replace function public.current_user_can_use_stage1_run(p_run_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.autopsy_runs run
    where run.id = p_run_id
      and run.owner_user_id = (select auth.uid())
      and run.status = 'completed'
      and run.hard_fail_triggered is false
      and coalesce(run.final_verdict, run.verdict_name) = 'Ready for Test Run'
  );
$$;

revoke all on function public.current_user_can_use_stage1_run(uuid) from public, anon;
grant execute on function public.current_user_can_use_stage1_run(uuid) to authenticated, service_role;

-- Replace every Stage 1 mutation policy. Select remains owner-scoped and the
-- summary remains viewable while setup is incomplete.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'stage1_leads', 'stage1_quotes', 'stage1_jobs', 'stage1_revenue_events',
        'stage1_job_costs', 'stage1_business_expenses', 'stage1_reflections'
      )
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
  loop
    execute format('drop policy if exists %I on public.%I', policy_row.policyname, policy_row.tablename);
  end loop;
end $$;

create policy stage1_leads_verified_insert on public.stage1_leads
  for insert to authenticated with check (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  );
create policy stage1_leads_verified_update on public.stage1_leads
  for update to authenticated using (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  ) with check (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  );
create policy stage1_leads_verified_delete on public.stage1_leads
  for delete to authenticated using (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  );

create policy stage1_quotes_verified_insert on public.stage1_quotes
  for insert to authenticated with check (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  );
create policy stage1_quotes_verified_update on public.stage1_quotes
  for update to authenticated using (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  ) with check (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  );
create policy stage1_quotes_verified_delete on public.stage1_quotes
  for delete to authenticated using (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  );

create policy stage1_jobs_verified_insert on public.stage1_jobs
  for insert to authenticated with check (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  );
create policy stage1_jobs_verified_update on public.stage1_jobs
  for update to authenticated using (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  ) with check (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  );
create policy stage1_jobs_verified_delete on public.stage1_jobs
  for delete to authenticated using (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  );

create policy stage1_reflections_verified_insert on public.stage1_reflections
  for insert to authenticated with check (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  );
create policy stage1_reflections_verified_update on public.stage1_reflections
  for update to authenticated using (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  ) with check (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  );
create policy stage1_reflections_verified_delete on public.stage1_reflections
  for delete to authenticated using (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  );

create policy stage1_revenue_events_verified_insert on public.stage1_revenue_events
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and public.current_user_has_verified_business_identity()
    and exists (select 1 from public.stage1_jobs job where job.id = stage1_revenue_events.stage1_job_id and job.created_by = (select auth.uid()) and public.current_user_can_use_stage1_run(job.autopsy_run_id))
  );
create policy stage1_revenue_events_verified_update on public.stage1_revenue_events
  for update to authenticated using (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and exists (select 1 from public.stage1_jobs job where job.id = stage1_revenue_events.stage1_job_id and job.created_by = (select auth.uid()) and public.current_user_can_use_stage1_run(job.autopsy_run_id))
  ) with check (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and exists (select 1 from public.stage1_jobs job where job.id = stage1_revenue_events.stage1_job_id and job.created_by = (select auth.uid()) and public.current_user_can_use_stage1_run(job.autopsy_run_id))
  );
create policy stage1_revenue_events_verified_delete on public.stage1_revenue_events
  for delete to authenticated using (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and exists (select 1 from public.stage1_jobs job where job.id = stage1_revenue_events.stage1_job_id and job.created_by = (select auth.uid()) and public.current_user_can_use_stage1_run(job.autopsy_run_id))
  );

create policy stage1_job_costs_verified_insert on public.stage1_job_costs
  for insert to authenticated with check (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and exists (select 1 from public.stage1_jobs job where job.id = stage1_job_costs.stage1_job_id and job.created_by = (select auth.uid()) and public.current_user_can_use_stage1_run(job.autopsy_run_id))
  );
create policy stage1_job_costs_verified_update on public.stage1_job_costs
  for update to authenticated using (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and exists (select 1 from public.stage1_jobs job where job.id = stage1_job_costs.stage1_job_id and job.created_by = (select auth.uid()) and public.current_user_can_use_stage1_run(job.autopsy_run_id))
  ) with check (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and exists (select 1 from public.stage1_jobs job where job.id = stage1_job_costs.stage1_job_id and job.created_by = (select auth.uid()) and public.current_user_can_use_stage1_run(job.autopsy_run_id))
  );
create policy stage1_job_costs_verified_delete on public.stage1_job_costs
  for delete to authenticated using (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and exists (select 1 from public.stage1_jobs job where job.id = stage1_job_costs.stage1_job_id and job.created_by = (select auth.uid()) and public.current_user_can_use_stage1_run(job.autopsy_run_id))
  );

create policy stage1_business_expenses_verified_insert on public.stage1_business_expenses
  for insert to authenticated with check (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and public.current_user_can_use_stage1_run(autopsy_run_id)
    and (stage1_business_expenses.stage1_job_id is null or exists (
      select 1 from public.stage1_jobs job where job.id = stage1_business_expenses.stage1_job_id and job.created_by = (select auth.uid())
    ))
  );
create policy stage1_business_expenses_verified_update on public.stage1_business_expenses
  for update to authenticated using (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  ) with check (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and public.current_user_can_use_stage1_run(autopsy_run_id)
    and (stage1_business_expenses.stage1_job_id is null or exists (
      select 1 from public.stage1_jobs job where job.id = stage1_business_expenses.stage1_job_id and job.created_by = (select auth.uid())
    ))
  );
create policy stage1_business_expenses_verified_delete on public.stage1_business_expenses
  for delete to authenticated using (
    created_by = (select auth.uid()) and public.current_user_has_verified_business_identity()
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  );

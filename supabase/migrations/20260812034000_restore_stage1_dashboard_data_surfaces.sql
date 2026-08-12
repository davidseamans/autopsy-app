create table if not exists public.stage1_lead_activities (
  id uuid primary key default gen_random_uuid(),
  autopsy_run_id uuid not null references public.autopsy_runs(id) on delete cascade,
  activity_date date not null,
  method text not null check (char_length(btrim(method)) between 1 and 80),
  attempts integer not null default 0 check (attempts >= 0),
  contacts_made integer not null default 0 check (contacts_made >= 0),
  leads_generated integer not null default 0 check (leads_generated >= 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists stage1_lead_activities_run_date_idx
  on public.stage1_lead_activities (autopsy_run_id, activity_date, method);

alter table public.stage1_lead_activities enable row level security;

drop policy if exists stage1_lead_activities_select_own
  on public.stage1_lead_activities;
create policy stage1_lead_activities_select_own
  on public.stage1_lead_activities for select to authenticated
  using (
    created_by = (select auth.uid())
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  );

drop policy if exists stage1_lead_activities_insert_own
  on public.stage1_lead_activities;
create policy stage1_lead_activities_insert_own
  on public.stage1_lead_activities for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.current_user_has_verified_business_identity()
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  );

revoke all on public.stage1_lead_activities from public, anon, authenticated;
grant select, insert on public.stage1_lead_activities to authenticated;

revoke all on public.stage1_job_margin_summary from public, anon;
grant select on public.stage1_job_margin_summary to authenticated;

-- The tables already carry owner-bound RLS policies. Restore only the data
-- operations required by the Stage 1 ledger and its security-invoker view.
grant select, insert, update, delete on public.stage1_jobs to authenticated;
grant select, insert, update, delete on public.stage1_revenue_events to authenticated;
grant select, insert, update, delete on public.stage1_payment_events to authenticated;
grant select, insert, update, delete on public.stage1_job_costs to authenticated;
grant select, insert, update, delete on public.stage1_leads to authenticated;
grant select, insert, update, delete on public.stage1_quotes to authenticated;
grant select, insert, update, delete on public.stage1_reflections to authenticated;
grant select, insert, update, delete on public.stage1_business_expenses to authenticated;

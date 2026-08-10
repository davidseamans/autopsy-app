-- Privacy-safe Stage 1 lead activity for the controlled six-week First 5 Jobs period.
-- This records aggregate activity only. Prospect names and contact details remain outside 5JD.

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

comment on table public.stage1_lead_activities is
  'Privacy-safe dated method totals for the six-week First 5 Jobs lead matrix. No prospect identity is retained.';

create index if not exists stage1_lead_activities_run_date_idx
  on public.stage1_lead_activities (autopsy_run_id, activity_date, method);

alter table public.stage1_lead_activities enable row level security;
revoke all on public.stage1_lead_activities from public, anon, authenticated;
grant select, insert on public.stage1_lead_activities to authenticated;
grant all on public.stage1_lead_activities to service_role;

create policy stage1_lead_activities_select_own
  on public.stage1_lead_activities for select to authenticated
  using (
    created_by = (select auth.uid())
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  );

create policy stage1_lead_activities_insert_own
  on public.stage1_lead_activities for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.current_user_has_verified_business_identity()
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  );

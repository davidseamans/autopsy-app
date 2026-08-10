-- Keep Stage 1 deliberately lighter than a CRM.
-- Unquoted opportunities are represented by one cumulative count per Autopsy run.
-- Customer and job details continue to begin with the written quote.

create table if not exists public.stage1_funnel_totals (
  id uuid primary key default gen_random_uuid(),
  autopsy_run_id uuid not null references public.autopsy_runs(id) on delete cascade,
  lead_count integer not null default 0 check (lead_count >= 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (autopsy_run_id)
);

comment on table public.stage1_funnel_totals is
  'Cumulative Stage 1 lead volume only. Individual customer details begin at quote creation.';

alter table public.stage1_funnel_totals enable row level security;
revoke all on public.stage1_funnel_totals from anon, authenticated;
grant select, insert, update on public.stage1_funnel_totals to authenticated;
grant all on public.stage1_funnel_totals to service_role;

create policy stage1_funnel_totals_select_own
  on public.stage1_funnel_totals for select to authenticated
  using (
    created_by = (select auth.uid())
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  );

create policy stage1_funnel_totals_insert_own
  on public.stage1_funnel_totals for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.current_user_has_verified_business_identity()
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  );

create policy stage1_funnel_totals_update_own
  on public.stage1_funnel_totals for update to authenticated
  using (
    created_by = (select auth.uid())
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  )
  with check (
    created_by = (select auth.uid())
    and public.current_user_has_verified_business_identity()
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  );

create or replace function public.set_stage1_lead_count(
  p_run_id uuid,
  p_lead_count integer
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'A valid session is required.'; end if;
  if coalesce(p_lead_count, -1) < 0 then raise exception 'Lead count cannot be negative.'; end if;
  if not public.current_user_has_verified_business_identity() then
    raise exception 'Verified Business Details are required.';
  end if;
  if not public.current_user_can_use_stage1_run(p_run_id) then
    raise exception 'This Autopsy run is not cleared for First 5 Jobs.';
  end if;

  insert into public.stage1_funnel_totals (autopsy_run_id, lead_count, created_by)
  values (p_run_id, p_lead_count, v_user_id)
  on conflict (autopsy_run_id) do update
  set lead_count = excluded.lead_count,
      updated_at = now()
  where stage1_funnel_totals.created_by = v_user_id;

  return p_lead_count;
end;
$$;

revoke all on function public.set_stage1_lead_count(uuid,integer) from public, anon;
grant execute on function public.set_stage1_lead_count(uuid,integer) to authenticated;

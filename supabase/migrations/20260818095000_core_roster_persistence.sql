create unique index if not exists core_jobs_tenant_id_id_uidx
  on public.core_jobs (tenant_id, id);

create unique index if not exists core_sites_tenant_id_id_uidx
  on public.core_sites (tenant_id, id);

create table public.core_workers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.control_tenants(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) > 0),
  employment_status text not null default 'active'
    check (employment_status in ('active', 'inactive')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table public.core_roster_shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.control_tenants(id) on delete cascade,
  employee_id uuid not null,
  job_id uuid not null,
  work_site_id uuid,
  work_date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  timezone text not null check (length(btrim(timezone)) > 0),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'accepted', 'completed', 'cancelled')),
  version integer not null default 1 check (version > 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint core_roster_shifts_employee_fk
    foreign key (tenant_id, employee_id)
    references public.core_workers (tenant_id, id),
  constraint core_roster_shifts_job_fk
    foreign key (tenant_id, job_id)
    references public.core_jobs (tenant_id, id),
  constraint core_roster_shifts_site_fk
    foreign key (tenant_id, work_site_id)
    references public.core_sites (tenant_id, id),
  constraint core_roster_shifts_time_check check (ends_at > starts_at),
  constraint core_roster_shifts_break_check check (
    extract(epoch from (ends_at - starts_at)) / 60 > break_minutes
  ),
  unique (tenant_id, id)
);

create table public.core_time_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.control_tenants(id) on delete cascade,
  shift_id uuid not null,
  employee_id uuid not null,
  work_date date not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  status text not null default 'submitted'
    check (status in ('submitted', 'approved', 'rejected')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint core_time_entries_shift_fk
    foreign key (tenant_id, shift_id)
    references public.core_roster_shifts (tenant_id, id),
  constraint core_time_entries_employee_fk
    foreign key (tenant_id, employee_id)
    references public.core_workers (tenant_id, id),
  constraint core_time_entries_time_check check (ended_at > started_at),
  constraint core_time_entries_break_check check (
    extract(epoch from (ended_at - started_at)) / 60 > break_minutes
  ),
  constraint core_time_entries_approval_check check (
    (status = 'approved' and approved_by is not null and approved_at is not null)
    or
    (status <> 'approved' and approved_by is null and approved_at is null)
  ),
  unique (tenant_id, id),
  unique (tenant_id, shift_id)
);

create table public.core_roster_audit (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.control_tenants(id) on delete restrict,
  entity_type text not null check (entity_type in ('worker', 'roster_shift', 'time_entry')),
  entity_id uuid not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  previous_record jsonb,
  next_record jsonb,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index core_workers_tenant_idx on public.core_workers (tenant_id);
create index core_roster_shifts_tenant_week_idx
  on public.core_roster_shifts (tenant_id, work_date, starts_at);
create index core_roster_shifts_employee_idx
  on public.core_roster_shifts (tenant_id, employee_id);
create index core_roster_shifts_job_idx
  on public.core_roster_shifts (tenant_id, job_id);
create index core_roster_shifts_site_idx
  on public.core_roster_shifts (tenant_id, work_site_id)
  where work_site_id is not null;
create index core_roster_shifts_created_by_idx
  on public.core_roster_shifts (created_by)
  where created_by is not null;
create index core_time_entries_tenant_week_idx
  on public.core_time_entries (tenant_id, work_date, started_at);
create index core_time_entries_employee_idx
  on public.core_time_entries (tenant_id, employee_id);
create index core_time_entries_approved_by_idx
  on public.core_time_entries (approved_by)
  where approved_by is not null;
create index core_time_entries_created_by_idx
  on public.core_time_entries (created_by)
  where created_by is not null;
create index core_roster_audit_tenant_entity_idx
  on public.core_roster_audit (tenant_id, entity_type, entity_id, changed_at desc);
create index core_roster_audit_changed_by_idx
  on public.core_roster_audit (changed_by)
  where changed_by is not null;

create or replace function public.core_enforce_version_increment()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.version <> old.version + 1 then
    raise exception 'version must increment by exactly one';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger core_workers_version_guard
before update on public.core_workers
for each row execute function public.core_enforce_version_increment();

create trigger core_roster_shifts_version_guard
before update on public.core_roster_shifts
for each row execute function public.core_enforce_version_increment();

create trigger core_time_entries_version_guard
before update on public.core_time_entries
for each row execute function public.core_enforce_version_increment();

create or replace function public.core_capture_roster_audit()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  prior jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  current jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  record_tenant_id uuid := coalesce(new.tenant_id, old.tenant_id);
  record_id uuid := coalesce(new.id, old.id);
  audit_entity_type text;
begin
  audit_entity_type := case tg_table_name
    when 'core_workers' then 'worker'
    when 'core_roster_shifts' then 'roster_shift'
    when 'core_time_entries' then 'time_entry'
    else null
  end;

  if audit_entity_type is null then
    raise exception 'unsupported roster audit source: %', tg_table_name;
  end if;

  insert into public.core_roster_audit (
    tenant_id, entity_type, entity_id, action,
    previous_record, next_record, changed_by
  ) values (
    record_tenant_id, audit_entity_type, record_id, tg_op,
    prior, current, auth.uid()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger core_workers_audit
after insert or update or delete on public.core_workers
for each row execute function public.core_capture_roster_audit();

create trigger core_roster_shifts_audit
after insert or update or delete on public.core_roster_shifts
for each row execute function public.core_capture_roster_audit();

create trigger core_time_entries_audit
after insert or update or delete on public.core_time_entries
for each row execute function public.core_capture_roster_audit();

alter table public.core_workers enable row level security;
alter table public.core_roster_shifts enable row level security;
alter table public.core_time_entries enable row level security;
alter table public.core_roster_audit enable row level security;

create policy core_workers_tenant_member_select
on public.core_workers for select to authenticated
using (
  exists (
    select 1 from public.control_tenant_memberships membership
    where membership.tenant_id = core_workers.tenant_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  )
);

create policy core_roster_shifts_tenant_member_select
on public.core_roster_shifts for select to authenticated
using (
  exists (
    select 1 from public.control_tenant_memberships membership
    where membership.tenant_id = core_roster_shifts.tenant_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  )
);

create policy core_time_entries_tenant_member_select
on public.core_time_entries for select to authenticated
using (
  exists (
    select 1 from public.control_tenant_memberships membership
    where membership.tenant_id = core_time_entries.tenant_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  )
);

create policy core_roster_audit_tenant_member_select
on public.core_roster_audit for select to authenticated
using (
  exists (
    select 1 from public.control_tenant_memberships membership
    where membership.tenant_id = core_roster_audit.tenant_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  )
);

revoke all on table public.core_workers from anon, authenticated;
revoke all on table public.core_roster_shifts from anon, authenticated;
revoke all on table public.core_time_entries from anon, authenticated;
revoke all on table public.core_roster_audit from anon, authenticated;
grant select on table public.core_workers to authenticated;
grant select on table public.core_roster_shifts to authenticated;
grant select on table public.core_time_entries to authenticated;
grant select on table public.core_roster_audit to authenticated;

create view public.core_weekly_roster
with (security_invoker = true)
as
select
  shift.id,
  shift.tenant_id,
  shift.employee_id,
  worker.display_name as employee_name,
  shift.job_id,
  job.job_sequence_number,
  shift.work_site_id,
  site.name as work_site_name,
  site.address as work_site_address,
  shift.work_date,
  shift.starts_at,
  shift.ends_at,
  shift.break_minutes,
  shift.timezone,
  shift.status,
  shift.version,
  round((extract(epoch from (shift.ends_at - shift.starts_at)) / 60 - shift.break_minutes)::numeric, 0) as planned_minutes,
  case when entry.status = 'approved' then
    round((extract(epoch from (entry.ended_at - entry.started_at)) / 60 - entry.break_minutes)::numeric, 0)
  else null end as actual_minutes,
  case when entry.status = 'approved' then
    round((
      extract(epoch from (entry.ended_at - entry.started_at)) / 60 - entry.break_minutes
      - (extract(epoch from (shift.ends_at - shift.starts_at)) / 60 - shift.break_minutes)
    )::numeric, 0)
  else null end as variance_minutes,
  entry.status as time_entry_status
from public.core_roster_shifts shift
join public.core_workers worker
  on worker.tenant_id = shift.tenant_id and worker.id = shift.employee_id
join public.core_jobs job
  on job.tenant_id = shift.tenant_id and job.id = shift.job_id
left join public.core_sites site
  on site.tenant_id = shift.tenant_id and site.id = shift.work_site_id
left join public.core_time_entries entry
  on entry.tenant_id = shift.tenant_id and entry.shift_id = shift.id;

revoke all on table public.core_weekly_roster from anon, authenticated;
grant select on table public.core_weekly_roster to authenticated;

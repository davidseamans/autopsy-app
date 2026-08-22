-- BOS-E02: industry-neutral operational Job, Service Event and Shift spine.
-- Repository migration only. It does not activate Control or mutate production.

begin;

do $$
begin
  if to_regclass('public.control_tenants') is null
     or to_regclass('public.control_tenant_memberships') is null
     or to_regclass('public.core_jobs') is null
     or to_regclass('public.core_sites') is null
     or to_regclass('public.core_workers') is null
     or to_regclass('public.core_roster_shifts') is null
     or to_regclass('public.core_time_entries') is null
     or to_regclass('public.core_commercial_baselines') is null then
    raise exception 'BOS-E02 requires BOS-E01 and the accepted Core roster foundation';
  end if;
end
$$;

create table public.core_overhead_classes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.control_tenants(id) on delete restrict,
  code text not null check (length(btrim(code)) > 0),
  name text not null check (length(btrim(name)) > 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, code)
);

create table public.core_schedule_series (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.control_tenants(id) on delete restrict,
  job_id uuid not null,
  site_id uuid not null,
  timezone text not null check (length(btrim(timezone)) > 0),
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  current_version_number integer not null default 1 check (current_version_number > 0),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint core_schedule_series_job_tenant_fk
    foreign key (tenant_id, job_id)
    references public.core_jobs (tenant_id, id) on delete restrict,
  constraint core_schedule_series_site_tenant_fk
    foreign key (tenant_id, site_id)
    references public.core_sites (tenant_id, id) on delete restrict
);

create table public.core_schedule_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.control_tenants(id) on delete restrict,
  schedule_series_id uuid not null,
  version_number integer not null check (version_number > 0),
  effective_from date not null,
  effective_until date,
  recurrence_rule jsonb not null check (jsonb_typeof(recurrence_rule) = 'object'),
  planned_start_time time not null,
  planned_duration_minutes integer not null check (planned_duration_minutes > 0),
  change_reason text not null check (length(btrim(change_reason)) > 0),
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, schedule_series_id, version_number),
  constraint core_schedule_versions_effective_range_check
    check (effective_until is null or effective_until >= effective_from),
  constraint core_schedule_versions_series_tenant_fk
    foreign key (tenant_id, schedule_series_id)
    references public.core_schedule_series (tenant_id, id) on delete restrict
);

create table public.core_service_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.control_tenants(id) on delete restrict,
  job_id uuid not null,
  site_id uuid not null,
  schedule_version_id uuid not null,
  scheduled_starts_at timestamptz not null,
  scheduled_ends_at timestamptz not null,
  status text not null default 'planned'
    check (status in ('planned', 'in_progress', 'completed', 'cancelled')),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, id, job_id),
  unique (tenant_id, schedule_version_id, scheduled_starts_at),
  constraint core_service_events_time_check check (scheduled_ends_at > scheduled_starts_at),
  constraint core_service_events_job_tenant_fk
    foreign key (tenant_id, job_id)
    references public.core_jobs (tenant_id, id) on delete restrict,
  constraint core_service_events_site_tenant_fk
    foreign key (tenant_id, site_id)
    references public.core_sites (tenant_id, id) on delete restrict,
  constraint core_service_events_schedule_version_tenant_fk
    foreign key (tenant_id, schedule_version_id)
    references public.core_schedule_versions (tenant_id, id) on delete restrict
);

create table public.core_worker_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.control_tenants(id) on delete restrict,
  worker_id uuid not null,
  credential_code text not null check (length(btrim(credential_code)) > 0),
  valid_from date not null,
  expires_on date,
  status text not null default 'valid' check (status in ('valid', 'suspended', 'expired')),
  evidence_reference text not null check (length(btrim(evidence_reference)) > 0),
  recorded_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  recorded_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint core_worker_credentials_period_check
    check (expires_on is null or expires_on >= valid_from),
  constraint core_worker_credentials_worker_tenant_fk
    foreign key (tenant_id, worker_id)
    references public.core_workers (tenant_id, id) on delete restrict
);

create table public.core_service_event_requirements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.control_tenants(id) on delete restrict,
  service_event_id uuid not null,
  credential_code text not null check (length(btrim(credential_code)) > 0),
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, service_event_id, credential_code),
  constraint core_service_event_requirements_event_tenant_fk
    foreign key (tenant_id, service_event_id)
    references public.core_service_events (tenant_id, id) on delete restrict
);

alter table public.core_roster_shifts
  alter column job_id drop not null,
  add column service_event_id uuid,
  add column overhead_class_id uuid;

alter table public.core_roster_shifts
  add constraint core_roster_shifts_allocation_check check (
    (job_id is not null and overhead_class_id is null)
    or (job_id is null and overhead_class_id is not null and service_event_id is null)
  ),
  add constraint core_roster_shifts_event_job_tenant_fk
    foreign key (tenant_id, service_event_id, job_id)
    references public.core_service_events (tenant_id, id, job_id) on delete restrict,
  add constraint core_roster_shifts_overhead_tenant_fk
    foreign key (tenant_id, overhead_class_id)
    references public.core_overhead_classes (tenant_id, id) on delete restrict;

create table public.core_shift_closeouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.control_tenants(id) on delete restrict,
  shift_id uuid not null,
  time_entry_id uuid not null,
  operational_note text,
  completed_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  completed_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, shift_id),
  unique (tenant_id, time_entry_id),
  constraint core_shift_closeouts_shift_tenant_fk
    foreign key (tenant_id, shift_id)
    references public.core_roster_shifts (tenant_id, id) on delete restrict,
  constraint core_shift_closeouts_time_entry_tenant_fk
    foreign key (tenant_id, time_entry_id)
    references public.core_time_entries (tenant_id, id) on delete restrict
);

create table public.core_extra_charge_candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.control_tenants(id) on delete restrict,
  closeout_id uuid not null,
  description text not null check (length(btrim(description)) > 0),
  quantity numeric(14,4) not null check (quantity > 0),
  unit text not null check (length(btrim(unit)) > 0),
  evidence_reference text,
  status text not null default 'captured'
    check (status in ('captured', 'reviewed', 'withdrawn')),
  captured_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  captured_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint core_extra_charge_candidates_closeout_tenant_fk
    foreign key (tenant_id, closeout_id)
    references public.core_shift_closeouts (tenant_id, id) on delete restrict
);

comment on table public.core_extra_charge_candidates is
  'Operational evidence only. This table carries no customer price, margin or billing authority.';

create table public.core_quality_cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.control_tenants(id) on delete restrict,
  closeout_id uuid not null,
  case_type text not null check (case_type in ('quality_defect', 'rectification')),
  description text not null check (length(btrim(description)) > 0),
  rectifies_case_id uuid,
  evidence_reference text,
  recorded_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  recorded_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint core_quality_cases_type_check check (
    (case_type = 'quality_defect' and rectifies_case_id is null)
    or (case_type = 'rectification' and rectifies_case_id is not null)
  ),
  constraint core_quality_cases_closeout_tenant_fk
    foreign key (tenant_id, closeout_id)
    references public.core_shift_closeouts (tenant_id, id) on delete restrict,
  constraint core_quality_cases_rectification_tenant_fk
    foreign key (tenant_id, rectifies_case_id)
    references public.core_quality_cases (tenant_id, id) on delete restrict
);

create table public.core_additional_scope_candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.control_tenants(id) on delete restrict,
  closeout_id uuid not null,
  description text not null check (length(btrim(description)) > 0),
  evidence_reference text,
  status text not null default 'captured'
    check (status in ('captured', 'reviewed', 'withdrawn')),
  captured_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  captured_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint core_additional_scope_candidates_closeout_tenant_fk
    foreign key (tenant_id, closeout_id)
    references public.core_shift_closeouts (tenant_id, id) on delete restrict
);

comment on table public.core_additional_scope_candidates is
  'Operational scope evidence only. Commercial variation, quote and billing authority remain outside BOS-E02.';

create table public.core_operational_state_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.control_tenants(id) on delete restrict,
  entity_type text not null check (entity_type in (
    'schedule_series', 'schedule_version', 'service_event', 'shift',
    'time_entry', 'closeout', 'extra_charge', 'quality_case', 'additional_scope'
  )),
  entity_id uuid not null,
  previous_state text,
  new_state text not null check (length(btrim(new_state)) > 0),
  event_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(event_metadata) = 'object'),
  changed_by uuid not null references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now()
);

create index core_schedule_series_tenant_job_idx
  on public.core_schedule_series (tenant_id, job_id);
create index core_schedule_versions_tenant_series_idx
  on public.core_schedule_versions (tenant_id, schedule_series_id, version_number desc);
create index core_service_events_tenant_time_idx
  on public.core_service_events (tenant_id, scheduled_starts_at);
create index core_worker_credentials_tenant_worker_idx
  on public.core_worker_credentials (tenant_id, worker_id, credential_code);
create index core_roster_shifts_service_event_idx
  on public.core_roster_shifts (tenant_id, service_event_id)
  where service_event_id is not null;
create index core_roster_shifts_overhead_idx
  on public.core_roster_shifts (tenant_id, overhead_class_id)
  where overhead_class_id is not null;
create index core_operational_events_tenant_entity_idx
  on public.core_operational_state_events (tenant_id, entity_type, entity_id, changed_at desc);

drop view if exists public.core_weekly_roster;
create view public.core_weekly_roster
with (security_invoker = true)
as
select
  shift.id as shift_id,
  shift.tenant_id,
  shift.work_date,
  shift.starts_at,
  shift.ends_at,
  shift.timezone,
  shift.status as shift_status,
  shift.employee_id,
  worker.display_name as employee_name,
  shift.job_id,
  job.job_sequence_number,
  shift.work_site_id as site_id,
  site.name as site_name,
  shift.service_event_id,
  shift.overhead_class_id,
  overhead.name as overhead_class_name,
  case when shift.job_id is not null then 'job' else 'overhead' end as allocation_type,
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
left join public.core_jobs job
  on job.tenant_id = shift.tenant_id and job.id = shift.job_id
left join public.core_sites site
  on site.tenant_id = shift.tenant_id and site.id = shift.work_site_id
left join public.core_overhead_classes overhead
  on overhead.tenant_id = shift.tenant_id and overhead.id = shift.overhead_class_id
left join public.core_time_entries entry
  on entry.tenant_id = shift.tenant_id and entry.shift_id = shift.id;

revoke all on table public.core_weekly_roster from public, anon, authenticated;
grant select on table public.core_weekly_roster to authenticated;

create trigger core_overhead_classes_version_guard
before update on public.core_overhead_classes
for each row execute function public.core_enforce_version_increment();
create trigger core_schedule_series_version_guard
before update on public.core_schedule_series
for each row execute function public.core_enforce_version_increment();
create trigger core_service_events_version_guard
before update on public.core_service_events
for each row execute function public.core_enforce_version_increment();

create or replace function public.core_reject_immutable_operational_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception '% records are append-only', tg_table_name using errcode = '42501';
end;
$$;

create trigger core_schedule_versions_immutable
before update or delete on public.core_schedule_versions
for each row execute function public.core_reject_immutable_operational_change();
create trigger core_shift_closeouts_immutable
before update or delete on public.core_shift_closeouts
for each row execute function public.core_reject_immutable_operational_change();
create trigger core_extra_charge_candidates_immutable
before update or delete on public.core_extra_charge_candidates
for each row execute function public.core_reject_immutable_operational_change();
create trigger core_quality_cases_immutable
before update or delete on public.core_quality_cases
for each row execute function public.core_reject_immutable_operational_change();
create trigger core_additional_scope_candidates_immutable
before update or delete on public.core_additional_scope_candidates
for each row execute function public.core_reject_immutable_operational_change();
create trigger core_operational_state_events_immutable
before update or delete on public.core_operational_state_events
for each row execute function public.core_reject_immutable_operational_change();

create or replace function public.core_protect_completed_service_event()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status = 'completed' then
    raise exception 'Completed Service Events are immutable.' using errcode = '42501';
  end if;
  if old.status <> 'planned' and (
    new.schedule_version_id <> old.schedule_version_id
    or new.scheduled_starts_at <> old.scheduled_starts_at
    or new.scheduled_ends_at <> old.scheduled_ends_at
  ) then
    raise exception 'Started Service Event timing and Schedule lineage are immutable.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger core_service_events_completion_guard
before update or delete on public.core_service_events
for each row execute function public.core_protect_completed_service_event();

create or replace function public.core_has_operational_authority(
  p_tenant_id uuid,
  p_action text
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.control_tenant_memberships membership
    where membership.tenant_id = p_tenant_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.role in ('owner', 'staff')
      and p_action in ('schedule', 'assign', 'clock_off', 'closeout')
  );
$$;

create or replace function public.core_create_schedule_version(
  p_tenant_id uuid,
  p_job_id uuid,
  p_site_id uuid,
  p_timezone text,
  p_effective_from date,
  p_recurrence_rule jsonb,
  p_planned_start_time time,
  p_planned_duration_minutes integer,
  p_change_reason text,
  p_schedule_series_id uuid default null,
  p_effective_until date default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_series_id uuid := p_schedule_series_id;
  v_version integer;
  v_version_id uuid;
begin
  if v_actor is null or not public.core_has_operational_authority(p_tenant_id, 'schedule') then
    raise exception 'Schedule change is not authorised.' using errcode = '42501';
  end if;
  if p_recurrence_rule is null or jsonb_typeof(p_recurrence_rule) <> 'object'
     or p_planned_duration_minutes <= 0
     or length(btrim(coalesce(p_timezone, ''))) = 0
     or length(btrim(coalesce(p_change_reason, ''))) = 0 then
    raise exception 'Complete schedule evidence is required.';
  end if;
  if not exists (
    select 1 from public.core_jobs job
    where job.tenant_id = p_tenant_id and job.id = p_job_id
      and job.site_id = p_site_id and job.activated_at is not null
  ) then
    raise exception 'An activated Job with matching Site is required.' using errcode = '42501';
  end if;

  if v_series_id is null then
    insert into public.core_schedule_series (
      tenant_id, job_id, site_id, timezone, current_version_number, created_by
    ) values (p_tenant_id, p_job_id, p_site_id, btrim(p_timezone), 1, v_actor)
    returning id, current_version_number into v_series_id, v_version;
  else
    select series.current_version_number + 1 into v_version
    from public.core_schedule_series series
    where series.tenant_id = p_tenant_id and series.id = v_series_id
      and series.job_id = p_job_id and series.site_id = p_site_id
      and series.status <> 'ended'
    for update;
    if not found then
      raise exception 'Schedule Series not found, ended or access denied.' using errcode = '42501';
    end if;

    update public.core_schedule_series
    set current_version_number = v_version, timezone = btrim(p_timezone),
        version = version + 1
    where tenant_id = p_tenant_id and id = v_series_id;

    update public.core_service_events
    set status = 'cancelled', version = version + 1
    where tenant_id = p_tenant_id
      and schedule_version_id in (
        select id from public.core_schedule_versions
        where tenant_id = p_tenant_id and schedule_series_id = v_series_id
      )
      and status = 'planned'
      and (scheduled_starts_at at time zone p_timezone)::date >= p_effective_from;
  end if;

  insert into public.core_schedule_versions (
    tenant_id, schedule_series_id, version_number, effective_from,
    effective_until, recurrence_rule, planned_start_time,
    planned_duration_minutes, change_reason, created_by
  ) values (
    p_tenant_id, v_series_id, v_version, p_effective_from,
    p_effective_until, p_recurrence_rule, p_planned_start_time,
    p_planned_duration_minutes, btrim(p_change_reason), v_actor
  ) returning id into v_version_id;

  insert into public.core_operational_state_events (
    tenant_id, entity_type, entity_id, new_state, event_metadata, changed_by
  ) values (
    p_tenant_id, 'schedule_version', v_version_id, 'created',
    jsonb_build_object('schedule_series_id', v_series_id, 'version_number', v_version), v_actor
  );
  return v_version_id;
end;
$$;

create or replace function public.core_create_service_event(
  p_tenant_id uuid,
  p_schedule_version_id uuid,
  p_scheduled_starts_at timestamptz,
  p_scheduled_ends_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_event_id uuid;
  v_job_id uuid;
  v_site_id uuid;
begin
  if v_actor is null or not public.core_has_operational_authority(p_tenant_id, 'schedule') then
    raise exception 'Service Event creation is not authorised.' using errcode = '42501';
  end if;
  if p_scheduled_ends_at <= p_scheduled_starts_at then
    raise exception 'Service Event end must follow its start.';
  end if;

  select series.job_id, series.site_id into v_job_id, v_site_id
  from public.core_schedule_versions version
  join public.core_schedule_series series
    on series.tenant_id = version.tenant_id and series.id = version.schedule_series_id
  where version.tenant_id = p_tenant_id and version.id = p_schedule_version_id
    and version.version_number = series.current_version_number
    and (p_scheduled_starts_at at time zone series.timezone)::date >= version.effective_from
    and (
      version.effective_until is null
      or (p_scheduled_starts_at at time zone series.timezone)::date <= version.effective_until
    )
    and series.status = 'active';
  if not found then
    raise exception 'Current Schedule version not found or Event is outside its effective period.' using errcode = '42501';
  end if;

  insert into public.core_service_events (
    tenant_id, job_id, site_id, schedule_version_id,
    scheduled_starts_at, scheduled_ends_at, created_by
  ) values (
    p_tenant_id, v_job_id, v_site_id, p_schedule_version_id,
    p_scheduled_starts_at, p_scheduled_ends_at, v_actor
  ) returning id into v_event_id;

  insert into public.core_operational_state_events (
    tenant_id, entity_type, entity_id, new_state, changed_by
  ) values (p_tenant_id, 'service_event', v_event_id, 'planned', v_actor);
  return v_event_id;
end;
$$;

create or replace function public.core_create_overhead_shift(
  p_tenant_id uuid,
  p_overhead_class_id uuid,
  p_worker_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text,
  p_break_minutes integer default 0
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_shift_id uuid;
begin
  if v_actor is null or not public.core_has_operational_authority(p_tenant_id, 'assign') then
    raise exception 'Overhead assignment is not authorised.' using errcode = '42501';
  end if;
  if p_ends_at <= p_starts_at or length(btrim(coalesce(p_timezone, ''))) = 0 then
    raise exception 'Complete overhead Shift timing is required.';
  end if;
  if not exists (
    select 1 from public.core_overhead_classes overhead
    where overhead.tenant_id = p_tenant_id and overhead.id = p_overhead_class_id
      and overhead.status = 'active'
  ) or not exists (
    select 1 from public.core_workers worker
    where worker.tenant_id = p_tenant_id and worker.id = p_worker_id
      and worker.employment_status = 'active'
  ) then
    raise exception 'Active Worker or governed overhead class not found.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.core_roster_shifts shift
    where shift.tenant_id = p_tenant_id and shift.employee_id = p_worker_id
      and shift.status not in ('cancelled', 'completed')
      and tstzrange(shift.starts_at, shift.ends_at, '[)')
          && tstzrange(p_starts_at, p_ends_at, '[)')
  ) then
    raise exception 'Worker has a conflicting assignment.' using errcode = '42501';
  end if;

  insert into public.core_roster_shifts (
    tenant_id, employee_id, job_id, work_site_id, service_event_id,
    overhead_class_id, work_date, starts_at, ends_at, break_minutes,
    timezone, status, created_by
  ) values (
    p_tenant_id, p_worker_id, null, null, null, p_overhead_class_id,
    (p_starts_at at time zone p_timezone)::date, p_starts_at, p_ends_at,
    coalesce(p_break_minutes, 0), btrim(p_timezone), 'published', v_actor
  ) returning id into v_shift_id;

  insert into public.core_operational_state_events (
    tenant_id, entity_type, entity_id, new_state, event_metadata, changed_by
  ) values (
    p_tenant_id, 'shift', v_shift_id, 'published',
    jsonb_build_object('overhead_class_id', p_overhead_class_id, 'worker_id', p_worker_id), v_actor
  );
  return v_shift_id;
end;
$$;

create or replace function public.core_assign_worker_to_event(
  p_tenant_id uuid,
  p_service_event_id uuid,
  p_worker_id uuid,
  p_break_minutes integer default 0
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_event public.core_service_events%rowtype;
  v_timezone text;
  v_shift_id uuid;
begin
  if v_actor is null or not public.core_has_operational_authority(p_tenant_id, 'assign') then
    raise exception 'Worker assignment is not authorised.' using errcode = '42501';
  end if;
  select event.* into v_event from public.core_service_events event
  where event.tenant_id = p_tenant_id and event.id = p_service_event_id
    and event.status = 'planned' for update;
  if not found then
    raise exception 'Planned Service Event not found or access denied.' using errcode = '42501';
  end if;
  select series.timezone into v_timezone
  from public.core_schedule_versions version
  join public.core_schedule_series series
    on series.tenant_id = version.tenant_id and series.id = version.schedule_series_id
  where version.tenant_id = p_tenant_id and version.id = v_event.schedule_version_id;

  if not exists (
    select 1 from public.core_workers worker
    where worker.tenant_id = p_tenant_id and worker.id = p_worker_id
      and worker.employment_status = 'active'
  ) then
    raise exception 'Active Worker not found or access denied.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.core_service_event_requirements requirement
    where requirement.tenant_id = p_tenant_id
      and requirement.service_event_id = p_service_event_id
      and not exists (
        select 1 from public.core_worker_credentials credential
        where credential.tenant_id = requirement.tenant_id
          and credential.worker_id = p_worker_id
          and credential.credential_code = requirement.credential_code
          and credential.status = 'valid'
          and credential.valid_from <= (v_event.scheduled_starts_at at time zone v_timezone)::date
          and (
            credential.expires_on is null
            or credential.expires_on >= (v_event.scheduled_ends_at at time zone v_timezone)::date
          )
      )
  ) then
    raise exception 'Worker lacks a current required credential.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.core_roster_shifts shift
    where shift.tenant_id = p_tenant_id and shift.employee_id = p_worker_id
      and shift.status not in ('cancelled', 'completed')
      and tstzrange(shift.starts_at, shift.ends_at, '[)')
          && tstzrange(v_event.scheduled_starts_at, v_event.scheduled_ends_at, '[)')
  ) then
    raise exception 'Worker has a conflicting assignment.' using errcode = '42501';
  end if;

  insert into public.core_roster_shifts (
    tenant_id, employee_id, job_id, work_site_id, service_event_id,
    work_date, starts_at, ends_at, break_minutes, timezone, status, created_by
  ) values (
    p_tenant_id, p_worker_id, v_event.job_id, v_event.site_id, v_event.id,
    (v_event.scheduled_starts_at at time zone v_timezone)::date, v_event.scheduled_starts_at,
    v_event.scheduled_ends_at, coalesce(p_break_minutes, 0), v_timezone, 'published', v_actor
  ) returning id into v_shift_id;

  insert into public.core_operational_state_events (
    tenant_id, entity_type, entity_id, new_state, event_metadata, changed_by
  ) values (
    p_tenant_id, 'shift', v_shift_id, 'published',
    jsonb_build_object('service_event_id', v_event.id, 'worker_id', p_worker_id), v_actor
  );
  return v_shift_id;
end;
$$;

create or replace function public.core_record_rectification(
  p_tenant_id uuid,
  p_closeout_id uuid,
  p_rectifies_case_id uuid,
  p_description text,
  p_evidence_reference text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_case_id uuid;
begin
  if v_actor is null or not public.core_has_operational_authority(p_tenant_id, 'closeout') then
    raise exception 'Rectification recording is not authorised.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_description, ''))) = 0 or not exists (
    select 1 from public.core_quality_cases defect
    where defect.tenant_id = p_tenant_id and defect.id = p_rectifies_case_id
      and defect.case_type = 'quality_defect'
  ) or not exists (
    select 1 from public.core_shift_closeouts closeout
    where closeout.tenant_id = p_tenant_id and closeout.id = p_closeout_id
  ) then
    raise exception 'A Tenant-matched closeout, quality defect and description are required.' using errcode = '42501';
  end if;

  insert into public.core_quality_cases (
    tenant_id, closeout_id, case_type, description, rectifies_case_id,
    evidence_reference, recorded_by
  ) values (
    p_tenant_id, p_closeout_id, 'rectification', btrim(p_description),
    p_rectifies_case_id, nullif(btrim(coalesce(p_evidence_reference, '')), ''), v_actor
  ) returning id into v_case_id;

  insert into public.core_operational_state_events (
    tenant_id, entity_type, entity_id, new_state, event_metadata, changed_by
  ) values (
    p_tenant_id, 'quality_case', v_case_id, 'rectification_recorded',
    jsonb_build_object('rectifies_case_id', p_rectifies_case_id), v_actor
  );
  return v_case_id;
end;
$$;

create or replace function public.core_clock_off_shift(
  p_tenant_id uuid,
  p_shift_id uuid,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_break_minutes integer default 0
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_shift public.core_roster_shifts%rowtype;
  v_entry_id uuid;
begin
  if v_actor is null or not public.core_has_operational_authority(p_tenant_id, 'clock_off') then
    raise exception 'Clock-off is not authorised.' using errcode = '42501';
  end if;
  if p_ended_at <= p_started_at then
    raise exception 'Clock-off must follow clock-on.';
  end if;
  select shift.* into v_shift from public.core_roster_shifts shift
  where shift.tenant_id = p_tenant_id and shift.id = p_shift_id
    and shift.status in ('published', 'accepted') for update;
  if not found then
    raise exception 'Open Shift not found or access denied.' using errcode = '42501';
  end if;

  insert into public.core_time_entries (
    tenant_id, shift_id, employee_id, work_date, started_at, ended_at,
    break_minutes, status, created_by
  ) values (
    p_tenant_id, v_shift.id, v_shift.employee_id, v_shift.work_date,
    p_started_at, p_ended_at, coalesce(p_break_minutes, 0), 'submitted', v_actor
  ) returning id into v_entry_id;

  insert into public.core_operational_state_events (
    tenant_id, entity_type, entity_id, new_state, event_metadata, changed_by
  ) values (
    p_tenant_id, 'time_entry', v_entry_id, 'clocked_off',
    jsonb_build_object('shift_id', v_shift.id, 'ended_at', p_ended_at), v_actor
  );
  return v_entry_id;
end;
$$;

create or replace function public.core_record_shift_closeout(
  p_tenant_id uuid,
  p_shift_id uuid,
  p_operational_note text default null,
  p_extra_charges jsonb default '[]'::jsonb,
  p_quality_defects jsonb default '[]'::jsonb,
  p_additional_scope jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_shift public.core_roster_shifts%rowtype;
  v_time_entry_id uuid;
  v_closeout_id uuid;
  v_item jsonb;
begin
  if v_actor is null or not public.core_has_operational_authority(p_tenant_id, 'closeout') then
    raise exception 'Shift closeout is not authorised.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_extra_charges, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_quality_defects, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_additional_scope, '[]'::jsonb)) <> 'array' then
    raise exception 'Closeout evidence must be supplied as arrays.';
  end if;
  select shift.* into v_shift from public.core_roster_shifts shift
  where shift.tenant_id = p_tenant_id and shift.id = p_shift_id
    and shift.status in ('published', 'accepted') for update;
  if not found then
    raise exception 'Open Shift not found or access denied.' using errcode = '42501';
  end if;
  select entry.id into v_time_entry_id from public.core_time_entries entry
  where entry.tenant_id = p_tenant_id and entry.shift_id = p_shift_id
    and entry.ended_at is not null;
  if not found then
    raise exception 'Clock-off must stop paid time before closeout begins.' using errcode = '42501';
  end if;

  insert into public.core_shift_closeouts (
    tenant_id, shift_id, time_entry_id, operational_note, completed_by
  ) values (
    p_tenant_id, p_shift_id, v_time_entry_id,
    nullif(btrim(coalesce(p_operational_note, '')), ''), v_actor
  ) returning id into v_closeout_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_extra_charges, '[]'::jsonb)) loop
    insert into public.core_extra_charge_candidates (
      tenant_id, closeout_id, description, quantity, unit,
      evidence_reference, captured_by
    ) values (
      p_tenant_id, v_closeout_id, btrim(v_item->>'description'),
      (v_item->>'quantity')::numeric, btrim(v_item->>'unit'),
      nullif(btrim(coalesce(v_item->>'evidence_reference', '')), ''), v_actor
    );
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_quality_defects, '[]'::jsonb)) loop
    insert into public.core_quality_cases (
      tenant_id, closeout_id, case_type, description, evidence_reference, recorded_by
    ) values (
      p_tenant_id, v_closeout_id, 'quality_defect', btrim(v_item->>'description'),
      nullif(btrim(coalesce(v_item->>'evidence_reference', '')), ''), v_actor
    );
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_additional_scope, '[]'::jsonb)) loop
    insert into public.core_additional_scope_candidates (
      tenant_id, closeout_id, description, evidence_reference, captured_by
    ) values (
      p_tenant_id, v_closeout_id, btrim(v_item->>'description'),
      nullif(btrim(coalesce(v_item->>'evidence_reference', '')), ''), v_actor
    );
  end loop;

  update public.core_roster_shifts
  set status = 'completed', version = version + 1
  where tenant_id = p_tenant_id and id = p_shift_id;

  if v_shift.service_event_id is not null and not exists (
    select 1 from public.core_roster_shifts other_shift
    where other_shift.tenant_id = p_tenant_id
      and other_shift.service_event_id = v_shift.service_event_id
      and other_shift.id <> p_shift_id
      and other_shift.status <> 'completed'
  ) then
    update public.core_service_events
    set status = 'completed', version = version + 1
    where tenant_id = p_tenant_id and id = v_shift.service_event_id;
  end if;

  insert into public.core_operational_state_events (
    tenant_id, entity_type, entity_id, new_state, event_metadata, changed_by
  ) values (
    p_tenant_id, 'closeout', v_closeout_id, 'recorded',
    jsonb_build_object('shift_id', p_shift_id, 'time_entry_id', v_time_entry_id), v_actor
  );
  return v_closeout_id;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'core_overhead_classes', 'core_schedule_series', 'core_schedule_versions',
    'core_service_events', 'core_worker_credentials',
    'core_service_event_requirements', 'core_shift_closeouts',
    'core_extra_charge_candidates', 'core_quality_cases',
    'core_additional_scope_candidates', 'core_operational_state_events'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on public.%I from public, anon, authenticated', v_table);
    execute format('grant select on public.%I to authenticated', v_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using (exists (select 1 from public.control_tenant_memberships membership where membership.tenant_id = %I.tenant_id and membership.user_id = (select auth.uid()) and membership.status = ''active''))',
      v_table || '_tenant_member_select', v_table, v_table
    );
  end loop;
end
$$;

revoke all on function public.core_has_operational_authority(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.core_create_schedule_version(uuid, uuid, uuid, text, date, jsonb, time, integer, text, uuid, date)
  from public, anon, authenticated, service_role;
revoke all on function public.core_create_service_event(uuid, uuid, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.core_assign_worker_to_event(uuid, uuid, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.core_create_overhead_shift(uuid, uuid, uuid, timestamptz, timestamptz, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.core_clock_off_shift(uuid, uuid, timestamptz, timestamptz, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.core_record_shift_closeout(uuid, uuid, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.core_record_rectification(uuid, uuid, uuid, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.core_has_operational_authority(uuid, text)
  to authenticated;
grant execute on function public.core_create_schedule_version(uuid, uuid, uuid, text, date, jsonb, time, integer, text, uuid, date)
  to authenticated;
grant execute on function public.core_create_service_event(uuid, uuid, timestamptz, timestamptz)
  to authenticated;
grant execute on function public.core_assign_worker_to_event(uuid, uuid, uuid, integer)
  to authenticated;
grant execute on function public.core_create_overhead_shift(uuid, uuid, uuid, timestamptz, timestamptz, text, integer)
  to authenticated;
grant execute on function public.core_clock_off_shift(uuid, uuid, timestamptz, timestamptz, integer)
  to authenticated;
grant execute on function public.core_record_shift_closeout(uuid, uuid, text, jsonb, jsonb, jsonb)
  to authenticated;
grant execute on function public.core_record_rectification(uuid, uuid, uuid, text, text)
  to authenticated;

comment on function public.core_create_schedule_version(uuid, uuid, uuid, text, date, jsonb, time, integer, text, uuid, date) is
  'Appends a recurring Schedule version and cancels only future planned Events replaced by that version.';
comment on function public.core_record_shift_closeout(uuid, uuid, text, jsonb, jsonb, jsonb) is
  'Records closeout evidence after clock-off. Extra Charges and additional scope carry no customer-price or billing authority.';

commit;

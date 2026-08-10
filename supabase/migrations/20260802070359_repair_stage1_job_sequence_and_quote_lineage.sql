-- Ensure every First 5 Jobs job receives a stable, run-scoped job number.
-- Existing quote-created jobs with a null sequence are repaired in creation order.

with run_max as (
  select autopsy_run_id, coalesce(max(job_sequence_number), 0) as max_sequence
  from public.stage1_jobs
  group by autopsy_run_id
), missing as (
  select
    j.id,
    coalesce(m.max_sequence, 0)
      + row_number() over (
          partition by j.autopsy_run_id
          order by j.created_at, j.id
        ) as repaired_sequence
  from public.stage1_jobs j
  left join run_max m on m.autopsy_run_id = j.autopsy_run_id
  where j.job_sequence_number is null
)
update public.stage1_jobs j
set job_sequence_number = missing.repaired_sequence
from missing
where j.id = missing.id;

create unique index if not exists stage1_jobs_run_sequence_key
  on public.stage1_jobs (autopsy_run_id, job_sequence_number);

alter table public.stage1_jobs
  alter column job_sequence_number set not null;

create or replace function public.assign_stage1_job_sequence()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.job_sequence_number is null then
    perform pg_advisory_xact_lock(hashtextextended(new.autopsy_run_id::text, 0));
    select coalesce(max(j.job_sequence_number), 0) + 1
      into new.job_sequence_number
    from public.stage1_jobs j
    where j.autopsy_run_id = new.autopsy_run_id;
  end if;
  return new;
end;
$$;

revoke all on function public.assign_stage1_job_sequence() from public, anon, authenticated;

drop trigger if exists stage1_jobs_assign_sequence on public.stage1_jobs;
create trigger stage1_jobs_assign_sequence
before insert on public.stage1_jobs
for each row execute function public.assign_stage1_job_sequence();

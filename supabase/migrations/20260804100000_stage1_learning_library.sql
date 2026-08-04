-- Versioned, privacy-safe lesson completion for the First 5 Jobs learning library.
-- Learning supports voluntary development. It does not alter Autopsy evidence,
-- verdicts, Stage 1 access or Core admission.

create table if not exists public.stage1_learning_progress (
  id uuid primary key default gen_random_uuid(),
  autopsy_run_id uuid not null references public.autopsy_runs(id) on delete cascade,
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  course_key text not null,
  course_version integer not null check (course_version > 0),
  lesson_key text not null,
  lesson_version integer not null check (lesson_version > 0),
  quiz_score integer not null check (quiz_score between 0 and 3),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (autopsy_run_id, course_key, course_version, lesson_key, lesson_version)
);

comment on table public.stage1_learning_progress is
  'Versioned, privacy-safe First 5 Jobs lesson completion. Stores no transcript, free-text response, raw audio or maturity evidence.';

alter table public.stage1_learning_progress enable row level security;
revoke all on public.stage1_learning_progress from anon, authenticated;
grant select, insert, update on public.stage1_learning_progress to authenticated;
grant all on public.stage1_learning_progress to service_role;

create policy stage1_learning_select_own
  on public.stage1_learning_progress for select to authenticated
  using (
    owner_user_id = (select auth.uid())
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  );

create policy stage1_learning_insert_own
  on public.stage1_learning_progress for insert to authenticated
  with check (
    owner_user_id = (select auth.uid())
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  );

create policy stage1_learning_update_own
  on public.stage1_learning_progress for update to authenticated
  using (
    owner_user_id = (select auth.uid())
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  )
  with check (
    owner_user_id = (select auth.uid())
    and public.current_user_can_use_stage1_run(autopsy_run_id)
  );

create or replace function public.save_stage1_lesson_completion(
  p_run_id uuid,
  p_course_key text,
  p_course_version integer,
  p_lesson_key text,
  p_lesson_version integer,
  p_quiz_score integer
)
returns public.stage1_learning_progress
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.stage1_learning_progress;
begin
  if v_user_id is null then raise exception 'A valid session is required.'; end if;
  if not public.current_user_can_use_stage1_run(p_run_id) then
    raise exception 'This Autopsy run is not cleared for First 5 Jobs.';
  end if;
  if p_course_key <> 'getting_your_first_five_jobs' or p_course_version <> 1 then
    raise exception 'This course version is not available.';
  end if;
  if p_lesson_key not in ('first_leads', 'what_to_say') or p_lesson_version <> 1 then
    raise exception 'This lesson version is not available.';
  end if;
  if p_quiz_score < 2 or p_quiz_score > 3 then
    raise exception 'Complete the lesson check before saving.';
  end if;

  insert into public.stage1_learning_progress (
    autopsy_run_id, owner_user_id, course_key, course_version,
    lesson_key, lesson_version, quiz_score, completed_at, updated_at
  ) values (
    p_run_id, v_user_id, p_course_key, p_course_version,
    p_lesson_key, p_lesson_version, p_quiz_score, now(), now()
  )
  on conflict (autopsy_run_id, course_key, course_version, lesson_key, lesson_version)
  do update set
    quiz_score = greatest(stage1_learning_progress.quiz_score, excluded.quiz_score),
    completed_at = stage1_learning_progress.completed_at,
    updated_at = now()
  where stage1_learning_progress.owner_user_id = v_user_id
  returning * into v_row;

  if v_row.id is null then raise exception 'Lesson completion could not be saved.'; end if;
  return v_row;
end;
$$;

revoke all on function public.save_stage1_lesson_completion(uuid, text, integer, text, integer, integer) from public, anon;
grant execute on function public.save_stage1_lesson_completion(uuid, text, integer, text, integer, integer) to authenticated, service_role;

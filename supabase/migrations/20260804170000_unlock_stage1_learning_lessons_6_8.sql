-- Unlock the final three First 5 Jobs lessons in course version 1.
-- Completion remains owner-scoped learning progress only. It does not alter
-- Autopsy evidence, verdicts, Stage 1 access, maturity or Core admission.

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
  if p_lesson_key not in (
    'first_leads',
    'what_to_say',
    'presentation_before_discounting',
    'charge_out_rate',
    'inspect_and_quote',
    'follow_up',
    'rejected_quote',
    'complete_professionally'
  ) or p_lesson_version <> 1 then
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

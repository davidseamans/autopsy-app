-- AUT-001 alignment: Autopsy evaluates demonstrated candidate readiness.
-- The canonical verdict band is resolved by verdict_bands in Supabase.
-- No answer is a hard fail unless its selected option explicitly says so.

alter table public.answer_options
  add column if not exists option_hard_fail boolean not null default false;

comment on column public.answer_options.option_hard_fail is
  'Canonical selected-option stop flag. Never infer from score or question metadata.';

create or replace function public.check_hard_fail(p_run_id uuid)
returns jsonb
language sql
security definer
set search_path = 'public', 'pg_temp'
as $function$
  with selected_stop as (
    select aa.question_id, ao.id as option_id, q.q_id, q.hard_fail_message
    from public.autopsy_answers aa
    join public.questions q on q.id = aa.question_id
    join public.answer_options ao on ao.id = aa.selected_option
    where aa.run_id = p_run_id
      and ao.option_hard_fail is true
    order by aa.created_at asc
  )
  select jsonb_build_object(
    'run_id', p_run_id,
    'hard_fail_triggered', exists(select 1 from selected_stop),
    'hard_fail_question_id', (select question_id from selected_stop limit 1),
    'hard_fail_selected_option_id', (select option_id from selected_stop limit 1),
    'hard_fail_message', (select nullif(hard_fail_message, 'No hard fail message.') from selected_stop limit 1),
    'hard_fail_q_id', (select q_id from selected_stop limit 1),
    'hard_fail_count', (select count(*) from selected_stop)
  );
$function$;

create or replace function public.finalize_autopsy_run_internal(p_run_id uuid)
returns public.autopsy_runs
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_run public.autopsy_runs;
  v_score_total integer;
  v_dimension_scores jsonb;
  v_weak_dim text;
  v_weak_score integer;
  v_primary_dim text;
  v_primary_label text;
  v_primary_score integer;
  v_hard_fail_question uuid;
  v_hard_fail_option uuid;
  v_hard_fail_dim text;
  v_band public.verdict_bands%rowtype;
  v_permission text;
  v_operational_state text;
  v_recovery_signal text;
  v_result public.autopsy_runs;
begin
  select * into v_run from public.autopsy_runs where id = p_run_id;
  if not found then
    raise exception 'Autopsy run is not available.' using errcode = 'P0002';
  end if;

  select coalesce(sum(score_value), 0) into v_score_total
  from public.autopsy_answers where run_id = p_run_id;

  with dim_scores as (
    select q.dimension_code, sum(a.score_value)::integer as total
    from public.autopsy_answers a
    join public.questions q on q.id = a.question_id
    where a.run_id = p_run_id
    group by q.dimension_code
  )
  select jsonb_agg(
    jsonb_build_object(
      'dimension_code', dimension_code,
      'dimension_title', public.autopsy_dimension_label(dimension_code),
      'score_total', total
    ) order by total asc, dimension_code asc
  ) into v_dimension_scores
  from dim_scores;

  select dimension_code, total into v_weak_dim, v_weak_score
  from (
    select q.dimension_code, sum(a.score_value)::integer as total
    from public.autopsy_answers a
    join public.questions q on q.id = a.question_id
    where a.run_id = p_run_id
    group by q.dimension_code
  ) scored
  order by total asc, dimension_code asc
  limit 1;

  select q.id, ao.id, q.dimension_code
  into v_hard_fail_question, v_hard_fail_option, v_hard_fail_dim
  from public.autopsy_answers a
  join public.questions q on q.id = a.question_id
  join public.answer_options ao on ao.id = a.selected_option
  where a.run_id = p_run_id and ao.option_hard_fail is true
  order by q.q_id asc
  limit 1;

  select * into v_band
  from public.verdict_bands vb
  where lower(vb.scenario) = lower(coalesce(v_run.scenario, 'startup'))
    and vb.question_set = 'quick_gate'
    and v_score_total between vb.min_score and vb.max_score
  order by vb.version desc
  limit 1;

  if v_band.id is null then
    raise exception 'No governed verdict band for scenario % and score %',
      coalesce(v_run.scenario, 'startup'), v_score_total;
  end if;

  v_primary_dim := coalesce(v_hard_fail_dim, v_weak_dim);
  v_primary_label := case
    when v_score_total = v_band.max_possible_score and v_hard_fail_question is null
      then 'No Active Readiness Gap'
    else public.autopsy_dimension_label(v_primary_dim)
  end;

  select sum(a.score_value)::integer into v_primary_score
  from public.autopsy_answers a
  join public.questions q on q.id = a.question_id
  where a.run_id = p_run_id and q.dimension_code = v_primary_dim;

  select recovery_signal into v_recovery_signal
  from public.dimension_recovery_validation
  where dimension_code = v_primary_dim
  limit 1;

  v_permission := case
    when v_hard_fail_question is not null then 'locked'
    when v_band.band_code in ('critical_stop', 'not_viable') then 'locked'
    when v_band.band_code = 'high_risk' then 'conditional'
    when v_band.band_code = 'viable' then 'restricted'
    else 'granted'
  end;

  v_operational_state := case v_band.band_code
    when 'critical_stop' then 'blocked'
    when 'not_viable' then 'preparation_required'
    when 'high_risk' then 'bounded_preparation'
    when 'viable' then 'provisional'
    else 'test_ready'
  end;

  update public.autopsy_runs
  set score_total = v_score_total,
      adjusted_score = v_score_total,
      dimension_scores = coalesce(v_dimension_scores, '[]'::jsonb),
      weakest_dimension = case
        when v_score_total = v_band.max_possible_score then 'No Active Readiness Gap'
        else public.autopsy_dimension_label(v_weak_dim)
      end,
      weakest_score = v_weak_score,
      final_verdict = case when v_hard_fail_question is not null then 'Stop' else v_band.label end,
      verdict_name = case when v_hard_fail_question is not null then 'Stop' else v_band.label end,
      verdict_body = case
        when v_hard_fail_question is not null then
          'An explicit candidate-readiness stop condition was selected. Address the identified gap and retest only when new evidence is available.'
        else v_band.verdict_body
      end,
      core_readiness_outcome = case when v_hard_fail_question is not null then 'Stop' else v_band.label end,
      core_readiness_summary = v_band.verdict_body,
      final_outcome = v_band.decision_hint,
      narrative_output = v_band.verdict_body,
      primary_risk = v_primary_label,
      primary_risk_code = v_primary_dim,
      primary_risk_score = v_primary_score,
      hard_fail_question_id = v_hard_fail_question,
      hard_fail_triggered = (v_hard_fail_question is not null),
      hard_fail_reason = case when v_hard_fail_question is not null then v_primary_label else null end,
      blocking_dimension = case when v_hard_fail_question is not null then v_hard_fail_dim else null end,
      permission_level = v_permission,
      operational_state = v_operational_state,
      progression_state = v_operational_state,
      required_recovery_signal = case
        when v_band.band_code = 'structurally_viable' and v_hard_fail_question is null then null
        else v_recovery_signal
      end,
      worksheet_output = case
        when v_band.band_code = 'structurally_viable' and v_hard_fail_question is null then null
        else worksheet_output
      end,
      retest_condition = case
        when v_band.band_code = 'structurally_viable' and v_hard_fail_question is null then null
        else retest_condition
      end,
      band_position = v_band.band_code
  where id = p_run_id;

  select * into v_result from public.autopsy_runs where id = p_run_id;
  return v_result;
end;
$function$;

create or replace function public.generate_locked_narrative(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
begin
  update public.autopsy_runs
  set narrative_output = coalesce(
    nullif(verdict_body, ''),
    core_readiness_summary,
    'The current candidate-readiness evidence has been recorded. Review the identified gap and the permitted next step.'
  )
  where id = p_run_id;
end;
$function$;

create or replace function public.apply_hard_fail(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_check jsonb;
begin
  v_check := public.check_hard_fail(p_run_id);

  update public.autopsy_runs
  set hard_fail_triggered = coalesce((v_check ->> 'hard_fail_triggered')::boolean, false),
      hard_fail_question_id = nullif(v_check ->> 'hard_fail_question_id', '')::uuid,
      hard_fail_reason = v_check ->> 'hard_fail_message'
  where id = p_run_id;

  insert into public.system_mutations (
    mutation_type, target_system, target_object, mutation_summary,
    mutation_payload, initiated_by
  ) values (
    'hard_fail_evaluation', 'autopsy-canonical', 'autopsy_runs',
    case when coalesce((v_check ->> 'hard_fail_triggered')::boolean, false)
      then 'Explicit selected-option readiness stop applied to run'
      else 'Selected-option readiness stop evaluation passed'
    end,
    v_check, 'system'
  );
end;
$function$;

create or replace function public.finalize_autopsy_run(p_run_id uuid)
returns public.autopsy_runs
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_run public.autopsy_runs;
  v_stage_progress_id uuid;
begin
  select * into v_run from public.autopsy_runs where id = p_run_id;
  if not found then
    raise exception 'Autopsy run not found: %', p_run_id;
  end if;

  if v_run.status not in ('completed', 'finalized') then
    select * into v_run from public.finalize_autopsy_run_internal(p_run_id);
    perform public.apply_hard_fail(p_run_id);

    update public.autopsy_runs
    set status = 'completed', completed_at = now()
    where id = p_run_id;

    select * into v_run from public.autopsy_runs where id = p_run_id;
  end if;

  -- Completion is not admission. Only the governed Ready for Test Run outcome
  -- may automatically open the First 5 Jobs controlled test.
  if v_run.verdict_name = 'Ready for Test Run'
     and v_run.permission_level = 'granted'
     and coalesce(v_run.hard_fail_triggered, false) is false then
    select a.stage_progress_id into v_stage_progress_id
    from public.activate_stage1_from_autopsy_run(p_run_id) a
    limit 1;

    if v_stage_progress_id is null then
      raise exception 'Stage 1 activation did not return a linked stage progress row.'
        using errcode = '23502';
    end if;
  end if;

  insert into public.system_mutations (
    mutation_type, target_system, target_object, mutation_summary,
    mutation_payload, initiated_by
  ) values (
    'candidate_readiness_finalized', 'autopsy-canonical', 'autopsy_runs',
    'Autopsy finalized from governed candidate-readiness band',
    jsonb_build_object(
      'run_id', p_run_id,
      'outcome', v_run.verdict_name,
      'score_total', v_run.score_total,
      'stage1_activated', v_stage_progress_id is not null,
      'stage_progress_id', v_stage_progress_id
    ),
    'system'
  );

  return v_run;
end;
$function$;

-- The legacy question-level and answer_options.hard_fail fields remain for
-- audit compatibility only. They no longer trigger a stop.

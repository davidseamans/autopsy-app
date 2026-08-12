-- A fresh canonical rebuild creates the governed verdict tables but historical
-- migrations do not populate their reference rows. Keep this seed idempotent
-- so finalisation can map every 12-question startup score to a governed result.

insert into public.stage_definitions (
  stage_code, stage_number, stage_name, stage_label, dragon_name, purpose,
  user_promise, unlock_condition, is_active, is_mvp_scope, display_order
) values
  ('stage_0_readiness_gate', 0, 'Readiness Gate', 'Stage 0 — Readiness Gate', 'Fantasy', 'Stop unsuitable candidates before they create financial, personal, customer, employee, or subcontractor damage.', 'Before you start spending money, prove you are ready to take on the responsibility of starting a cleaning business.', 'No critical hard fail and minimum readiness result achieved.', true, true, 0),
  ('stage_1_first_five_jobs', 1, 'First 5 Jobs', 'Stage 1 — First 5 Jobs', 'No Customers', 'Move the candidate from business fantasy to real paid work.', 'Get your first five paid cleaning jobs and record enough evidence to prove they are real.', 'Five completed paid jobs with minimum required evidence.', true, true, 10),
  ('stage_2_margin_control', 2, 'Margin Control', 'Stage 2 — Margin Control', 'Fake Profit', 'Prove the business is commercially sane, not merely busy.', 'Use your first real job records to prove whether the work is profitable enough to keep building.', '30% gross margin proven over a defined sample.', true, true, 20),
  ('stage_3_repeatable_delivery', 3, 'Repeatable Delivery', 'Stage 3 — Repeatable Delivery', 'Chaos Delivery', 'Convert owner effort into a controllable service system.', 'Turn completed jobs into repeatable delivery standards.', 'Locked preview only in MVP.', true, false, 30),
  ('stage_4_people_layer', 4, 'People Layer', 'Stage 4 — People Layer', 'Owner Bottleneck', 'Add employees or subcontractors without destroying quality, margin, or control.', 'Prepare the business to deliver work through others.', 'Locked preview only in MVP.', true, false, 40),
  ('stage_5_people_control', 5, 'People Control', 'Stage 5 — People Control', 'People Chaos', 'Stabilise labour, quality, communication, and exceptions.', 'Control the people layer before scaling further.', 'Locked preview only in MVP.', true, false, 50),
  ('stage_6_manager_layer', 6, 'Manager Layer', 'Stage 6 — Manager Layer', 'Owner Dependence', 'Move the owner from direct supervision into management by rhythm, reporting, and exception control.', 'Run the business through reports, rhythm, and exceptions.', 'Locked preview only in MVP.', true, false, 60),
  ('stage_7_saleable_business', 7, 'Saleable Business', 'Stage 7 — Saleable Business', 'Unsaleable Job', 'Build a business someone could buy.', 'Create a controlled cleaning operation that does not rely on owner memory.', 'Locked preview only in MVP.', true, false, 70)
on conflict (stage_code) do update set
  stage_number = excluded.stage_number,
  stage_name = excluded.stage_name,
  stage_label = excluded.stage_label,
  dragon_name = excluded.dragon_name,
  purpose = excluded.purpose,
  user_promise = excluded.user_promise,
  unlock_condition = excluded.unlock_condition,
  is_active = excluded.is_active,
  is_mvp_scope = excluded.is_mvp_scope,
  display_order = excluded.display_order,
  updated_at = now();

insert into public.verdict_bands (
  id, label, min_score, max_score, verdict_body, decision_hint,
  scenario, band_code, question_set, version, max_possible_score
) values
  ('64acfb20-acf8-44c0-ab17-5dd94a9249e6', 'Not Ready', 5, 11, 'The candidate is not ready. Core evidence, execution discipline, or operating capability is missing or too weak to rely on.', 'Do not continue yet. The candidate should gather evidence, clarify assumptions, and retest.', 'startup', 'not_viable', 'quick_gate', 'v1', 36),
  ('1d04c2dd-60ce-4529-92c5-009d5f915150', 'High Risk Candidate', 12, 21, 'The candidate presents high readiness risk. Some capability may be present, but the evidence is not yet strong enough to trust under pressure.', 'Continue only with a narrow test and clear evidence requirements. Do not treat this as approval.', 'startup', 'high_risk', 'quick_gate', 'v1', 36),
  ('1315dc13-2f53-45c8-ba97-bf1e893a3c80', 'Provisionally Ready', 22, 29, 'The candidate is provisionally ready. There is enough evidence to continue cautiously, but repeatability and discipline still need to be proven.', 'Proceed cautiously to a bounded test run. Watch the weakest capability area closely.', 'startup', 'viable', 'quick_gate', 'v1', 36),
  ('0a104150-7fc1-44a8-8072-e55ef89fd305', 'Ready for Test Run', 30, 36, 'The candidate is ready for a controlled test run. The answers show useful evidence, discipline, and operating capability, subject to real-world confirmation.', 'Proceed to a controlled test run. Autopsy has not approved the business; it has only found the candidate ready to test.', 'startup', 'structurally_viable', 'quick_gate', 'v1', 36),
  ('6ec92e63-4570-4c4f-9bdd-d12b5c08f49a', 'Stop', 0, 4, 'A non-negotiable candidate-readiness stop condition exists. The candidate has not shown enough evidence, discipline, or capability to continue safely without repair and retesting.', 'Stop. Do not continue until the candidate repairs the failed area and retests.', 'startup', 'critical_stop', 'quick_gate', 'v1', 36)
on conflict (id) do update set
  label = excluded.label,
  min_score = excluded.min_score,
  max_score = excluded.max_score,
  verdict_body = excluded.verdict_body,
  decision_hint = excluded.decision_hint,
  scenario = excluded.scenario,
  band_code = excluded.band_code,
  question_set = excluded.question_set,
  version = excluded.version,
  max_possible_score = excluded.max_possible_score;

insert into public.dimension_recovery_validation (
  id, dimension_code, recovery_signal, validation_standard, created_at
) values
  ('83cd1823-6470-486e-bc47-10f1486f096f', 'market_reality', 'Customer demand validated', 'Real customers demonstrate willingness to pay through payment, booking, or credible commitment', '2026-05-14 07:22:56.251669+00'),
  ('d1b07754-3c89-427b-b62c-35e99f1b5c08', 'psychological_resilience', 'Sustained pressure tolerance demonstrated', 'The operator continues measured execution despite uncertainty, rejection, or operational friction', '2026-05-14 07:22:56.251669+00'),
  ('1ade10be-8141-4a1c-bb3f-d65e41aa3c24', 'economic_literacy', 'Cost drivers and unit economics proven under real operating conditions', 'The operator can clearly explain cost structure, margins, break-even logic, and economic viability using real operational evidence.', '2026-05-14 07:22:56.251669+00'),
  ('8934a1b5-5867-4e98-a710-ed13ae2fc939', 'operational_capacity', 'Delivery repeatability proven under operational pressure', 'The operator can consistently deliver the product or service under real-world operating conditions without collapse.', '2026-05-14 07:22:56.251669+00'),
  ('f1abbd10-839e-44ff-8cd7-8a294908357d', 'cash_reality', 'Cash runway and survival conditions proven', 'The business demonstrates sufficient liquidity and survival runway under realistic operating assumptions.', '2026-05-14 07:22:56.251669+00'),
  ('39380886-2571-46f0-b688-204b7bbaa132', 'execution_discipline', 'Execution consistency demonstrated', 'The operator demonstrates repeatable action, follow-through, and measurable operational execution.', '2026-05-14 07:22:56.251669+00')
on conflict (id) do update set
  dimension_code = excluded.dimension_code,
  recovery_signal = excluded.recovery_signal,
  validation_standard = excluded.validation_standard;

insert into public.dimension_supporting_blocks (
  id, dimension_code, block_key, block_label, block_body, display_order, is_active
) values
  (1, 'cash_reality', 'failure_driver', 'Failure Driver', 'Limited cash runway turns ordinary mistakes into urgent problems. The business has little room to absorb delays, refunds, underpricing, or slow customer conversion.', 10, true),
  (2, 'cash_reality', 'evidence_required', 'Evidence Required', 'Show the actual cash buffer, expected monthly costs, and the number of months the business can survive without reliable income.', 20, true),
  (3, 'cash_reality', 'required_action', 'Required Action', 'Build a safe cash buffer or reduce the operating plan until the runway is clear.', 30, true),
  (4, 'economic_literacy', 'failure_driver', 'Failure Driver', 'Unclear unit economics hide whether the work actually makes money. Revenue can look encouraging while margin, costs, or owner time make the model unsafe.', 10, true),
  (5, 'economic_literacy', 'evidence_required', 'Evidence Required', 'Show pricing, expected gross margin, main cost drivers, and the amount the owner actually keeps after direct costs.', 20, true),
  (6, 'economic_literacy', 'required_action', 'Required Action', 'Prove the numbers on a simple job-level model before adding customers, hiring, or spending more.', 30, true),
  (7, 'market_reality', 'failure_driver', 'Failure Driver', 'Interest is not the same as reliable demand. The business may be assuming customers will buy before the market has actually proven it.', 10, true),
  (8, 'market_reality', 'evidence_required', 'Evidence Required', 'Show real customer conversations, commitments, deposits, bookings, or paid demand rather than opinions or encouragement.', 20, true),
  (9, 'market_reality', 'required_action', 'Required Action', 'Validate demand with real prospects before treating the business as market-ready.', 30, true),
  (10, 'operational_capacity', 'failure_driver', 'Failure Driver', 'Delivery is not yet repeatable. The business may rely on effort, memory, or heroics rather than a system that can perform consistently.', 10, true),
  (11, 'operational_capacity', 'evidence_required', 'Evidence Required', 'Show documented delivery steps, quality checks, timing assumptions, and proof that the work can be repeated under normal pressure.', 20, true),
  (12, 'operational_capacity', 'required_action', 'Required Action', 'Create and test a repeatable delivery process before expanding the workload.', 30, true),
  (13, 'execution_discipline', 'failure_driver', 'Failure Driver', 'The business depends too much on intention and not enough on completed action. Follow-through must be visible before progression is trusted.', 10, true),
  (14, 'execution_discipline', 'evidence_required', 'Evidence Required', 'Show completed tasks, consistent routines, decision records, and proof that commitments are followed through without repeated resets.', 20, true),
  (15, 'execution_discipline', 'required_action', 'Required Action', 'Narrow the operating plan and prove consistent execution on the smallest meaningful workflow.', 30, true),
  (16, 'psychological_resilience', 'failure_driver', 'Failure Driver', 'Pressure tolerance is not yet proven. Stress, uncertainty, or setbacks may distort decisions before the business stabilises.', 10, true),
  (17, 'psychological_resilience', 'evidence_required', 'Evidence Required', 'Show how the operator will handle setbacks, slow uptake, customer pressure, fatigue, and uncertainty without abandoning discipline.', 20, true),
  (18, 'psychological_resilience', 'required_action', 'Required Action', 'Create stress controls and retest under realistic pressure before increasing commitment.', 30, true)
on conflict (id) do update set
  dimension_code = excluded.dimension_code,
  block_key = excluded.block_key,
  block_label = excluded.block_label,
  block_body = excluded.block_body,
  display_order = excluded.display_order,
  is_active = excluded.is_active;

alter table public.dimension_supporting_blocks enable row level security;
drop policy if exists authenticated_read_dimension_supporting_blocks
  on public.dimension_supporting_blocks;
create policy authenticated_read_dimension_supporting_blocks
  on public.dimension_supporting_blocks
  for select
  to authenticated
  using (true);
grant select on public.dimension_supporting_blocks to authenticated;

do $$
begin
  if (select count(*) from public.stage_definitions where is_active) <> 8 then
    raise exception 'Canonical stage definitions are incomplete';
  end if;
  if (select count(*) from public.verdict_bands where scenario = 'startup' and question_set = 'quick_gate') <> 5 then
    raise exception 'Canonical startup verdict bands are incomplete';
  end if;
  if (select count(*) from public.dimension_recovery_validation) <> 6 then
    raise exception 'Canonical recovery validation rows are incomplete';
  end if;
  if (select count(*) from public.dimension_supporting_blocks where is_active) <> 18 then
    raise exception 'Canonical supporting blocks are incomplete';
  end if;
end;
$$;

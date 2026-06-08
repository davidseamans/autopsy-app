-- Correct the Stage 1 test/proof rows so the canonical (ex-GST) commercial
-- values produce the intended gross profit / gross margin in
-- public.stage1_job_margin_summary.
--
-- IMPORTANT data-model context (unchanged by this migration):
--   * stage1_revenue_events.amount  is stored EX-GST.
--   * stage1_job_costs.*_cost        buckets are stored EX-GST.
--   * stage1_job_margin_summary derives revenue_amount / total_direct_cost /
--     gross_profit / gross_margin_pct purely from those EX-GST values.
-- So setting the EX-GST revenue and EX-GST cost totals below is what makes the
-- summary read the required GP / GM. The GST-inclusive gross and the "GST"
-- treatment are NOT stored on these canonical tables (no columns exist for
-- them); they are presentation values derived in the UI. This migration does
-- NOT touch any Core tables (jobs, revenue_events, job_costs, accounts,
-- pipeline, quotes) — only the Stage 1 sandbox tables.
--
-- Targets (EX-GST, the only values the summary view consumes):
--   J-2 David Seamans                  -> revenue 1200, cost 300  -> GP 900, GM 75%
--   J-5 Mr S Blacktop                  -> revenue 1000, cost 400  -> GP 600, GM 60%
--   J-9 Stage1 Persistence Test 2026-06-08 -> revenue 1000, cost 400 -> GP 600, GM 60%
--
-- Idempotent: re-running sets the same target values.

-- ---- Revenue (ex-GST) on the single 'invoice' event per job -----------------
UPDATE public.stage1_revenue_events re
SET amount = v.revenue_ex
FROM public.stage1_jobs j
JOIN (VALUES
  ('David Seamans',                       1200::numeric),
  ('Mr S Blacktop',                       1000::numeric),
  ('Stage1 Persistence Test 2026-06-08',  1000::numeric)
) AS v(client_name, revenue_ex) ON v.client_name = j.client_name
WHERE re.stage1_job_id = j.id
  AND re.revenue_type = 'invoice';

-- ---- Direct cost (ex-GST) total per job ------------------------------------
-- Set a single deterministic bucket so the ex-GST total equals the target; the
-- summary view sums the buckets. Per-line display detail in stage1_job_costs.lines
-- is left untouched.
UPDATE public.stage1_job_costs c
SET labour_cost      = 0,
    consumables_cost = 0,
    travel_cost      = 0,
    rework_cost      = 0,
    other_direct_cost = v.cost_ex
FROM public.stage1_jobs j
JOIN (VALUES
  ('David Seamans',                       300::numeric),
  ('Mr S Blacktop',                       400::numeric),
  ('Stage1 Persistence Test 2026-06-08',  400::numeric)
) AS v(client_name, cost_ex) ON v.client_name = j.client_name
WHERE c.stage1_job_id = j.id;

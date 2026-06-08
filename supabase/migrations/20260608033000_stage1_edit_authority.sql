-- Stage 1 Edit Authority — additive sandbox schema only (no Core tables touched).
--
-- 1) stage1_job_costs.lines (jsonb): preserves the per-line cost detail
--    (description, Job Cost Date, GST treatment, proof name) that the aggregated
--    category buckets cannot hold. The buckets remain the source of truth for
--    margin, so stage1_job_margin_summary and all GST/margin math are unchanged.
--    `lines` is read for display fidelity only.
--
-- 2) stage1_business_expenses (new): per-job General Business Expense lines.
--    Explicitly NOT referenced by the margin view, so GB expenses are never part
--    of a job's gross margin.

-- 1) Per-line cost detail (display-only; never used for margin) --------------
ALTER TABLE public.stage1_job_costs
  ADD COLUMN IF NOT EXISTS lines jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2) Stage 1 General Business Expenses ---------------------------------------
CREATE TABLE IF NOT EXISTS public.stage1_business_expenses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  autopsy_run_id  uuid NOT NULL,
  stage1_job_id   uuid NOT NULL REFERENCES public.stage1_jobs(id) ON DELETE CASCADE,
  expense_date    date,
  supplier        text,
  description     text,
  amount_inc_gst  numeric NOT NULL DEFAULT 0,
  gst_included    boolean NOT NULL DEFAULT true,
  notes           text,
  proof_name      text,
  created_by      uuid NOT NULL DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stage1_business_expenses_run_idx
  ON public.stage1_business_expenses (autopsy_run_id);
CREATE INDEX IF NOT EXISTS stage1_business_expenses_job_idx
  ON public.stage1_business_expenses (stage1_job_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage1_business_expenses TO authenticated;
GRANT ALL ON public.stage1_business_expenses TO service_role;

ALTER TABLE public.stage1_business_expenses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stage1_business_expenses' AND cmd = 'SELECT'
  ) THEN
    CREATE POLICY stage1_business_expenses_select_own ON public.stage1_business_expenses
      FOR SELECT TO authenticated USING (created_by = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stage1_business_expenses' AND cmd = 'INSERT'
  ) THEN
    CREATE POLICY stage1_business_expenses_insert_own ON public.stage1_business_expenses
      FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stage1_business_expenses' AND cmd = 'UPDATE'
  ) THEN
    CREATE POLICY stage1_business_expenses_update_own ON public.stage1_business_expenses
      FOR UPDATE TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stage1_business_expenses' AND cmd = 'DELETE'
  ) THEN
    CREATE POLICY stage1_business_expenses_delete_own ON public.stage1_business_expenses
      FOR DELETE TO authenticated USING (created_by = auth.uid());
  END IF;
END $$;

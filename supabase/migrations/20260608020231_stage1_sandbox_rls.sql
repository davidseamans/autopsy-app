-- Stage 1 / First 5 Jobs commercial proof is persisted in the Stage 1 SANDBOX
-- tables only (never the Core operational tables). These tables already exist
-- (they back the public.stage1_job_margin_summary view), but Stage 1 writes
-- were previously routed to the legacy stage1_revenue_lines / stage1_cost_lines
-- tables. This migration guarantees the sandbox tables are reachable through the
-- Data API and that each authenticated user can manage exactly their own rows,
-- so the dashboard's direct INSERT/UPDATE/DELETE writes succeed under RLS.
--
-- It is intentionally idempotent and additive: it never drops existing policies
-- and only creates owner-scoped policies when a matching one is not present.

ALTER TABLE public.stage1_revenue_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage1_job_costs      ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage1_revenue_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage1_job_costs      TO authenticated;
GRANT ALL ON public.stage1_revenue_events TO service_role;
GRANT ALL ON public.stage1_job_costs      TO service_role;

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY['stage1_revenue_events', 'stage1_job_costs'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl AND cmd = 'SELECT'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (created_by = auth.uid())',
        tbl || '_select_own', tbl);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl AND cmd = 'INSERT'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid())',
        tbl || '_insert_own', tbl);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl AND cmd = 'UPDATE'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid())',
        tbl || '_update_own', tbl);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl AND cmd = 'DELETE'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (created_by = auth.uid())',
        tbl || '_delete_own', tbl);
    END IF;
  END LOOP;
END $$;

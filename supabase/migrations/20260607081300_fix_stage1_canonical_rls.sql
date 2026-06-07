-- Fix Stage 1 canonical persistence: the INSERT/UPDATE/DELETE RLS policies on
-- the four canonical commercial tables were rejecting writes from the owning
-- authenticated user ("new row violates row-level security policy"). As a
-- result NOTHING persisted to Supabase -- the UI only appeared to keep revenue
-- because it was reading the localStorage cache, and job costs showed
-- "Not Yet Recorded" because the cost insert never landed.
--
-- Root cause: the previous policies did not key cleanly off the row owner
-- (created_by = auth.uid()). This migration replaces the row-access policies on
-- the canonical tables with owner-scoped policies so each authenticated user can
-- manage exactly their own rows. GST logic, margin doctrine, evidence storage,
-- the Review/Reflection gates and the Parity Audit are untouched -- this only
-- changes who may read/write the rows.

-- Drop every existing policy on each table so we can recreate cleanly without
-- needing to know the old (unknown) policy names.
DO $$
DECLARE
  pol record;
  tbl text;
  tables text[] := ARRAY[
    'stage1_jobs',
    'stage1_revenue_lines',
    'stage1_cost_lines',
    'stage1_reflections'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE public.stage1_jobs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage1_revenue_lines  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage1_cost_lines     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage1_reflections    ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage1_jobs          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage1_revenue_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage1_cost_lines    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage1_reflections   TO authenticated;
GRANT ALL ON public.stage1_jobs          TO service_role;
GRANT ALL ON public.stage1_revenue_lines TO service_role;
GRANT ALL ON public.stage1_cost_lines    TO service_role;
GRANT ALL ON public.stage1_reflections   TO service_role;

-- stage1_jobs
CREATE POLICY "stage1_jobs_select_own" ON public.stage1_jobs
  FOR SELECT TO authenticated USING (created_by = auth.uid());
CREATE POLICY "stage1_jobs_insert_own" ON public.stage1_jobs
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "stage1_jobs_update_own" ON public.stage1_jobs
  FOR UPDATE TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE POLICY "stage1_jobs_delete_own" ON public.stage1_jobs
  FOR DELETE TO authenticated USING (created_by = auth.uid());

-- stage1_revenue_lines
CREATE POLICY "stage1_revenue_select_own" ON public.stage1_revenue_lines
  FOR SELECT TO authenticated USING (created_by = auth.uid());
CREATE POLICY "stage1_revenue_insert_own" ON public.stage1_revenue_lines
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "stage1_revenue_update_own" ON public.stage1_revenue_lines
  FOR UPDATE TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE POLICY "stage1_revenue_delete_own" ON public.stage1_revenue_lines
  FOR DELETE TO authenticated USING (created_by = auth.uid());

-- stage1_cost_lines
CREATE POLICY "stage1_cost_select_own" ON public.stage1_cost_lines
  FOR SELECT TO authenticated USING (created_by = auth.uid());
CREATE POLICY "stage1_cost_insert_own" ON public.stage1_cost_lines
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "stage1_cost_update_own" ON public.stage1_cost_lines
  FOR UPDATE TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE POLICY "stage1_cost_delete_own" ON public.stage1_cost_lines
  FOR DELETE TO authenticated USING (created_by = auth.uid());

-- stage1_reflections
CREATE POLICY "stage1_reflections_select_own" ON public.stage1_reflections
  FOR SELECT TO authenticated USING (created_by = auth.uid());
CREATE POLICY "stage1_reflections_insert_own" ON public.stage1_reflections
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "stage1_reflections_update_own" ON public.stage1_reflections
  FOR UPDATE TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE POLICY "stage1_reflections_delete_own" ON public.stage1_reflections
  FOR DELETE TO authenticated USING (created_by = auth.uid());

-- Cover the Stage 1 aggregate lead ownership foreign key used by RLS and
-- account cleanup without broadening the candidate-facing funnel model.

create index if not exists stage1_funnel_totals_created_by_idx
  on public.stage1_funnel_totals(created_by);

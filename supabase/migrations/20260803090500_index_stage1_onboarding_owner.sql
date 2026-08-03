-- Supports owner-scoped RLS and the owner foreign key on onboarding progress.
create index if not exists stage1_onboarding_progress_owner_user_id_idx
  on public.stage1_onboarding_progress (owner_user_id);

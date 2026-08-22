-- Add a bounded practice identifier to the existing server-only Hudson session ledger.
-- Start/end status provides lightweight use signals without transcripts, scoring or gates.

alter table public.hudson_session_starts
  add column if not exists practice_key text;

alter table public.hudson_session_starts
  add constraint hudson_session_starts_practice_key_check check (
    practice_key is null
    or practice_key in (
      'customer_opening',
      'price_question',
      'scope_inspection',
      'quote_follow_up',
      'quote_rejection',
      'completion_referral'
    )
  );

create index hudson_session_starts_owner_practice_created_idx
  on public.hudson_session_starts (owner_user_id, practice_key, created_at desc)
  where practice_key is not null;

comment on column public.hudson_session_starts.practice_key is
  'Allow-listed optional First 5 Jobs practice context. Session lifecycle supports start, end and repeat trends; no transcript, response content or maturity score is stored.';

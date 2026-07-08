-- Stage 0 Maturity Overlay Migration
-- Purpose:
-- - Preserve existing public.questions and public.answer_options as the current working source.
-- - Add context capture and conversational overlay tables without breaking existing Autopsy runs.
-- - Keep industry as context only. Stage changes wording, not the maturity dimension or score.

begin;

create table if not exists public.autopsy_context_stage_options (
  code text primary key,
  label text not null,
  description text not null,
  display_order integer not null unique,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.autopsy_context_experience_options (
  code text primary key,
  label text not null,
  description text not null,
  display_order integer not null unique,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.autopsy_question_conversation_variants (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  stage_code text not null references public.autopsy_context_stage_options(code),
  experience_code text null references public.autopsy_context_experience_options(code),
  variant_role text not null default 'candidate_conversation',
  conversational_prompt text not null,
  follow_up_text text null,
  guardrail_text text null,
  version text not null default 'stage0_v1',
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint autopsy_question_conversation_variants_role_check
    check (variant_role in ('candidate_conversation', 'partner_prompt', 'internal_diagnostic')),
  constraint autopsy_question_conversation_variants_unique
    unique (question_id, stage_code, experience_code, variant_role, version)
);

create index if not exists idx_autopsy_question_conversation_variants_question
  on public.autopsy_question_conversation_variants(question_id);

create index if not exists idx_autopsy_question_conversation_variants_stage
  on public.autopsy_question_conversation_variants(stage_code);

create table if not exists public.autopsy_stage0_maturity_notes (
  id uuid primary key default gen_random_uuid(),
  note_key text not null unique,
  note_text text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

insert into public.autopsy_context_stage_options (code, label, description, display_order)
values
  ('startup', 'Startup', 'Starting from scratch.', 1),
  ('acquisition', 'Acquisition', 'Buying an existing business.', 2),
  ('franchise', 'Franchise', 'Buying into a franchise system.', 3),
  ('existing', 'Existing business', 'Already operating and assessing maturity.', 4)
on conflict (code) do update set
  label = excluded.label,
  description = excluded.description,
  display_order = excluded.display_order,
  is_active = true,
  updated_at = now();

insert into public.autopsy_context_experience_options (code, label, description, display_order)
values
  ('never', 'Never owned or run a business before', 'Candidate has no prior ownership or operator experience.', 1),
  ('some', 'Some business or management experience', 'Candidate has some relevant exposure but limited ownership-level responsibility.', 2),
  ('experienced', 'Owned, run, or led businesses before', 'Candidate has prior operator or leadership experience.', 3)
on conflict (code) do update set
  label = excluded.label,
  description = excluded.description,
  display_order = excluded.display_order,
  is_active = true,
  updated_at = now();

insert into public.autopsy_stage0_maturity_notes (note_key, note_text)
values
  ('stage0_maturity_spine', 'The current 12 Autopsy items are treated as the Stage 0 Maturity Spine: founder/candidate readiness, not business viability.'),
  ('industry_context_only', 'Industry is captured as context only. It must not alter the Stage 0 maturity score or turn Autopsy into industry viability assessment.'),
  ('stage_overlay_rule', 'Business stage changes conversational wording only. The underlying maturity dimension, score value, evidence requirement, and verdict logic remain bound to the canonical question.'),
  ('candidate_language_rule', 'Candidate-facing wording should use plain language suitable for low business literacy. Internal diagnostic wording may remain more precise.'),
  ('future_obligations_rule', 'Economic literacy must test whether the candidate understands delayed obligations and knows that money received today is not automatically money available to spend.')
on conflict (note_key) do update set
  note_text = excluded.note_text,
  updated_at = now();

-- Add nullable context fields to autopsy_runs if that table exists.
-- Kept nullable so existing runs remain valid.
do $$
begin
  if to_regclass('public.autopsy_runs') is not null then
    alter table public.autopsy_runs
      add column if not exists business_stage text null references public.autopsy_context_stage_options(code),
      add column if not exists industry_context text null,
      add column if not exists ownership_experience text null references public.autopsy_context_experience_options(code),
      add column if not exists conversation_variant_version text null;
  end if;
end $$;

-- Seed first-pass stage overlays for current active Stage 0 questions.
-- These are intentionally presentation variants; they do not change answer scoring.
with active_questions as (
  select id, q_id
  from public.questions
  where coalesce(is_active, true) = true
)
insert into public.autopsy_question_conversation_variants
  (question_id, stage_code, experience_code, variant_role, conversational_prompt, follow_up_text, guardrail_text, version)
select q.id, v.stage_code, null, 'candidate_conversation', v.prompt, v.follow_up, v.guardrail, 'stage0_v1'
from active_questions q
join (values
  ('CR_01', 'startup', 'If the business takes longer than you hope to start paying you, how long can you personally carry it?', 'This is not testing whether the business is good. It tests whether you understand cash pressure.', 'Avoid business viability judgement.'),
  ('CR_01', 'acquisition', 'If the business earns less than expected after settlement, how long can you personally carry the pressure?', 'This is not testing whether the purchase is attractive. It tests whether you understand cash pressure.', 'Avoid acquisition viability judgement.'),
  ('CR_01', 'franchise', 'After franchise fees and setup costs, how long can you carry the business before it must support you?', 'This is not testing whether the franchise is good. It tests whether you understand cash pressure.', 'Avoid franchise viability judgement.'),
  ('CR_01', 'existing', 'If revenue dropped for several months, how long could you continue operating without panic decisions?', 'This tests cash maturity under pressure.', 'Avoid business viability judgement.'),

  ('CR_02', 'startup', 'What is the bare minimum you need to start safely — cash, tools, supplies, labour, and time?', 'No wishlist. Minimum viable reality only.', 'Avoid business viability judgement.'),
  ('CR_02', 'acquisition', 'What resources do you need at settlement and in the first 90 days to avoid buying yourself a mess?', 'No wishlist. Minimum viable reality only.', 'Avoid acquisition viability judgement.'),
  ('CR_02', 'franchise', 'Beyond the franchise fee, what setup resources do you need before the business can operate safely?', 'No wishlist. Minimum viable reality only.', 'Avoid franchise viability judgement.'),
  ('CR_02', 'existing', 'What resources are currently missing or fragile enough to put the business under pressure?', 'No wishlist. Minimum viable reality only.', 'Avoid business viability judgement.'),

  ('EL_01', 'startup', 'When money comes in, do you know what part is actually yours to spend?', 'Money received today is not automatically money you can spend today.', 'Avoid asking whether the idea is good.'),
  ('EL_01', 'acquisition', 'When the business receives money, do you know what must be kept aside before anything can be treated as yours?', 'This tests whether you understand obligations, costs, and cash timing.', 'Avoid asking whether the acquisition is good.'),
  ('EL_01', 'franchise', 'After sales come in, do you know what must be kept aside for costs, fees, tax, and future payments before anything is yours?', 'This tests whether you understand obligations, costs, and cash timing.', 'Avoid asking whether the franchise is good.'),
  ('EL_01', 'existing', 'When money comes into the business, do you know what is already spoken for before anything can be treated as profit?', 'This tests whether you understand obligations, costs, and cash timing.', 'Avoid business viability judgement.'),

  ('EL_02', 'startup', 'What costs will quietly eat the money if you forget them?', 'This tests whether you can see margin pressure before it bites.', 'Avoid business viability judgement.'),
  ('EL_02', 'acquisition', 'What costs in the business could quietly eat the profit after settlement?', 'This tests whether you can see margin pressure before it bites.', 'Avoid acquisition viability judgement.'),
  ('EL_02', 'franchise', 'What costs, fees, wages, supplies, or payments could quietly eat the profit?', 'This tests whether you can see margin pressure before it bites.', 'Avoid franchise viability judgement.'),
  ('EL_02', 'existing', 'Which costs are quietly damaging margin now or likely to do so soon?', 'This tests whether you can see margin pressure before it bites.', 'Avoid business viability judgement.'),

  ('MR_02', 'startup', 'Who is the customer, what problem are they trying to remove, and why would this offer matter to them?', 'This is not a market-size test. It is a clarity test.', 'Avoid industry attractiveness judgement.'),
  ('MR_02', 'acquisition', 'Who are the customers you would actually be taking responsibility for, and why do they keep buying?', 'This is not a market-size test. It is a clarity test.', 'Avoid acquisition attractiveness judgement.'),
  ('MR_02', 'franchise', 'Who is the customer in your territory, what problem are they paying to remove, and why would they choose this offer?', 'This is not a market-size test. It is a clarity test.', 'Avoid franchise attractiveness judgement.'),
  ('MR_02', 'existing', 'Who is the best customer now, what problem do they pay you to remove, and why do they stay?', 'This is not a market-size test. It is a clarity test.', 'Avoid business viability judgement.'),

  ('MR_01', 'startup', 'What has a real customer already done that counts as evidence, not encouragement?', 'Compliments are not proof. Behaviour is proof.', 'Avoid business viability judgement.'),
  ('MR_01', 'acquisition', 'What evidence do you have that customers, revenue, and demand are real rather than seller-story or wishful thinking?', 'Compliments are not proof. Behaviour is proof.', 'Avoid acquisition viability judgement.'),
  ('MR_01', 'franchise', 'What evidence do you have that customers in your territory or market will actually buy, not just that the franchise system looks good?', 'Compliments are not proof. Behaviour is proof.', 'Avoid franchise viability judgement.'),
  ('MR_01', 'existing', 'What recent evidence shows customers still value and pay for the offer?', 'Compliments are not proof. Behaviour is proof.', 'Avoid business viability judgement.'),

  ('OP_01', 'startup', 'Can you actually deliver this consistently to the required standard?', 'Repeatability is the maturity test.', 'Avoid business viability judgement.'),
  ('OP_01', 'acquisition', 'Can you operate or improve the business after settlement without relying on the seller holding it together?', 'Repeatability is the maturity test.', 'Avoid acquisition viability judgement.'),
  ('OP_01', 'franchise', 'Can you follow the franchise operating model consistently enough for the system to work?', 'Repeatability is the maturity test.', 'Avoid franchise viability judgement.'),
  ('OP_01', 'existing', 'Can the business deliver consistently without relying on last-minute heroics?', 'Repeatability is the maturity test.', 'Avoid business viability judgement.'),

  ('OP_02', 'startup', 'Could the work be written down well enough to repeat the job the same way next time?', 'This is where a bought job starts becoming a business system.', 'Avoid business viability judgement.'),
  ('OP_02', 'acquisition', 'Are the operating steps clear enough that the business can keep working after ownership changes?', 'This is where a bought job starts becoming a business system.', 'Avoid acquisition viability judgement.'),
  ('OP_02', 'franchise', 'Are the required operating steps clear enough for you to follow them repeatedly?', 'This is where a bought job starts becoming a business system.', 'Avoid franchise viability judgement.'),
  ('OP_02', 'existing', 'Are the key operating steps written down well enough for others to repeat them?', 'This is where a bought job starts becoming a business system.', 'Avoid business viability judgement.'),

  ('EX_01', 'startup', 'What concrete action have you already taken that produced evidence?', 'Thinking and research may help, but they are not the same as contact with reality.', 'Avoid business viability judgement.'),
  ('EX_01', 'acquisition', 'What concrete due diligence or operating action have you already taken that produced evidence?', 'Thinking and research may help, but they are not the same as contact with reality.', 'Avoid acquisition viability judgement.'),
  ('EX_01', 'franchise', 'What concrete action have you already taken that produced evidence beyond reading franchise material?', 'Thinking and research may help, but they are not the same as contact with reality.', 'Avoid franchise viability judgement.'),
  ('EX_01', 'existing', 'What concrete action have you taken recently that produced evidence about the business?', 'Thinking and research may help, but they are not the same as contact with reality.', 'Avoid business viability judgement.'),

  ('EX_02', 'startup', 'For the next 30 days, what time can you protect for this without pretending?', 'A vague intention does not count as an execution rhythm.', 'Avoid business viability judgement.'),
  ('EX_02', 'acquisition', 'For the next 30 days, what time can you protect for due diligence and transition planning without pretending?', 'A vague intention does not count as an execution rhythm.', 'Avoid acquisition viability judgement.'),
  ('EX_02', 'franchise', 'For the next 30 days, what time can you protect for validation, setup, and learning the system without pretending?', 'A vague intention does not count as an execution rhythm.', 'Avoid franchise viability judgement.'),
  ('EX_02', 'existing', 'For the next 30 days, what operating rhythm can you protect to improve the business rather than just react to it?', 'A vague intention does not count as an execution rhythm.', 'Avoid business viability judgement.'),

  ('PR_01', 'startup', 'When it gets uncertain or disappointing, are you likely to learn and persist, or keep changing direction?', 'The point is not toughness. The point is whether the work survives discomfort.', 'Avoid business viability judgement.'),
  ('PR_01', 'acquisition', 'When the purchase process becomes uncertain or disappointing, are you likely to stay disciplined or rush/change direction?', 'The point is not toughness. The point is whether the work survives discomfort.', 'Avoid acquisition viability judgement.'),
  ('PR_01', 'franchise', 'When the franchise process becomes harder or slower than expected, are you likely to stay disciplined or rush/change direction?', 'The point is not toughness. The point is whether the work survives discomfort.', 'Avoid franchise viability judgement.'),
  ('PR_01', 'existing', 'When the business becomes uncertain or disappointing, are you likely to stay disciplined or keep changing direction?', 'The point is not toughness. The point is whether the work survives discomfort.', 'Avoid business viability judgement.'),

  ('PR_02', 'startup', 'Can you keep doing the important work when you are tired, unsure, or not getting quick results?', 'This is where the verdict often becomes obvious.', 'Avoid business viability judgement.'),
  ('PR_02', 'acquisition', 'Can you keep doing the important due diligence and transition work when you are tired, unsure, or not getting quick answers?', 'This is where the verdict often becomes obvious.', 'Avoid acquisition viability judgement.'),
  ('PR_02', 'franchise', 'Can you keep doing the important validation and setup work when you are tired, unsure, or not getting quick answers?', 'This is where the verdict often becomes obvious.', 'Avoid franchise viability judgement.'),
  ('PR_02', 'existing', 'Can you keep doing the important operating work when you are tired, unsure, or results are slow?', 'This is where the verdict often becomes obvious.', 'Avoid business viability judgement.')
) as v(q_id, stage_code, prompt, follow_up, guardrail)
  on q.q_id = v.q_id
on conflict (question_id, stage_code, experience_code, variant_role, version) do update set
  conversational_prompt = excluded.conversational_prompt,
  follow_up_text = excluded.follow_up_text,
  guardrail_text = excluded.guardrail_text,
  is_active = true,
  updated_at = now();

commit;

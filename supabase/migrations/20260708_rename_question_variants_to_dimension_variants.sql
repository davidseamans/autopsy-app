-- Rename Autopsy overlay variants from question terminology to dimension terminology.
-- Run after 20260708_stage0_maturity_overlays.sql if that migration has already created the old table.
-- Safe to run even if the old table does not exist.

begin;

do $$
begin
  if to_regclass('public.autopsy_question_conversation_variants') is not null
     and to_regclass('public.autopsy_dimension_conversation_variants') is null then
    alter table public.autopsy_question_conversation_variants
      rename to autopsy_dimension_conversation_variants;
  end if;
end $$;

alter index if exists idx_autopsy_question_conversation_variants_question
  rename to idx_autopsy_dimension_conversation_variants_question;

alter index if exists idx_autopsy_question_conversation_variants_stage
  rename to idx_autopsy_dimension_conversation_variants_stage;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'autopsy_question_conversation_variants_role_check'
  ) then
    alter table public.autopsy_dimension_conversation_variants
      rename constraint autopsy_question_conversation_variants_role_check
      to autopsy_dimension_conversation_variants_role_check;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'autopsy_question_conversation_variants_unique'
  ) then
    alter table public.autopsy_dimension_conversation_variants
      rename constraint autopsy_question_conversation_variants_unique
      to autopsy_dimension_conversation_variants_unique;
  end if;
end $$;

insert into public.autopsy_stage0_maturity_notes (note_key, note_text)
values
  ('dimension_variant_table_rule', 'Conversation variants are named as dimension variants because the canon measures maturity dimensions; question wording is only a presentation overlay.')
on conflict (note_key) do update set
  note_text = excluded.note_text,
  updated_at = now();

commit;

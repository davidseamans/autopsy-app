-- Repair canonical Autopsy reference data when a same-version historical
-- migration collision leaves the option tables present but unseeded.

insert into public.autopsy_context_stage_options
  (code, label, description, display_order)
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

insert into public.autopsy_context_experience_options
  (code, label, description, display_order)
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

grant select on public.autopsy_context_stage_options to authenticated;
grant select on public.autopsy_context_experience_options to authenticated;

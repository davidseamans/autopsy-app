create table if not exists public.morning_orientation_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid,
  report_date date not null default current_date,
  industry text not null default 'cleaning',
  owner_name text not null default 'David',
  overall_signal text not null default 'green' check (overall_signal in ('green','yellow','orange','red','blocked')),
  sections jsonb not null default '[]'::jsonb,
  priorities jsonb not null default '[]'::jsonb,
  yesterday jsonb not null default '[]'::jsonb,
  recommendation text,
  source text not null default 'workflow',
  source_run_id text,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, report_date)
);

create table if not exists public.morning_orientation_checklists (
  id uuid primary key default gen_random_uuid(),
  industry text not null,
  section_key text not null,
  section_label text not null,
  signal_rule text not null,
  priority_weight integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (industry, section_key)
);

alter table public.morning_orientation_reports enable row level security;
alter table public.morning_orientation_checklists enable row level security;

create policy "morning reports readable by authenticated users"
  on public.morning_orientation_reports
  for select
  to authenticated
  using (true);

create policy "morning checklists readable by authenticated users"
  on public.morning_orientation_checklists
  for select
  to authenticated
  using (true);

insert into public.morning_orientation_checklists (industry, section_key, section_label, signal_rule, priority_weight)
values
  ('cleaning', 'business_health', 'Business Health', 'Overall operating health across finance, work delivery, people, and growth.', 10),
  ('cleaning', 'sales', 'Sales', 'Lead response, quote readiness, quote issue delay, and referral readiness.', 20),
  ('cleaning', 'operations', 'Operations', 'Today jobs, access issues, evidence gaps, schedule risk, and unresolved exceptions.', 30),
  ('cleaning', 'finance', 'Finance', 'Invoice requests, overdue debtors, payroll approval, and QBO export status.', 40),
  ('cleaning', 'people', 'People', 'Staff readiness, accepted shifts, expiring certifications, and availability gaps.', 50),
  ('cleaning', 'growth', 'Growth', 'Referral opportunities, recurring work, upsells, and customer advocates.', 60)
on conflict (industry, section_key) do update set
  section_label = excluded.section_label,
  signal_rule = excluded.signal_rule,
  priority_weight = excluded.priority_weight,
  is_active = true,
  updated_at = now();

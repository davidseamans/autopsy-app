# Morning Orientation Runtime Baseline

Status: locked for BuildOS construction

## Decision

Morning Orientation is a BuildOS product function, not a ChatGPT scheduled conversation.

The daily briefing must be generated, stored, audited, and displayed by BuildOS.

## Runtime Flow

```text
Industry checklist
  ↓
n8n / workflow compiler
  ↓
Supabase Core briefing record
  ↓
BuildOS Morning Orientation screen
  ↓
Owner opens Cockpits for detail
```

## Product Rule

The briefing prepares the owner to manage. It is not management itself.

It must remain short, mobile-first, read-only, and complete in under three minutes.

## Data Owner

Supabase Core owns the Morning Orientation record.

ChatGPT can help interpret or improve the briefing, but it must not be the dependable source of delivery.

## Industry Checklist

Each Industry Sleeve defines what matters in the morning report.

Cleaning v1 sections:

1. Business Health
2. Sales
3. Operations
4. Finance
5. People
6. Growth

Each section must produce:

```text
section_key
label
signal
summary
source_facts
```

Signals are standardised:

```text
green = healthy
yellow = attention recommended
orange = action required soon
red = immediate action
blocked = blocked
```

## Briefing Record Shape

```text
morning_orientation_report
  id
  business_id
  report_date
  industry
  owner_name
  generated_at
  sections[]
  priorities[]
  yesterday[]
  recommendation
  source
  source_run_id
```

## n8n Responsibility

n8n assembles the briefing from live operational sources.

It should write one final report record per business per day.

It should not send the owner into workflow execution.

## BuildOS Responsibility

BuildOS reads the latest briefing record and displays it.

If no live record exists, BuildOS displays a safe baseline message rather than failing.

## Construction Sequence

1. Create Morning Orientation record shape.
2. Make the Orientation screen read from Supabase if available.
3. Keep static fallback for resilience.
4. Build Cleaning checklist rules.
5. Connect n8n EOD/Morning compiler to write the report.
6. Later, generalise by Industry Sleeve.

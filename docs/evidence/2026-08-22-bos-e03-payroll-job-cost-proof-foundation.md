# BOS-E03 — Payroll and Job-Cost Proof Foundation

**Date:** 22 August 2026

**Repository:** `davidseamans/autopsy-app`

**Branch:** `codex/payroll-job-cost-proof`

**Base:** BOS-E02 local implementation (`7abcc21d6fc71ff4edd16c98d9bfb3b7d914e040`)

**Authority state:** Internal proof foundation only; the external Employment Hero → QBO → BuildOS completion test remains open.

## Outcome

The provider-neutral proof harness now expresses the exact evidence BuildOS requires before payroll integration can activate:

- permanent Worker mapping;
- proved Employment Hero work-type mapping;
- proved Employment Hero allocation mapping, using the certified Payroll field rather than
  assuming Cost Centre, Location or Dimension are interchangeable;
- proved BuildOS Customer and Job mapping to the corresponding QBO Customer and child Project;
- proved request-to-response correlation;
- one permanent BuildOS identity per approved Time Entry;
- per-item acceptance, rejection or unknown outcome;
- no blind automatic retry after a timeout or indeterminate provider response;
- immutable accepted external Timesheet identity;
- QBO transaction-plus-line deduplication;
- QBO direct-labour reconciliation by Customer/Project at journal-line level;
- governed non-Job references for approved-pool and overhead labour; and
- an explicit blocker whenever Customer/Project identity is absent, belongs to the wrong
  parent Customer or is unmapped.

The governed journal handoff now also requires a finalised, balanced Employment Hero journal,
disables native Employment Hero QBO export for that pay run, preserves every source line ID and
creates one idempotent QBO journal instruction. Only direct-labour debit lines receive a QBO
Customer entity whose reference value is the mapped child Project. Clearing and liability lines
remain unallocated.

QBO Class and Location remain observable fields but cannot satisfy the Job-cost mapping gate.
The harness proves the intended reconciliation shape for two Jobs, one approved pool and one
overhead allocation without claiming that either external sandbox has demonstrated it.

## Corrected external-system boundary

The frozen baseline and owner-supplied product evidence establish the required accounting outcome,
but current official Employment Hero documentation narrows the available transport route:

- BuildOS approved time carries Worker, Work Type and a governed Employment Hero allocation;
- Employment Hero remains authoritative for payroll calculation and statutory records;
- QBO remains authoritative for the resulting payroll accounting transaction; and
- direct labour must reach QBO lines against a Project belonging to the expected Customer.

Employment Hero confirms that its native QBO integration imports the chart of accounts and exports
payroll journals. It also confirms that Cost Centres correlate with QBO Locations. Separately, its
Dimensions guidance states that dimension details are included only for File Export, Detailed File
Export and Microsoft Dynamics Business Central; other journal services may download the dimension
data after finalisation. The native QBO route therefore cannot be treated as proof that a Job reaches
QBO Customer/Project.

The controlled route is now:

1. BuildOS sends approved operational time and the certified Employment Hero allocation reference.
2. Employment Hero calculates and finalises payroll.
3. BuildOS receives the authoritative finalised detailed journal with allocation values.
4. Native Employment Hero QBO export is disabled for that pay run to prevent duplicate accounting.
5. BuildOS creates one idempotent QBO journal instruction, preserving the Employment Hero amounts
   and accounts while attaching the mapped child Project to direct-labour debit lines.
6. BuildOS reads the resulting QBO transaction and reconciles it to the source journal and Time
   Entries.

BuildOS does not calculate payroll, alter statutory results or invent accounting amounts. It performs
a controlled transport and identity-mapping function around Employment Hero's authoritative result.

The repository no longer embeds the unrelated Employment Hero HR API's ten-item batch rule.
Provider batch limits, the available Payroll allocation field, detailed-journal retrieval and
response-correlation mechanics remain certification facts for the Payroll API route actually
approved for implementation.

The repository's existing QBO sandbox boundary remains read-only and does not allowlist Journal
Entry detail. The controlled external proof must confirm detailed-journal retrieval and QBO
Customer/Project behaviour on each useful direct-labour line before production persistence or
activation.

Official Employment Hero evidence:

- https://help.employmenthero.com/hc/en-au/articles/7935281201423-Set-up-my-QuickBooks-Online-Payroll-Integration-on-Payroll-classic
- https://help.employmenthero.com/hc/en-au/articles/7777282627727-Manage-dimensions-and-dimension-values-on-Payroll-classic
- https://help.employmenthero.com/hc/en-au/articles/360001305756-Location-Cost-Centre-does-not-exist-QuickBooks-Error

## Why no database migration is included yet

Persisting a guessed provider payload would fossilise transport mechanics before the providers prove
them. The current module deliberately freezes the identity, Customer/Project relationship,
state-machine, retry and reconciliation rules while leaving provider field names open.

This is not delay disguised as architecture. It is the smallest safe implementation that lets the external spike answer only the remaining questions.

## Validation

- Clean dependency install: passed with an isolated writable npm cache.
- Focused BOS-E03 tests: 14/14 passed across two files.
- Full repository tests: 302/302 passed across 42 files.
- Production build: passed; existing bundle-size and mixed Supabase import warnings remain.
- TypeScript no-emit check: passed.
- `git diff --check`: passed.

## Remaining completion evidence

1. Obtain Employment Hero sandbox/partner access.
2. Prove Worker, Work Type and the exact usable Payroll allocation identifier.
3. Retrieve a finalised detailed journal containing the allocation values.
4. Prove how provider responses correlate to each submitted Time Entry and journal line.
5. Run one payroll containing two Jobs, one approved pool and one overhead allocation.
6. Confirm the governed, balanced journal instruction reaches QBO once with native EH export off.
7. Read the resulting QBO labour-cost lines and prove Customer/Project detail at line level.
8. Replay timeouts, corrections and reads without duplicating Time Entries or cost.

Until those eight facts are evidenced, BOS-E03 remains **In progress / externally blocked**, and production activation is prohibited.

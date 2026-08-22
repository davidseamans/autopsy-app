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
- proved Employment Hero Cost Centre mapping;
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

QBO Class and Location remain observable fields but cannot satisfy the Job-cost mapping gate.
The harness proves the intended reconciliation shape for two Jobs, one approved pool and one
overhead allocation without claiming that either external sandbox has demonstrated it.

## Corrected external-system boundary

The frozen baseline and owner-supplied product evidence establish the intended route:

- BuildOS approved time carries Worker, Work Type and Employment Hero Cost Centre identity;
- Employment Hero remains authoritative for payroll calculation and statutory records;
- QBO remains authoritative for the resulting payroll accounting transaction; and
- direct labour must reach QBO lines against a Project belonging to the expected Customer.

The repository no longer embeds the unrelated Employment Hero HR API's ten-item batch rule.
Provider batch limits and response-correlation mechanics remain configuration and certification
facts for the Payroll API route actually approved for implementation.

The repository's existing QBO sandbox boundary remains read-only and does not allowlist Journal
Entry detail. The controlled external proof must confirm the native Employment Hero export mechanics
and that QBO exposes Customer/Project on each useful direct-labour line before production persistence
or activation.

## Why no database migration is included yet

Persisting a guessed provider payload would fossilise transport mechanics before the providers prove
them. The current module deliberately freezes the identity, Customer/Project relationship,
state-machine, retry and reconciliation rules while leaving provider field names open.

This is not delay disguised as architecture. It is the smallest safe implementation that lets the external spike answer only the remaining questions.

## Validation

- Clean dependency install: passed with an isolated writable npm cache.
- Focused BOS-E03 tests: 10/10 passed.
- Full repository tests: 298/298 passed across 41 files.
- Production build: passed; existing bundle-size and mixed Supabase import warnings remain.
- TypeScript no-emit check: passed.
- `git diff --check`: passed.

## Remaining completion evidence

1. Obtain Employment Hero sandbox/partner access.
2. Prove Worker, Work Type and Cost Centre identifiers.
3. Confirm that each Job Cost Centre reaches the matching QBO Project under the expected Customer.
4. Prove how provider responses correlate to each submitted Time Entry.
5. Run one payroll containing two Jobs, one approved pool and one overhead allocation.
6. Confirm the authoritative payroll accounting result reaches QBO.
7. Read the resulting QBO labour-cost lines and prove Customer/Project detail at line level.
8. Replay timeouts, corrections and reads without duplicating Time Entries or cost.

Until those eight facts are evidenced, BOS-E03 remains **In progress / externally blocked**, and production activation is prohibited.

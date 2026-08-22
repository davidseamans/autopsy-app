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
- proved Job, approved-pool or overhead dimension mapping;
- proved request-to-response correlation;
- one permanent BuildOS identity per approved Time Entry;
- per-item acceptance, rejection or unknown outcome;
- no blind automatic retry after a timeout or indeterminate provider response;
- immutable accepted external Timesheet identity;
- QBO transaction-plus-line deduplication;
- QBO labour-cost reconciliation by proved allocation dimension; and
- an explicit blocker whenever QBO dimension granularity is absent or unmapped.

The harness proves the intended reconciliation shape for two Jobs, one approved pool and one overhead class without claiming that either external sandbox has demonstrated it.

## Current official API evidence

Employment Hero's current official documentation confirms:

- a REST API at `https://api.employmenthero.com`;
- OAuth changes requiring PKCE from 14 September 2026;
- work types mapped to payroll categories;
- bulk Timesheet Entry creation, limited to ten entries per request;
- HTTP 201 may contain partial success and per-item failures; and
- the published create payload includes employee, date, time, breaks, units and optional position, but does not establish the Job/cost-centre dimension BuildOS requires.

Sources:

- https://developer.employmenthero.com/api-references
- https://developer.employmenthero.com/api-references/work-type/get-work-types
- https://developer.employmenthero.com/api-references/timesheet-entry/create-timesheet-entries

The repository's existing QBO sandbox boundary remains read-only and does not allowlist Journal Entry detail. Intuit's live sandbox must establish the useful accounting transaction and dimension shape before BuildOS persists a production reconciliation schema.

## Why no database migration is included yet

Persisting a guessed external Job-dimension field would fossilise an assumption before the provider proves it. The current module deliberately freezes the identity, state-machine, retry and reconciliation rules while leaving provider field names and transport mechanics open.

This is not delay disguised as architecture. It is the smallest safe implementation that lets the external spike answer only the remaining questions.

## Validation

- Focused payroll/operational tests: 23/23 passed across three files.
- TypeScript no-emit check: passed.
- `git diff --check`: passed.

## Remaining completion evidence

1. Obtain Employment Hero sandbox/partner access.
2. Prove Worker and work-type identifiers.
3. Determine and prove the accepted Job/cost-centre dimension route.
4. Prove how bulk partial responses correlate to each submitted Time Entry.
5. Run one payroll containing two Jobs, one approved pool and one overhead class.
6. Confirm the authoritative payroll accounting result reaches QBO.
7. Read the resulting QBO labour-cost lines and prove useful allocation detail.
8. Replay timeouts, corrections and reads without duplicating Time Entries or cost.

Until those eight facts are evidenced, BOS-E03 remains **In progress / externally blocked**, and production activation is prohibited.

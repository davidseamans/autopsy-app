# BOS-E01 — Core Commercial Spine evidence

Date: 22 August 2026

Baseline: `origin/main` at `8760b11eed6e1239dae473b72d76527ed0ba3541`

Authority: frozen Consolidated BUILDOS Product and Feature Profile Matrix, Canon PR #104 (`c04c249b646a05eda0b0de2ed95aa38f989837a6`)

## Delivered boundary

- Reuses the existing `core_accounts`, `core_contacts`, `core_leads`, `core_pipeline`, `core_quotes`, `core_jobs` and Control Tenant membership foundations.
- Adds the universal lineage from Account through immutable Scope and Quote versions, Acceptance, Commercial Baseline and governed Job activation.
- Replaces principal single-UUID relationships with composite `(tenant_id, id)` foreign keys so a valid UUID from another Tenant cannot satisfy a relationship.
- Removes the historical `home_cleaning` default and mandatory constraint from `core_leads.industry_code`; the field remains optional provenance only.
- Permits authenticated reads through Tenant-scoped RLS while material writes occur only through auth-bound governed functions.
- Allows active staff to create intake/draft Scope/draft Quote only. Owner authority is required to issue a Quote, accept it and activate a Job.
- Records immutable Scope versions, Quote versions, Acceptances, Commercial Baselines, activation decisions and state events.
- Makes customer Acceptance a commercial commitment, not an operational activation. Job activation requires confirmed scope, funding, capacity and operational readiness.

## Validation evidence

- Production schema inspection was read-only. No production migration was applied.
- The migration and pgTAP suite were executed together inside one transaction against isolated project `autopsy-pr63-stripe-certification`, then rolled back.
- All 15 database assertions passed, covering Tenant isolation, cross-Tenant FK attacks, role boundaries, immutable versions, commitment/activation separation, blocked activation, successful activation and idempotent retry.
- Post-rollback verification returned `null` for both `public.core_scopes` and `public.core_activate_job_from_baseline(...)`, proving zero residue.
- Application tests: 39 files passed; 279 tests passed.
- Production build: passed.
- Changed TypeScript files: ESLint passed.
- Repository-wide ESLint remains red on the pre-existing baseline (253 errors and 30 warnings in unrelated files); this change adds no lint finding.
- `git diff --check`: passed.

## Explicit exclusions retained

No Cleaning logic, payroll, QBO writes, invoicing, accounts payable, cockpit work or production activation is included.

## Release position

Draft-review evidence only. Database migration publication and production activation remain separately governed.

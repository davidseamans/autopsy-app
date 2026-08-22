# BOS-E02 — Core Operational Spine Evidence

**Date:** 22 August 2026

**Repository:** `davidseamans/autopsy-app`

**Branch:** `codex/operational-spine`

**Base:** BOS-E01 draft implementation (`adbd30cc23d52eb8b2545538f11344b297f37e0d`)

**Authority state:** Draft implementation evidence only; not Ready for Review, merged or activated in production.

## Bounded objective

Extend the existing Core roster foundation into one industry-neutral operational evidence spine:

`Job → Schedule Version → Service Event → Shift → Time Entry → Closeout`

The implementation must preserve completed work when a recurring schedule changes, allocate every Shift to either a real Job or a governed overhead class, stop paid time before closeout, retain Extra Charges without granting customer-price authority, separate quality from additional scope, and gate assignments on credentials and capacity.

## Implemented controls

- Append-only recurring Schedule versions; only future planned Events are cancelled when a new version takes effect.
- Service Events retain their originating Schedule version, Job, Site and Tenant UUID lineage.
- Completed Service Events cannot be rewritten or deleted; started Event timing and Schedule lineage cannot change.
- Existing `core_roster_shifts` is reused. No competing Shift object was created.
- A database XOR constraint requires each Shift to carry either Job lineage or a governed overhead class.
- The weekly roster read model now exposes Job/overhead allocation and Service Event lineage.
- Worker assignment rejects expired/missing credentials and overlapping live Shifts.
- Clock-off creates the bounded actual-time record before closeout evidence may be recorded.
- Extra Charge candidates retain description, quantity, unit and evidence only; no price, margin or billing authority exists in BOS-E02.
- Quality defects and rectifications use explicit linked records; additional scope uses a separate candidate table.
- Browser roles receive Tenant-filtered read access only. Material writes remain behind Tenant- and role-governed functions.
- Core remains industry-neutral; no Cleaning, award, payroll, QBO or invoice interpretation was added.

## Changed files

- `supabase/migrations/20260822093000_core_operational_spine.sql`
- `supabase/tests/core_operational_spine_test.sql`
- `src/lib/core/operationalSpine.ts`
- `src/lib/core/roster.ts`
- `src/lib/core/rosterRepository.ts`
- `src/test/core-operational-spine.test.ts`
- `src/test/core-roster-foundation.test.ts`

## Validation evidence

### PostgreSQL acceptance

The roster foundation, BOS-E01 migration, BOS-E02 migration and BOS-E02 pgTAP suite were executed together inside one transaction against the isolated Supabase test project `edvecqysiftxbwvckqbz`.

- 25 pgTAP assertions completed.
- Cross-Tenant reads and writes were denied.
- Direct authenticated-table mutation was denied.
- Missing credentials and overlapping assignments were blocked.
- A superseded Schedule version could not generate new Events.
- Completed Service Events resisted rewrite.
- Extra Charges contained no customer-price fields.
- Rectification referenced a defect and additional scope remained separate.
- The transaction rolled back.
- A post-run query confirmed zero BOS-E02 relations remained in the test project.

No production Supabase project was changed.

### Repository validation

- `npm ci` — passed; 499 packages installed from the locked dependency graph.
- `npm run build` — passed.
- `npm test` — passed: 40 files, 288 tests.
- Focused Core suite — passed: 4 files, 26 tests.
- `tsc --noEmit` — passed.
- `git diff --check` — passed.

Existing non-blocking build warnings remain: stale Browserslist data, mixed static/dynamic Supabase import, and a large Vite output chunk. Existing test stderr also reports React Router future flags and a Dialog description warning. BOS-E02 introduced no new warning class.

## Explicit exclusions

- Cleaning Sleeve rules or vocabulary.
- Payroll calculation, Employment Hero integration or payroll submission.
- QBO reads or writes and labour-dollar/job-cost reconciliation.
- Customer pricing, Billing Proposals, invoice generation or receivables.
- A/P processing or accounting reconciliation.
- Cockpit/UI expansion.
- Production schema application, production deployment or Control activation.

## Rollback and next authority gate

- Local rollback reference before BOS-E02: `adbd30cc23d52eb8b2545538f11344b297f37e0d`.
- Database acceptance was transactional and left no persistent BOS-E02 objects.
- Next gate after draft publication and green CI: explicit Owner authority to move the draft pull request to Ready for Review.

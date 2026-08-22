# BOS-E04 — QBO Non-Labour Job-Cost Read-Back Foundation

**Date:** 22 August 2026

**Repository:** `davidseamans/autopsy-app`

**Branch:** `codex/qbo-job-cost-readback`

**Base:** BOS-E03 proof foundation (`68b29d8a942c409532a25d136e259573df1d031b`)

**Authority state:** Read-only sandbox contract and reconciliation foundation; live QBO line/dimension certification remains open.

## Boundary implemented

QBO remains the supplier-transaction and accounting authority. BuildOS does not create, correct, reconcile or replace accounts payable.

The QBO sandbox read allowlist now includes the cost-bearing entities required for investigation:

- Bill;
- Purchase;
- JournalEntry; and
- VendorCredit.

This expands read-only capability only. The sandbox capability contract still rejects production, accounting writes and Payments scope.

## Reconciliation behaviour

- Every unique QBO Job-coded cost enters actual Job cost immediately.
- QBO transaction type, transaction ID and line ID form the immutable source identity.
- Identical QBO replay is ignored; conflicting replay is rejected.
- Operational evidence can match one QBO source line only when Job identity agrees.
- Matched, QBO-only and operational-only cases remain explicitly visible.
- One A/P billable signal and one Worker Extra Charge signal collapse into one review-required Charge Candidate.
- An unmatched Worker signal retains its own stable Charge Candidate identity so later QBO matching cannot create a second candidate.
- Stock issues may support quantity, unit and recoverability evidence but cannot assert inventory valuation.
- Contribution preserves separate actual, provisional and derived cost totals.

## Validation

- Focused QBO/payroll tests: 24/24 passed across three files.
- TypeScript no-emit check: passed.
- `git diff --check`: passed.

## Remaining external proof

The Intuit sandbox must still establish:

1. the exact Bill, Purchase, JournalEntry and VendorCredit line shapes available to the connected Australian QBO company;
2. Customer/Project or equivalent Job-dimension placement on each relevant line type;
3. correction, void and deletion behaviour;
4. pagination or CDC strategy and cursor safety;
5. stable transaction and line identity across correction; and
6. one end-to-end case where a QBO-only cost appears, is corrected by the clerk in QBO and returns matched on the next read.

No production QBO connection or accounting write is authorised by this foundation.

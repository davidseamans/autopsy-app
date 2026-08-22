# BOS-E05 — Billing, Invoice and Receivables Foundation

Date: 22 August 2026  
Status: Draft implementation evidence; production activation prohibited

## Implemented boundary

- BuildOS assembles a Billing Proposal from approved work, Extra Charges and Variations through a declared cut-off.
- Recurring items require an explicit standing-authority reference.
- Final Billing Proposals expose unresolved labour, material, Variation, cost-lag, credit and deposit exceptions; authorisation requires explicit acknowledgement.
- One Authorised Billing Instruction creates one governed BuildOS Invoice identity, presentation payload and delivery destination.
- The accounting hand-off is explicitly a QBO `Invoice` transaction, not a journal.
- The QBO idempotency key is derived from the permanent BuildOS Invoice identity.
- A BuildOS Invoice cannot be remapped to a different QBO Invoice after a retry.
- Credits, voids and supplementary invoices retain the original BuildOS Invoice identity.
- Balance and payment status are projections sourced from QBO; BuildOS does not recreate accounts receivable.

## Proof in this slice

`src/test/billing-lifecycle.test.ts` proves proposal cut-off, approval and Job filtering, Extra Charge inclusion, recurring authority, final-exception acknowledgement, Invoice lineage, QBO Invoice—not journal—handoff, retry identity, duplicate-obligation rejection, adjustment lineage and QBO-sourced receivable projection.

## External proof still required

- Intuit sandbox Customer/Project, tax-code, line-item and currency mappings for an Australian QBO Invoice.
- QBO create timeout followed by lookup/recovery of the same Invoice.
- QBO correction, void, credit and supplementary Invoice behaviour with SyncToken changes.
- QBO balance and payment-status read-back after partial and final payment.
- Customer-facing template rendering and delivery evidence.

No QBO write route, customer delivery route or production capability is enabled by this slice.

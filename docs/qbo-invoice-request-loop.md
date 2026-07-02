# QBO Invoice Request Loop

Status: First real accounting interface target

## Decision

The first QBO loop is Invoice Request to QBO Invoice.

Payroll is deliberately excluded from the first live loop because payroll introduces employment, award, super, STP, PAYG, and payslip compliance. Invoice Request proves the Core to accounting-engine pattern with less regulatory surface area.

## Doctrine

BuildOS owns the approved commercial intent.

QBO owns the accounting entry.

```text
Core prepares clean invoice intent.
QBO creates/posts the invoice.
Core receives QBO status.
BuildOS guides operational consequence.
```

## Core Object

`invoice_request`

Lifecycle:

```text
Draft
→ Ready for Review
→ Approved
→ Export Pending
→ Exported
→ Accepted by QBO
→ Posted
→ Paid / Overdue / Written Off
```

## BuildOS Sends to QBO

Minimum payload:

```text
invoice_request_id
account_id
qbo_customer_id
billing_contact
billing_address
job_id
quote_id
line_items
  - description
  - quantity
  - unit_price
  - tax_code_reference
payment_terms
due_date
approval_status
supporting_evidence_links
```

## QBO Returns to BuildOS

Minimum response:

```text
invoice_request_id
qbo_invoice_id
qbo_invoice_number
qbo_status
tax_amount
balance_due
payment_status
paid_date
days_overdue
rejection_reason
raw_qbo_response_reference
```

## BuildOS Must Not Own

```text
GST calculation
ledger posting
debtor ledger
bank reconciliation
BAS reporting
payment allocation
financial statements
```

## BuildOS Owns

```text
What should be billed
Why it should be billed
Who approved it
What evidence supports it
Whether QBO accepted it
Whether it has been paid
What operational consequence follows
```

## First Implementation Shape

1. Create a Supabase `invoice_requests` table.
2. Create a Supabase `qbo_invoice_exports` table.
3. Add an Owner Cockpit card: `Invoice Requests Ready`.
4. Add a manual `Export to QBO` action.
5. Send approved invoice request to QBO sandbox.
6. Store QBO invoice ID, invoice number, status, and response metadata.
7. Surface result back to Owner Cockpit / Finance section.

## Acceptance Test

A test job can produce an approved invoice request.

The invoice request can be exported to QBO sandbox.

QBO returns an invoice ID and invoice number.

BuildOS stores that response against the invoice request.

Owner Cockpit changes the Finance signal from pending export to accepted by QBO.

## Failure Rules

If QBO rejects the request, BuildOS must not silently retry forever.

It must create an exception event with:

```text
invoice_request_id
failure_stage
qbo_error_code
qbo_error_message
recommended_action
requires_human_review = true
```

## Non-Negotiable Boundary

No second accounting package is supported in this loop.

The interface may be designed cleanly, but QBO is the only accounting engine for the first production implementation.

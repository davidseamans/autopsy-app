## Stage 1 Edit Authority Rule — implementation plan

### Required schema changes (stated before implementation, per directive)

The current sandbox cannot persist everything the directive asks for. Two additive, low-risk changes are required. Neither touches Core tables, the quote lifecycle, GST math, or the margin formula.

1. **`public.stage1_job_costs` — add a `lines jsonb` column (default `'[]'`).**
   - Cost lines are currently flattened into category buckets (labour/consumables/travel/rework/other), so per-line **description, Job Cost Date, and GST treatment are lost on refresh**.
   - The new `lines` column stores the per-line array (`{ description, costDate, grossIncGst, gstTreatment, gstAmount, exGst, proofName }`) for display fidelity.
   - The aggregated buckets stay exactly as they are, so `stage1_job_margin_summary` and all margin/GST calculations are unchanged. `lines` is read for display only.

2. **New table `public.stage1_business_expenses`** keyed by `autopsy_run_id` + `stage1_job_id`.
   - Columns: `id`, `autopsy_run_id`, `stage1_job_id`, `expense_date`, `supplier`, `description`, `amount_inc_gst`, `gst_included`, `notes`, `proof_name`, `created_by`, `created_at`.
   - Full GRANTs + RLS (own-rows) matching the existing sandbox-table pattern.
   - GB expenses are explicitly **excluded from job gross margin** (not referenced by the margin view).

```text
stage1_job_costs   : + lines jsonb            (display detail only; buckets unchanged)
stage1_business_expenses (new) : per-job GB expense lines, NOT in margin
```

No schema change is needed for invoice date/ref — they will be persisted onto the existing `stage1_revenue_events` row (`reference`) and cached fields.

### Edit authority (single source: Job / Contract Site Detail)

**Job / Contract Site Detail** becomes the only create/edit/delete surface:
- **Job identity**: make **Client Name** and **Job Site / Location** editable inputs (currently read-only text). Persist to `stage1_jobs.client_name` / `job_title`.
- **Client Invoices**: keep Amount inc GST, Ref #, Invoice Date, GST treatment editable. Add proof **delete** (clears `invoiceDocName` only, keeps amount) and **add/replace**. A separate "Delete invoice" action clears the invoice line (removes the revenue event on save).
- **Job Costs**: add an editable **Job Cost Date** per line. Keep Description, Total inc GST, GST treatment/amount, computed Ex-GST. Per-line proof delete + add/replace. "Remove" stays as line delete (removes line on save). Persist lines to `stage1_job_costs.lines`.
- **General Business Expenses**: convert the read-only list into editable rows (Date, Supplier, Description, Amount inc GST, Notes) plus proof delete/add. Line delete removes the row from `stage1_business_expenses`.
- **Miscellaneous Attachment**: keep Comment; add attachment **delete** and **replace** (currently only add).

All destructive actions use a confirm dialog: **"Delete this item? This cannot be undone."** Deleting a child (proof/line/expense/attachment) never deletes the parent job.

### Read-only screens

- **Detailed Job Cost Report**: already has no inputs — add a single **"Edit in Job / Contract Site Detail"** button that opens the detail sheet for that job. Confirm no delete/upload/input controls.
- **Simple Job Cost Ledger**: keep values read-only; keep the **"Detailed Report"** button and add an explicit **"Edit Job"** button per row (row click already opens detail).
- **KPI cards** and **Quote Conversion Board**: leave as-is (board keeps only its existing quote-lifecycle actions).

### Refresh / consistency behaviour

After any save / delete / proof replace:
1. Persist to the Stage 1 sandbox tables above.
2. Re-fetch the job from sandbox source (existing `fetchStage1Units`), re-hydrating `lines` + GB expenses.
3. Re-fetch dashboard summary from `stage1_job_margin_summary`.
4. Ledger + Detailed Report reflect updated persisted values after refresh.

### Files touched

- `supabase/migrations/<new>.sql` — `lines` column + `stage1_business_expenses` table/RLS/grants.
- `src/lib/stage1Store.ts` — write/read `lines`; load + sync `stage1_business_expenses`; preserve invoice date/ref.
- `src/pages/Stage1.tsx` — editable client/site, Job Cost Date, GB inline edit, proof delete/replace, confirm dialogs, misc attachment delete/replace.
- `src/pages/Stage1Dashboard.tsx` — "Edit Job" button on ledger rows; wire report "Edit in detail".
- `src/components/DetailedJobCostReport.tsx` — add "Edit in Job / Contract Site Detail" button; confirm read-only.

### Constraints honoured

No Core-table writes; no quote-lifecycle changes; GST handling and the ex-GST margin formula unchanged; no write-offs, value adjustments, evidence-type dropdowns; uploads remain optional.

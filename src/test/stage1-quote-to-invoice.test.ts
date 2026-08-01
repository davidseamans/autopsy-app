import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260801041235_stage1_quote_to_invoice.sql"),
  "utf8",
);

describe("Stage 1 quote to invoice contract", () => {
  it("keeps the commercial document chain in Stage 1", () => {
    expect(migration).toContain("public.stage1_quotes");
    expect(migration).toContain("public.stage1_quote_line_items");
    expect(migration).toContain("public.stage1_jobs");
    expect(migration).toContain("public.stage1_revenue_events");
    expect(migration).not.toMatch(/insert into public\.core_/i);
    expect(migration).not.toMatch(/update public\.core_/i);
  });

  it("calculates GST and totals inside the database transaction", () => {
    expect(migration).toContain("v_gst := round(v_subtotal * 0.10, 2)");
    expect(migration).toContain("v_total := v_subtotal + v_gst");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("current_user_has_verified_business_identity()");
    expect(migration).toContain("current_user_can_use_stage1_run(p_run_id)");
  });

  it("preserves quote, job and invoice lineage without duplicate invoices", () => {
    expect(migration).toContain("create_stage1_quote");
    expect(migration).toContain("accept_stage1_quote");
    expect(migration).toContain("create_stage1_invoice_from_quote");
    expect(migration).toContain("stage1_revenue_events_source_quote_invoice_key");
    expect(migration).toContain("source_quote_id = v_quote.id");
    expect(migration).toContain("v_quote.stage1_job_id");
  });

  it("locks accepted commercial terms and snapshots invoice identity", () => {
    expect(migration).toContain("prevent_accepted_stage1_quote_rewrite");
    expect(migration).toContain("Accepted quote details are locked");
    expect(migration).toContain("issuer_business_name");
    expect(migration).toContain("issuer_registered_name");
    expect(migration).toContain("issuer_abn");
  });

  it("allows only the customer-facing business name to change after verification", () => {
    const endpoint = readFileSync(resolve("api/business-identity.ts"), "utf8");
    const setup = readFileSync(resolve("src/pages/BusinessSetup.tsx"), "utf8");
    expect(endpoint).toContain('req.method === "PATCH"');
    expect(endpoint).toContain("business_name: parsedName.data.businessName");
    expect(endpoint).toContain("Only the customer-facing business name can be changed");
    expect(setup).toContain("Your verified identity is locked");
    expect(setup).toContain("australiabusinessnames.com.au");
  });

  it("preserves generated invoice evidence during later job-cost saves", () => {
    const store = readFileSync(resolve("src/lib/stage1Store.ts"), "utf8");
    expect(store).toContain("source.neq.stage1_quote_conversion");
    expect(store).toContain('line.source === "stage1_quote_conversion"');
  });

  it("uses an apprentice-friendly hours and charge-out-rate quote", () => {
    const documents = readFileSync(resolve("src/lib/stage1Documents.ts"), "utf8");
    const quotePage = readFileSync(resolve("src/pages/LaunchpadQuoteNew.tsx"), "utf8");
    const quoteDocument = readFileSync(resolve("src/pages/Stage1QuoteDocument.tsx"), "utf8");
    expect(quotePage).toContain("Your charge-out rate, ex GST");
    expect(quotePage).toContain("Estimated hours");
    expect(quotePage).toContain("Add work item");
    expect(quotePage).not.toContain('label="Quantity"');
    expect(documents).toContain("quantity: item.estimatedHours");
    expect(documents).toContain("unitPriceExGst: input.chargeOutRateExGst");
    expect(quoteDocument).toContain("Estimated hours");
    expect(quoteDocument).toContain("Rate ex GST");
  });

  it("compares quoted hours with one actual-hours total without a timecard", () => {
    const store = readFileSync(resolve("src/lib/stage1Store.ts"), "utf8");
    const stage1 = readFileSync(resolve("src/pages/Stage1.tsx"), "utf8");
    expect(store).toContain("source_stage1_quote_id");
    expect(store).toContain("quotedLabourHours: quotedWork?.hours");
    expect(store).toContain('const actualLabourHours = num("labour_hours")');
    expect(store).toContain("labourHours: u.actualLabourHours ?? 0");
    expect(stage1).toContain("Actual hours worked");
    expect(stage1).toContain("One total for this job—not a timecard.");
    expect(stage1).toContain("Hours variance");
  });

  it("carries the guided consumables budget into job costing", () => {
    const store = readFileSync(resolve("src/lib/stage1Store.ts"), "utf8");
    const stage1 = readFileSync(resolve("src/pages/Stage1.tsx"), "utf8");
    expect(store).toContain("estimated_consumables_cost");
    expect(store).toContain("quotedConsumablesBudget: quotedWork?.consumablesBudget");
    expect(stage1).toContain("Consumables budget");
    expect(stage1).toContain("Actual consumables (ex GST)");
    expect(stage1).toContain("Consumables variance");
  });
});

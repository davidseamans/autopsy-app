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
});

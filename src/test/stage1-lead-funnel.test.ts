import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260801080000_stage1_aggregate_lead_volume.sql"),
  "utf8",
);
const quoteMigration = readFileSync(
  resolve("supabase/migrations/20260801041235_stage1_quote_to_invoice.sql"),
  "utf8",
);
const lineageMigration = readFileSync(
  resolve("supabase/migrations/20260801070000_stage1_lead_quote_job_funnel.sql"),
  "utf8",
);

describe("Stage 1 aggregate lead to quote funnel", () => {
  it("keeps the aggregate lead total inside Stage 1", () => {
    expect(migration).toContain("public.stage1_funnel_totals");
    expect(migration).toContain("lead_count integer");
    expect(migration).not.toMatch(/public\.core_/i);
    expect(migration).not.toMatch(/public\.(leads|quotes|jobs)\s/i);
  });

  it("stores no individual prospect details before quoting", () => {
    expect(migration).toContain("Cumulative Stage 1 lead volume only");
    expect(migration).not.toContain("client_name");
    expect(migration).not.toContain("contact_email");
    expect(migration).not.toContain("site_address");
  });

  it("protects the total with verified Stage 1 ownership", () => {
    expect(migration).toContain("current_user_has_verified_business_identity");
    expect(migration).toContain("current_user_can_use_stage1_run");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("from public, anon");
  });

  it("uses one cumulative total rather than individual lead creation", () => {
    const funnel = readFileSync(resolve("src/lib/stage1Funnel.ts"), "utf8");
    const page = readFileSync(resolve("src/pages/LaunchpadLeads.tsx"), "utf8");
    expect(funnel).toContain('rpc("set_stage1_lead_count"');
    expect(funnel).not.toContain("create_stage1_lead");
    expect(page).toContain("Total leads received");
    expect(page).not.toContain("Customer or prospect");
  });

  it("captures customer details at quote creation and preserves quote-to-job routing", () => {
    const documents = readFileSync(resolve("src/lib/stage1Documents.ts"), "utf8");
    const quotePage = readFileSync(resolve("src/pages/LaunchpadQuoteNew.tsx"), "utf8");
    const dashboard = readFileSync(resolve("src/pages/Stage1Dashboard.tsx"), "utf8");
    expect(documents).toContain('rpc("create_stage1_guided_quote"');
    expect(documents).toContain("p_run_id: input.runId");
    expect(documents).toContain("p_client_name: input.clientName");
    expect(documents).toContain("p_clean_type_code: input.cleanTypeCode");
    expect(quotePage).not.toContain('searchParams.get("leadId")');
    expect(quotePage).toContain("Customer and work details begin here");
    expect(quoteMigration).toContain("create or replace function public.create_stage1_quote");
    expect(quoteMigration).toContain("insert into public.stage1_leads");
    expect(quoteMigration).toContain("insert into public.stage1_quotes");
    expect(lineageMigration).toContain("source_stage1_quote_id");
    expect(lineageMigration).toContain("v_quote.stage1_lead_id, v_quote.id");
    expect(dashboard).toContain("/launchpad/leads?runId=");
  });
});

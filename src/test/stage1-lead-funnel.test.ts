import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260801080000_stage1_aggregate_lead_volume.sql"),
  "utf8",
);
const indexMigration = readFileSync(
  resolve("supabase/migrations/20260801091000_stage1_funnel_totals_created_by_index.sql"),
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
    expect(indexMigration).toContain("stage1_funnel_totals_created_by_idx");
    expect(indexMigration).toContain("public.stage1_funnel_totals(created_by)");
  });

  it("keeps candidate lead entry in the existing dashboard drilldown", () => {
    const funnel = readFileSync(resolve("src/lib/stage1Funnel.ts"), "utf8");
    const dashboard = readFileSync(resolve("src/pages/Stage1Dashboard.tsx"), "utf8");
    expect(funnel).toContain('rpc("set_stage1_lead_count"');
    expect(funnel).not.toContain("create_stage1_lead");
    expect(dashboard).toContain("Lead Method Performance");
    expect(dashboard).toContain("Log Activity");
    expect(dashboard).not.toContain("Record Leads");
    expect(dashboard).not.toContain("Quotes Generated");
    expect(dashboard).not.toContain("Quote Details Required");
    expect(dashboard).not.toContain("matching quote details");
    expect(existsSync(resolve("src/pages/Stage1Leads.tsx"))).toBe(false);
  });

  it("captures customer details at quote creation and preserves quote-to-job routing", () => {
    const documents = readFileSync(resolve("src/lib/stage1Documents.ts"), "utf8");
    const quotePage = readFileSync(resolve("src/pages/Stage1QuoteNew.tsx"), "utf8");
    const quotesPage = readFileSync(resolve("src/pages/Stage1Quotes.tsx"), "utf8");
    const dashboard = readFileSync(resolve("src/pages/Stage1Dashboard.tsx"), "utf8");
    expect(documents).toContain('rpc("create_stage1_guided_quote"');
    expect(documents).toContain("p_run_id: input.runId");
    expect(documents).toContain("p_client_name: input.clientName");
    expect(documents).toContain("p_clean_type_code: input.cleanTypeCode");
    expect(quotePage).not.toContain('searchParams.get("leadId")');
    expect(quotePage).toContain("Customer and work details begin here");
    expect(quotesPage).toContain("Create a quote");
    expect(quotesPage).toContain("An accepted quote becomes a First 5 Jobs job");
    expect(quoteMigration).toContain("create or replace function public.create_stage1_quote");
    expect(quoteMigration).toContain("insert into public.stage1_leads");
    expect(quoteMigration).toContain("insert into public.stage1_quotes");
    expect(lineageMigration).toContain("source_stage1_quote_id");
    expect(lineageMigration).toContain("v_quote.stage1_lead_id, v_quote.id");
    expect(dashboard).toContain("Lead Method Performance");
  });

  it("keeps Stage 1 navigation separate from Core and carries the run context", () => {
    const shell = readFileSync(resolve("src/components/AppShell.tsx"), "utf8");
    const routes = readFileSync(resolve("src/App.tsx"), "utf8");
    expect(shell).toContain('{ title: "Quotes", url: "/stage-1/quotes" }');
    expect(shell).not.toContain('{ title: "Leads", url: "/stage-1/leads" }');
    expect(shell).not.toContain('{ title: "Launchpad"');
    expect(shell).toContain("encodeURIComponent(runId)");
    expect(routes).toContain('path="/stage-1/quotes/new"');
    expect(routes).toContain('path="/launchpad"');
    expect(routes).toContain('LegacyStage1Redirect to="/stage-1"');
  });
});

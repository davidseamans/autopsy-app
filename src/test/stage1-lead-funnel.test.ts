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

  it("protects the total with verified Stage 1 ownership", () => {
    expect(migration).toContain("current_user_has_verified_business_identity");
    expect(migration).toContain("current_user_can_use_stage1_run");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("from public, anon");
    expect(indexMigration).toContain("stage1_funnel_totals_created_by_idx");
    expect(indexMigration).toContain("public.stage1_funnel_totals(created_by)");
  });

  it("keeps prospecting aggregate and unnamed in the dashboard drilldown", () => {
    const funnel = readFileSync(resolve("src/lib/stage1Funnel.ts"), "utf8");
    const dashboard = readFileSync(resolve("src/pages/Stage1Dashboard.tsx"), "utf8");
    const matrix = readFileSync(resolve("src/components/Stage1LeadMatrix.tsx"), "utf8");
    expect(funnel).toContain('rpc("set_stage1_lead_count"');
    expect(funnel).toContain('.from("stage1_lead_activities")');
    expect(dashboard).toContain("Lead Method Performance");
    expect(dashboard).toContain("Log lead activity");
    expect(dashboard).toContain("Record only the date, method and volume");
    expect(dashboard).not.toContain("Lead / business name");
    expect(matrix).toContain("Six-week lead-source graph");
    expect(dashboard).not.toContain("Quotes Generated");
    expect(dashboard).not.toContain("Quote Details Required");
    expect(dashboard).not.toContain("matching quote details");
    expect(dashboard).not.toContain('<TableHead className="text-right">Quotes</TableHead>');
    expect(dashboard).not.toContain('<TableHead className="text-right">Jobs</TableHead>');
    expect(dashboard).not.toContain("<TableHead>Notes</TableHead>");
    expect(dashboard).not.toContain('setDrill("conversions")');
    expect(dashboard).toContain("/stage-1/quotes?runId=");
    expect(existsSync(resolve("src/pages/Stage1Leads.tsx"))).toBe(false);
  });

  it("derives lead totals and the graph from aggregate activity rather than named contacts", () => {
    const dashboard = readFileSync(resolve("src/pages/Stage1Dashboard.tsx"), "utf8");
    expect(dashboard).toContain("activity.leads_generated");
    expect(dashboard).toContain("activities={activities}");
    expect(dashboard).not.toContain("leadRecords.filter((lead) => lead.source === method).length");
  });

  it("captures customer details at quote creation and preserves quote-to-job routing", () => {
    const documents = readFileSync(resolve("src/lib/stage1Documents.ts"), "utf8");
    const quotePage = readFileSync(resolve("src/pages/Stage1QuoteNew.tsx"), "utf8");
    const quotesPage = readFileSync(resolve("src/pages/Stage1Quotes.tsx"), "utf8");
    const dashboard = readFileSync(resolve("src/pages/Stage1Dashboard.tsx"), "utf8");
    expect(documents).toContain('"create_stage1_guided_quote_from_contact"');
    expect(documents).toContain('{ p_contact_id: input.contactId }');
    expect(documents).toContain("p_client_name: input.clientName");
    expect(documents).toContain("p_clean_type_code: input.cleanTypeCode");
    expect(quotePage).toContain('searchParams.get("contactId")');
    expect(quotePage).toContain("loadStage1Contact(contactId)");
    expect(quotePage).toContain("Customer and work details begin here");
    expect(quotesPage).toContain("Create a quote");
    expect(quotesPage).toContain("Potential quotes");
    expect(quotesPage).toContain("Capture only enough detail to arrange the appointment");
    expect(quotesPage).toContain('label="Outstanding"');
    expect(quotesPage).toContain('label="Rejected"');
    expect(quotesPage).toContain('label="Accepted"');
    expect(quotesPage).not.toContain('label="Jobs"');
    expect(quotesPage).toContain("acceptStage1Quote");
    expect(quotesPage).toContain("setStage1QuoteRejected");
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

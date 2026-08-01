import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260801070000_stage1_lead_quote_job_funnel.sql"),
  "utf8",
);

describe("Stage 1 lead to job funnel", () => {
  it("keeps all funnel records inside Stage 1", () => {
    expect(migration).toContain("public.stage1_leads");
    expect(migration).toContain("public.stage1_quotes");
    expect(migration).toContain("public.stage1_jobs");
    expect(migration).not.toMatch(/public\.core_/i);
    expect(migration).not.toMatch(/public\.(leads|quotes|jobs)\s/i);
  });

  it("requires a real lead before the standard quote is created", () => {
    expect(migration).toContain("create_stage1_lead");
    expect(migration).toContain("create_stage1_quote_from_lead");
    expect(migration).toContain("where id = p_lead_id and created_by = v_user_id for update");
    expect(migration).toContain("stage1_lead_id");
  });

  it("preserves direct lead and quote lineage on the accepted job", () => {
    expect(migration).toContain("source_stage1_lead_id");
    expect(migration).toContain("source_stage1_quote_id");
    expect(migration).toContain("stage1_jobs_source_quote_key");
    expect(migration).toContain("v_quote.stage1_lead_id, v_quote.id");
  });

  it("moves the lead with its quote outcome", () => {
    expect(migration).toContain("status = 'won'");
    expect(migration).toContain("set_stage1_quote_outcome");
    expect(migration).toContain("then 'quoted' else 'lost'");
  });

  it("routes the written quote through the selected Stage 1 lead", () => {
    const documents = readFileSync(resolve("src/lib/stage1Documents.ts"), "utf8");
    const quotePage = readFileSync(resolve("src/pages/LaunchpadQuoteNew.tsx"), "utf8");
    const dashboard = readFileSync(resolve("src/pages/Stage1Dashboard.tsx"), "utf8");
    expect(documents).toContain('rpc("create_stage1_quote_from_lead"');
    expect(documents).toContain("p_lead_id: input.leadId");
    expect(quotePage).toContain('searchParams.get("leadId")');
    expect(dashboard).toContain("/launchpad/leads?runId=");
  });
});

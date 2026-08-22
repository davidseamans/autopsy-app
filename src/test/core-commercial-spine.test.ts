import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMMERCIAL_LINEAGE,
  evaluateCommercialActivation,
} from "@/lib/core/commercialSpine";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260822080000_core_commercial_spine.sql"),
  "utf8",
);

describe("BOS-E01 Core commercial spine", () => {
  it("keeps the approved universal lineage explicit", () => {
    expect(COMMERCIAL_LINEAGE).toEqual([
      "account",
      "contact",
      "lead",
      "opportunity",
      "scopeVersion",
      "quoteVersion",
      "acceptance",
      "commercialBaseline",
      "jobActivation",
    ]);
  });

  it("does not activate a Job merely because the customer accepted", () => {
    expect(evaluateCommercialActivation({
      scopeConfirmed: true,
      fundingConfirmed: false,
      capacityConfirmed: true,
      operationalReadinessConfirmed: true,
    })).toEqual({ ready: false, missing: ["fundingConfirmed"] });
  });

  it("requires all four operational readiness facts", () => {
    expect(evaluateCommercialActivation({
      scopeConfirmed: true,
      fundingConfirmed: true,
      capacityConfirmed: true,
      operationalReadinessConfirmed: true,
    })).toEqual({ ready: true, missing: [] });
  });

  it("hardens every principal lineage edge with the Tenant UUID", () => {
    for (const edge of [
      "core_contacts_account_tenant_fk",
      "core_sites_account_tenant_fk",
      "core_pipeline_account_tenant_fk",
      "core_pipeline_site_tenant_fk",
      "core_pipeline_lead_tenant_fk",
      "core_quotes_pipeline_tenant_fk",
      "core_quotes_site_tenant_fk",
      "core_quotes_lead_tenant_fk",
      "core_quotes_job_tenant_fk",
      "core_jobs_quote_tenant_fk",
      "core_jobs_site_tenant_fk",
      "core_jobs_account_tenant_fk",
      "core_jobs_pipeline_tenant_fk",
      "core_jobs_lead_tenant_fk",
    ]) {
      expect(migration).toContain(edge);
    }
  });

  it("adds immutable commercial versions and append-only authority evidence", () => {
    for (const table of [
      "core_scopes",
      "core_scope_versions",
      "core_quote_versions",
      "core_quote_acceptances",
      "core_commercial_baselines",
      "core_job_activation_decisions",
      "core_commercial_state_events",
    ]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("core_reject_immutable_commercial_change");
    expect(migration).not.toMatch(/grant\s+(insert|update|delete).*to authenticated/i);
  });

  it("keeps Core industry-neutral", () => {
    expect(migration).toContain("alter column industry_code drop default");
    expect(migration).toContain("alter column industry_code drop not null");
    expect(migration).not.toContain("'home_cleaning'");
    expect(migration).not.toMatch(/award|chemical|toilet|cleaning task/i);
  });

  it("exposes only governed functions for material state changes", () => {
    expect(migration).toContain("core_record_quote_acceptance");
    expect(migration).toContain("core_activate_job_from_baseline");
    expect(migration).toContain("role = 'owner'");
    expect(migration).toContain("revoke all on function");
  });
});

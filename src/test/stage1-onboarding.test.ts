import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(path), "utf8");

describe("First 5 Jobs orientation", () => {
  it("is reachable from the candidate dashboard and continues to Business Details", () => {
    const routes = read("src/App.tsx");
    const dashboard = read("src/pages/Stage1Dashboard.tsx");
    const page = read("src/pages/Stage1Orientation.tsx");

    expect(routes).toContain('path="/stage-1/orientation"');
    expect(dashboard).toContain("Begin orientation");
    expect(dashboard).toContain("Review orientation");
    expect(page).toContain("Save and set up Business Details");
    expect(page).toContain("/business-setup?runId=");
  });

  it("separates ABN and business-name paths without collecting a TFN", () => {
    const page = read("src/pages/Stage1Orientation.tsx");
    const migration = read("supabase/migrations/20260803090000_stage1_onboarding_orientation.sql");

    expect(page).toContain("I already have an ABN");
    expect(page).toContain("I need to apply for an ABN");
    expect(page).toContain("Trade under my own legal name");
    expect(page).toContain("Register a different business name");
    expect(page).toContain("John Smith Cleaning is different from John Smith");
    expect(page).toContain("Old unregistered trading names do not count");
    expect(page).toContain("BuildOS never asks for or stores your TFN");
    expect(migration).not.toMatch(/\btfn\s+(text|varchar|character)/i);
  });

  it("owner-scopes progress and preserves the verified Business Details gate", () => {
    const migration = read("supabase/migrations/20260803090000_stage1_onboarding_orientation.sql");

    expect(migration).toContain("enable row level security");
    expect(migration).toContain("owner_user_id = (select auth.uid())");
    expect(migration).toContain("current_user_can_use_stage1_run(autopsy_run_id)");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("revoke all on public.stage1_onboarding_progress from anon, authenticated");
  });

  it("uses video for welcome and Snagit Step for maintainable instructions", () => {
    const pack = read("docs/product/FIRST-5-JOBS-ONBOARDING-PRODUCTION-PACK-v1.md");
    const guide = read("src/components/Stage1WelcomeGuide.tsx");

    expect(pack).toContain("In-app guided walkthrough");
    expect(pack).toContain("Snagit Step guide");
    expect(pack).toContain("Do not combine both into one long recording");
    expect(pack).toContain("Never collect or retain a TFN");
    expect(guide).toContain("/api/autopsy-speech");
    expect(guide).toContain("Jane · First 5 Jobs handover");
    expect(guide).toContain("requestRef.current?.abort()");
    expect(guide).toContain("playbackId !== playbackIdRef.current");
    expect(guide).toContain("Accepted quote creates the job");
    expect(guide).toContain("First 5 Jobs creates the job and its invoice");
  });
});

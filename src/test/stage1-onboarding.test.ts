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
    const page = read("src/pages/Stage1Orientation.tsx");

    expect(pack).toContain("In-app guided walkthrough");
    expect(pack).toContain("Snagit Step guide");
    expect(pack).toContain("Do not combine both into one long recording");
    expect(pack).toContain("Never collect or retain a TFN");
    expect(guide).toContain("/api/autopsy-speech");
    expect(guide).toContain("Jane · live First 5 Jobs tour");
    expect(guide).toContain("requestRef.current?.abort()");
    expect(guide).toContain("playbackId !== playbackIdRef.current");
    expect(guide).toContain("This is the Leads card");
    expect(guide).toContain("This is the Leads drill-down");
    expect(guide).toContain("The Conversions card opens Quotes");
    expect(guide).toContain("Jane will never do that for you");
    expect(guide).toContain("stage1-tour-position");
    expect(guide).toContain("Grab here to move the tour");
    expect(guide).toContain("Use Print or save PDF");
    expect(guide).toContain("There is no separate draft or issue step");
    expect(guide).toContain("Open the Job Cost Summary");
    expect(guide).toContain("Review and send the final invoice");
    expect(guide).toContain("Resume 5 Jobs Tour");
    expect(guide).toContain("navigationCheckpoint");
    expect(guide).toContain("TOTAL_TOUR_STEPS");
    expect(guide).toContain('quotes: { slides: [dashboardSlides[3], ...quotesSlides], offset: 3 }');
    expect(guide).toContain("autoPlay");
    expect(guide).toContain("> Back</Button>");
    expect(guide).toContain('speaking ? "Pause"');
    expect(guide).toContain('"Forward"');
    expect(guide).not.toMatch(/\breal\b/i);
    expect(page).toContain("Tour your actual First 5 Jobs screen");
    expect(page).toContain("&tour=1");
  });

  it("keeps the guided sample workspace isolated from candidate transactions", () => {
    const demo = read("src/lib/stage1Demo.ts");
    const quotes = read("src/pages/Stage1Quotes.tsx");
    const document = read("src/pages/Stage1QuoteDocument.tsx");
    const builder = read("src/pages/Stage1QuoteNew.tsx");
    const dashboard = read("src/pages/Stage1Dashboard.tsx");

    expect(demo).toContain("demo-q-1004");
    expect(demo).toContain('status: "rejected"');
    expect(demo).toContain('status: "accepted"');
    expect(quotes).toContain("This is sample data. No status was changed.");
    expect(quotes).toContain('disabled={isDemo || working || status === "accepted"}');
    expect(document).toContain('disabled={isDemo || working}');
    expect(builder).toContain("STAGE1_DEMO_CLEAN_TYPES");
    expect(builder).toContain("Generate and Open Quote");
    expect(builder).toContain("generateAndOpenQuote");
    expect(builder).toContain('navigate(`/stage-1/quote/${created.quoteId}');
    expect(builder).toContain("{!isDemo ?");
    expect(dashboard).toContain("tourInteractive={isDemo || tourActive}");
    expect(dashboard).toContain("readOnly={isDemo}");
    expect(dashboard).toContain("if (isDemo) window.setTimeout(() => openReport(n), 350)");
    expect(dashboard).toContain("if (tourInteractive) event.preventDefault()");
  });

  it("adds a versioned First 5 Jobs learning library without changing progression", () => {
    const routes = read("src/App.tsx");
    const dashboard = read("src/pages/Stage1Dashboard.tsx");
    const learning = read("src/pages/Stage1Learning.tsx");
    const client = read("src/lib/stage1Learning.ts");
    const migration = read("supabase/migrations/20260804100000_stage1_learning_library.sql");

    expect(routes).toContain('path="/stage-1/learning"');
    expect(dashboard).toContain("Open learning library");
    expect(learning).toContain("Getting Your First Five Jobs");
    expect(learning).toContain("Where your first leads are");
    expect(learning).toContain("What to say");
    expect(learning).toContain("Two correct answers out of three completes the lesson");
    expect(learning).toContain("does not change your Autopsy result or progression gate");
    expect(client).toContain('STAGE1_COURSE_KEY = "getting_your_first_five_jobs"');
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("owner_user_id = (select auth.uid())");
    expect(migration).toContain("current_user_can_use_stage1_run(autopsy_run_id)");
    expect(migration).toContain("security invoker");
    expect(migration).not.toMatch(/transcript\s+(text|json|jsonb)|raw_audio\s+(text|json|jsonb)|maturity_score/i);
  });

  it("includes customer and personal referrals in the Stage 1 lead methods", () => {
    const dashboard = read("src/pages/Stage1Dashboard.tsx");
    expect(dashboard).toContain('"Customer Referral"');
    expect(dashboard).toContain('"Personal Referral"');
  });

  it("adds Sprint 2 lessons on presentation and charge-out rates", () => {
    const learning = read("src/pages/Stage1Learning.tsx");
    const migration = read("supabase/migrations/20260804130000_unlock_stage1_learning_lessons_3_4.sql");

    expect(learning).toContain('key: "presentation_before_discounting"');
    expect(learning).toContain('title: "Present well—do not compete by being cheap"');
    expect(learning).toContain('key: "charge_out_rate"');
    expect(learning).toContain('title: "Your work rate is not your charge-out rate"');
    expect(learning).toContain('label="Available now" value="4"');
    expect(migration).toContain("'presentation_before_discounting'");
    expect(migration).toContain("'charge_out_rate'");
    expect(migration).toContain("security invoker");
    expect(migration).not.toMatch(/maturity_score|progression_gate|core_admission/i);
  });
});

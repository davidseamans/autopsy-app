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
    expect(dashboard).toContain("Set up First 5 Jobs");
    expect(dashboard).toContain("Review setup choices");
    expect(page).toContain("Save choices and open Business Details");
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

  it("treats orientation as support and saves only operational setup choices", () => {
    const page = read("src/pages/Stage1Orientation.tsx");
    const client = read("src/lib/stage1Onboarding.ts");
    const migration = read("supabase/migrations/20260814043000_stage1_setup_choices_not_acknowledgements.sql");
    const shell = read("src/components/AppShell.tsx");

    expect(page).toContain("Hudson is your guide and support person throughout First 5 Jobs");
    expect(page).toContain("Useful starting guidance—not a test or acknowledgement");
    expect(page).toContain("Check the requirements of each target market before you approach it");
    expect(page).toContain("regulated child-related cleaning work in Queensland can require a current blue card");
    expect(page).not.toMatch(/welcomeAcknowledged|operatingStandardsAcknowledged|CheckLine/);
    expect(client).toContain('supabase.rpc("save_stage1_setup_choices"');
    expect(client).not.toMatch(/p_welcome_acknowledged|p_operating_standards_acknowledged/);
    expect(migration).toContain("Legacy compatibility field. No longer collected or used for progression.");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("current_user_can_use_stage1_run(p_run_id)");
    expect(shell).toContain('label="Ask Hudson"');
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
    expect(guide).toContain("Hudson · First 5 Jobs screen guide");
    expect(guide).toContain("requestRef.current?.abort()");
    expect(guide).toContain("playbackId !== playbackIdRef.current");
    expect(guide).toContain("This is the Leads card");
    expect(guide).toContain("This is the Leads drill-down");
    expect(guide).toContain("The Conversions card opens Quotes");
    expect(guide).toContain("Hudson will never do that for you");
    expect(guide).toContain("stage1-tour-position");
    expect(guide).toContain("Grab here to move the tour");
    expect(guide).toContain('bottom: "auto"');
    expect(guide).toContain("keepInViewport");
    expect(guide).toContain('window.addEventListener("resize", keepInViewport)');
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
    expect(page).toContain("Open Hudson and tour First 5 Jobs");
    expect(page).toContain("Tour without live video");
    expect(page).toContain("&tour=1");
    expect(page).not.toContain("I understand how First 5 Jobs works");
    expect(page).not.toContain("Orientation already completed");
    expect(page).not.toContain("Welcome from Hudson");
  });

  it("makes every Hudson focus control deterministic", () => {
    const dock = read("src/components/HudsonDock.tsx");

    expect(dock).toContain('const pathname = area === "quotes" ? "/stage-1/quotes" : "/stage-1"');
    expect(dock).toContain('focusRequest: String(++focusRequestRef.current)');
    expect(dock.match(/focusRequest: String\(\+\+focusRequestRef\.current\)/g)).toHaveLength(2);
    expect(dock).toContain('tour: "hudson"');
    expect(dock).toContain("step: String(target.step)");
    expect(dock).toContain("Return to First 5 Jobs dashboard");
    expect(dock).not.toContain("Show Hudson beside First 5 Jobs");
    expect(read("src/pages/Stage1Dashboard.tsx")).toContain('reveal(\'[data-hudson-focus="money-owing"]\')');
    expect(read("src/pages/Stage1Dashboard.tsx")).toContain('reveal(\'[data-hudson-focus="margin"]\')');
  });

  it("keeps lead activity totals and identified potential customers in one governed flow", () => {
    const dashboard = read("src/pages/Stage1Dashboard.tsx");
    const funnel = read("src/lib/stage1Funnel.ts");
    const matrix = read("src/components/Stage1LeadMatrix.tsx");
    const migration = read("supabase/migrations/20260814011500_stage1_lead_activity_contacts.sql");

    expect(dashboard).toContain("Potential customers identified");
    expect(dashboard).toContain("Potential-customer contact details");
    expect(dashboard).toContain("Save activity and potential customers");
    expect(dashboard).toContain("createStage1LeadActivityWithContacts");
    expect(dashboard).toContain("Potential customers cannot exceed the responses or conversations recorded");
    expect(funnel).toContain('supabase.rpc("create_stage1_lead_activity_with_contacts"');
    expect(funnel).toContain("updateStage1LeadContact");
    expect(read("src/pages/Stage1Quotes.tsx")).toContain("Contact details required");
    expect(read("src/pages/Stage1Quotes.tsx")).toContain("Save contact details");
    expect(matrix).toContain("Weekly total");
    expect(matrix).toContain("Rolling six-week potential-customer total");
    expect(matrix).toContain("window ends on your latest logged activity");
    expect(matrix).toContain("WINDOW_DAYS = 42");
    expect(matrix).toContain("Math.min(6");
    expect(matrix).not.toContain("stageStart");
    expect(matrix).not.toContain("outside this six-week window");
    expect(migration).toContain("source_activity_id uuid");
    expect(migration).toContain("v_customer_count <> p_leads_generated");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("grant execute on function");
    expect(read("src/components/ui/sheet.tsx")).toContain("closeLabel?: string");
    expect(read("src/components/DetailedJobCostReport.tsx")).toContain('closeLabel="Close report"');
    expect(dashboard).toContain('closeLabel="Close"');
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
    expect(learning).toContain('label="Available now" value="8"');
    expect(migration).toContain("'presentation_before_discounting'");
    expect(migration).toContain("'charge_out_rate'");
    expect(migration).toContain("security invoker");
    expect(migration).not.toMatch(/maturity_score|progression_gate|core_admission/i);
  });

  it("keeps the Lesson 4 calculator inside learning and outside quoting", () => {
    const learning = read("src/pages/Stage1Learning.tsx");
    const calculator = read("src/lib/stage1ChargeOutRate.ts");

    expect(learning).toContain("Build your working charge-out rate");
    expect(learning).toContain("What happens when I cut the price?");
    expect(learning).toContain("will not update your quotes or save these figures");
    expect(calculator).toContain("calculateChargeOutRate");
    expect(calculator).toContain("calculatePriceCutConsequence");
    expect(calculator).not.toMatch(/supabase|localStorage|sessionStorage|quote/i);
  });

  it("adds a quote-preparation workshop without creating or changing a quote", () => {
    const learning = read("src/pages/Stage1Learning.tsx");
    const migration = read("supabase/migrations/20260804150000_unlock_stage1_learning_lesson_5.sql");

    expect(learning).toContain('key: "inspect_and_quote"');
    expect(learning).toContain('interactive: "inspect_and_quote"');
    expect(learning).toContain("Practice inspection: a small weekly office clean");
    expect(learning).toContain("Quote-readiness check");
    expect(learning).toContain("does not save customer information, set a price or transfer anything into the quotation system");
    expect(migration).toContain("'inspect_and_quote'");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("current_user_can_use_stage1_run(p_run_id)");
    expect(migration).not.toMatch(/maturity_score|progression_gate|core_admission/i);
  });

  it("completes the course with governed follow-up, rejection and job-closeout practice", () => {
    const learning = read("src/pages/Stage1Learning.tsx");
    const practices = read("src/components/stage1-learning/FinalLessonPractices.tsx");
    const migration = read("supabase/migrations/20260804170000_unlock_stage1_learning_lessons_6_8.sql");

    expect(learning).toContain('key: "follow_up"');
    expect(learning).toContain('key: "rejected_quote"');
    expect(learning).toContain('key: "complete_professionally"');
    expect(learning).toContain('label="Available now" value="8"');
    expect(practices).toContain("Practice: follow up quote Q-12");
    expect(practices).toContain("Practice: the customer chose another supplier");
    expect(practices).toContain("Practice: close out the completed job");
    expect(practices).toContain("An operationally completed job and a financially closed job are not always the same thing");
    expect(practices).not.toMatch(/supabase|localStorage|sessionStorage|createStage1Quote|updateStage1Quote|recordStage1Payment/);
    expect(migration).toContain("'follow_up'");
    expect(migration).toContain("'rejected_quote'");

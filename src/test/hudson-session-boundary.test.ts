import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const api = readFileSync("api/hudson/session-start.ts", "utf8");
const endApi = readFileSync("api/hudson/session-end.ts", "utf8");
const orientation = readFileSync("src/pages/Stage1Orientation.tsx", "utf8");
const supportButton = readFileSync("src/components/HudsonSupportButton.tsx", "utf8");
const dock = readFileSync("src/components/HudsonDock.tsx", "utf8");
const shell = readFileSync("src/components/AppShell.tsx", "utf8");
const runtime = readFileSync("docs/product/HUDSON-GOVERNED-CONVERSATION-RUNTIME-v1.md", "utf8");
const dashboard = readFileSync("src/pages/Stage1Dashboard.tsx", "utf8");
const report = readFileSync("src/components/DetailedJobCostReport.tsx", "utf8");
const practices = readFileSync("src/lib/hudsonPractice.ts", "utf8");
const practiceMigration = readFileSync("supabase/migrations/20260814203000_add_hudson_practice_context.sql", "utf8");

describe("Hudson governed session boundary", () => {
  it("authenticates, verifies run ownership and keeps the upstream credential server-side", () => {
    expect(api).toContain("authenticateRequest(req)");
    expect(api).toContain('.eq("owner_user_id", user.id)');
    expect(api).toContain('requireEnv("HUDSON_START_WEBHOOK_KEY")');
    expect(api).toContain('const HUDSON_START_AUTH_HEADER = "X-Builder-OS-Key"');
    expect(api).toContain('from("hudson_session_starts")');
    expect(api).toContain('reserveError?.code === "23505"');
    expect(api).toContain("request_id: requestId");
    expect(api).toContain("conversation_id: conversationId");
    expect(api).toContain("safeConversationId(payload?.conversation_id)");
    expect(api).toContain('url.hostname === "tavus.daily.co"');
    expect(api).toContain("roomId === conversationId");
    expect(api).not.toContain("VITE_HUDSON");
  });

  it("does not permit First 5 Jobs training before completed Autopsy", () => {
    expect(api).toContain('mode === "first_5_jobs" && run.status !== "completed"');
  });

  it("inherits the governed Autopsy conversation without gaining assessment authority", () => {
    expect(api).toContain('new Set(["autopsy", "first_5_jobs"])');
    expect(runtime).toContain("conducts the existing twelve-subject Autopsy in its governed order");
    expect(runtime).toContain("asks at most one narrow follow-up");
    expect(runtime).toContain("leaves reconciliation, scoring, hard-fail evaluation and Verdict to BuildOS");
    expect(runtime).toContain("must not implement a parallel Autopsy");
    expect(runtime).toContain("must never mention elapsed time, remaining time");
  });

  it("introduces Hudson positively while stating the governed boundary at the point of use", () => {
    expect(orientation).toContain("Hudson is your guide and support person throughout First 5 Jobs.");
    expect(orientation).toContain("BuildOS continues to control records and progression in the background.");
    expect(orientation).toContain("He cannot issue your Verdict, open a gate, accept payment, waive ABN or GST requirements, or alter authoritative records.");
    expect(supportButton).toContain('mode: "first_5_jobs"');
    expect(supportButton).toContain("crypto.randomUUID()");
    expect(supportButton).toContain("requestId: requestIdRef.current");
  });

  it("keeps Hudson beside the governed 5JD tour without granting UI authority", () => {
    expect(orientation).toContain("<HudsonSupportButton");
    expect(supportButton).toContain("openHudsonDock({ conversationUrl: payload.conversationUrl, runId, requestId, practiceKey })");
    expect(orientation).not.toContain('window.open("about:blank"');
    expect(shell).toContain("<HudsonDock />");
    expect(dock).toContain('allow="camera; microphone; fullscreen; display-capture"');
    expect(dock).toContain('url.hostname === "tavus.daily.co"');
    expect(dock).toContain("Return to First 5 Jobs dashboard");
    expect(dock).toContain('tour: "hudson"');
    expect(dock).toContain("step: String(target.step)");
    expect(orientation).toContain('tour=hudson&step=2');
    expect(dock).toContain("BuildOS alone controls highlights, records, payment, Verdict and progression.");
  });

  it("adds bounded customer practice without creating a test, transcript or parallel Hudson", () => {
    expect(practices).toContain('"customer_opening"');
    expect(practices).toContain('"price_question"');
    expect(practices).toContain('"scope_inspection"');
    expect(practices).toContain('"quote_follow_up"');
    expect(practices).toContain('"quote_rejection"');
    expect(practices).toContain('"completion_referral"');
    expect(api).toContain("isHudsonPracticeKey(requestedPracticeKey)");
    expect(api).toContain("practice_key: practiceKey");
    expect(api).toContain('mode !== "first_5_jobs"');
    expect(dock).toContain("Hudson · three-minute practice");
    expect(dock).toContain("There is no score");
    const practiceEntryStart = dashboard.indexOf('<Card className="border-violet-200 bg-violet-50/40">');
    const practiceEntryEnd = dashboard.indexOf("</Card>", practiceEntryStart);
    const practiceEntry = dashboard.slice(practiceEntryStart, practiceEntryEnd);
    expect(dashboard).toContain(
      '{(isDemo || (setupChoicesLoaded && activeRunId)) && (\n        <Card className="border-violet-200 bg-violet-50/40">',
    );
    expect(practiceEntry).not.toContain("setupChoicesSaved");
    expect(practiceEntry).toContain("Six optional customer role-plays");
    expect(practiceEntry).toContain("never changes your score or progression");
    expect(practiceEntry).toContain("Open lessons and practices");
    expect(practiceMigration).toContain("add column if not exists practice_key text");
    expect(practiceMigration).toContain("no transcript, response content or maturity score");
    expect(practiceMigration).not.toMatch(/transcript\s+(text|json|jsonb)|maturity_score\s+/i);
  });

  it("opens and highlights the existing actual labour-hours field without writing it", () => {
    expect(dock).toContain('{ area: "labour-hours", label: "Labour hours", step: 12 }');
    expect(dashboard).toContain("tourStep === 12 && hudsonTourActive");
    expect(dashboard).toContain("setReportOpen(true)");
    expect(dashboard).toContain("'[data-stage1-tour=\"actual-hours\"]'");
    expect(report).toContain('data-stage1-tour="actual-hours"');
  });

  it("lets the operator move Hudson away from the field being explained", () => {
    expect(dock).toContain("onPointerDown={beginDrag}");
    expect(dock).toContain("Drag this top bar to move me");
    expect(dock).toContain("window.addEventListener(\"pointermove\", move)");
    expect(dock).toContain("window.innerWidth - rect.width");
    expect(dock).toContain("window.innerHeight - rect.height");
  });

  it("ends Tavus through an authenticated, owner-bound and idempotent server path", () => {
    expect(endApi).toContain("authenticateRequest(req)");
    expect(endApi).toContain('.eq("owner_user_id", user.id)');
    expect(endApi).toContain('.eq("run_id", runId)');
    expect(endApi).toContain('session.status === "ended"');
    expect(endApi).toContain('status: "ending"');
    expect(endApi).toContain('status: "ended"');
    expect(endApi).toContain('requireEnv("HUDSON_START_WEBHOOK_KEY")');
    expect(endApi).not.toContain("body.conversation_id");
    expect(dock).toContain('fetch("/api/hudson/session-end"');
    expect(dock).toContain("End and close Hudson");
    expect(dock).not.toContain("onClick={() => setSession(null)}");
  });
});

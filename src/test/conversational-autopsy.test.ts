import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("conversational Autopsy boundary", () => {
  const component = readFileSync(
    resolve("src/components/autopsy/ConversationalAutopsy.tsx"),
    "utf8",
  );
  const endpoint = readFileSync(resolve("api/autopsy-assessment-turn.ts"), "utf8");
  const speechEndpoint = readFileSync(resolve("api/autopsy-speech.ts"), "utf8");
  const serverAuth = readFileSync(resolve("api/_lib/supabase-server.ts"), "utf8");
  const conversation = readFileSync(resolve("src/pages/FirstConversation.tsx"), "utf8");
  const paidEntry = readFileSync(resolve("src/pages/PaidAutopsyEntry.tsx"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const previewSession = readFileSync(resolve("api/autopsy-preview-session.ts"), "utf8");
  const verdict = readFileSync(resolve("src/components/autopsy/Autopsy.tsx"), "utf8");

  it("uses the canonical run, answer and finalisation RPC path", () => {
    expect(component).toContain("createAutopsyRun");
    expect(component).toContain("recordAutopsyAnswer");
    expect(component).toContain("finalizeAutopsyRun");
  });

  it("requires operator confirmation before persisting an interpreted answer", () => {
    expect(component).toContain("Is that a fair reading?");
    expect(component).toContain("YES, THAT'S RIGHT");
    expect(component).toContain("Nothing becomes an Autopsy answer until you confirm");
  });

  it("does not expose scoring language or values to the candidate", () => {
    const visible = component
      .replace(/type [\s\S]*?;\n\n/g, "")
      .replace(/const normaliseOption[\s\S]*?\n\};/g, "");
    expect(visible).not.toMatch(/hard fail|maturity score|score band/i);
  });

  it("authenticates the interpretation endpoint and restricts it to supplied options", () => {
    expect(endpoint).toContain("authenticateRequest");
    expect(endpoint).toContain("A valid session is required");
    expect(endpoint).toContain("Do not invent an option, score, weight, threshold or verdict");
    expect(endpoint).toContain("allowed.has");
    expect(serverAuth).toContain('["SUPABASE_URL", "VITE_SUPABASE_URL"]');
    expect(serverAuth).toContain('["SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"]');
    expect(serverAuth).not.toContain("createServiceClient().auth.getUser");
  });

  it("permits the payment phrase only on the named integration preview", () => {
    expect(conversation).toContain("isTestPaymentPhrase");
    expect(conversation).toContain("canUsePreviewPaymentBypass");
    expect(conversation).toContain("/autopsy/paid?test_payment=accepted");
    expect(paidEntry).toContain("window.location.hostname === INTEGRATION_PREVIEW_HOST");
    expect(paidEntry).toContain('get("test_payment") === "accepted"');
    expect(paidEntry).toContain("no Stripe transaction");
    expect(app).toContain('params.get("embedded") === "flight-deck"');
    expect(app).toContain("<AuthGate>");
    expect(paidEntry).toContain("/api/autopsy-preview-session");
    expect(paidEntry).toContain("supabase.auth.setSession");
    expect(previewSession).toContain('host !== PREVIEW_HOST');
    expect(previewSession).toContain('body.embedded !== "flight-deck"');
    expect(previewSession).toContain("createServiceClient");
    expect(previewSession).toContain("autopsy_preview: true");
    expect(serverAuth).toContain('requireFirstServerEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"])');
  });

  it("continues the paid assessment as a spoken conversation", () => {
    expect(component).toContain("if (listenAfter) window.setTimeout(() => startListeningRef.current?.()");
    expect(component).toContain("handleSpokenTurnRef.current?.(captured)");
    expect(component).toContain("void confirm()");
    expect(component).toContain("correct()");
    expect(component).toContain("ANSWER BY VOICE");
    expect(component).toContain("Listening…");
    expect(component).toContain("John is speaking…");
    expect(component).toContain("/api/autopsy-speech");
    expect(component).not.toContain("SpeechSynthesisUtterance");
    expect(speechEndpoint).toContain("authenticateRequest");
    expect(speechEndpoint).toContain('voice: "marin"');
    expect(speechEndpoint).toContain('model: "gpt-4o-mini-tts"');
  });

  it("continues from the final answer into a governed spoken Verdict handover", () => {
    expect(component).toContain('sessionStorage.setItem(`autopsy.verdict_voice.${runId}`, "pending")');
    expect(component).toContain('embeddedFlightDeck ? "?embedded=flight-deck" : ""');
    expect(component).toContain("BUILDOS_AUTOPSY_EVENT");
    expect(component).toContain("isFlightDeckInput");
    expect(verdict).toContain("buildVerdictVoiceScript");
    expect(verdict).toContain('event: "verdict"');
    expect(verdict).toContain("John · Verdict handover");
    expect(verdict).toContain("Hear John explain this result");
    expect(verdict).toContain("/api/autopsy-speech");
  });
});

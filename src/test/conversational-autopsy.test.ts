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
  const resumeMigration = readFileSync(
    resolve("supabase/migrations/20260731030000_resume_preview_autopsy_runs.sql"),
    "utf8",
  );

  it("uses the canonical run, answer and finalisation RPC path", () => {
    expect(component).toContain("createAutopsyRun");
    expect(component).toContain("recordAutopsyAnswer");
    expect(component).toContain("finalizeAutopsyRun");
  });

  it("persists a reliable interpretation without exposing the option mapping", () => {
    expect(component).toContain("await saveSelectionAndAdvance(next, candidateAnswer)");
    expect(component).toContain("The analysis stays quietly in the background");
    expect(component).not.toContain("Is that right, or should we try again?");
    expect(component).not.toContain("YES, THAT'S RIGHT");
  });

  it("binds every interpretation and saved answer to the displayed governed question", () => {
    expect(component).toContain("activeSubjectRef");
    expect(component).toContain("subject_token: subjectToken");
    expect(component).toContain("next.subject_token !== subjectToken");
    expect(component).toContain("event.data.subjectToken !== activeSubjectRef.current.token");
    expect(component).toContain("I lost our place. Let me return to the subject we were discussing.");
    expect(component).toContain("question_id: questionId");
    expect(component).toContain("confirmedInterpretation.question_id !== String(currentQuestion.question_id)");
    expect(endpoint).toContain("question_id?: string | number");
    expect(endpoint).toContain("subject_token: subjectToken");
    expect(endpoint).toContain("question_id: questionId");
  });

  it("keeps internal interpretation silent and conversational", () => {
    expect(endpoint).toContain("plain_summary is an internal audit note and is never spoken");
    expect(endpoint).toContain("never ask the person to confirm the machine's option mapping");
    expect(component).not.toContain("Is that right, or should we try again?");
    expect(component).not.toContain("SUBJECT_TRANSITIONS");
  });

  it("handles uncertain answers without exposing the governed answer menu", () => {
    expect(endpoint).toContain('"I don\'t know", "probably", "maybe"');
    expect(endpoint).toContain("Never list, quote, paraphrase or compare the supplied options");
    expect(endpoint).toContain("clarification_count");
    expect(endpoint).toContain("What makes you lean that way?");
    expect(component).toContain("clarification_count: clarificationCount");
    expect(endpoint).toContain("If clarification_count is at least 1, do not ask another clarifying question");
  });

  it("accepts natural confirmation language without reinterpreting it as a new answer", () => {
    expect(component).toContain("interpretationRef.current ?? interpretation");
    expect(component).toContain("confirmationSavingRef.current");
    expect(component).toContain("thats cool|that is cool|sounds right|sounds good");
  });

  it("routes questions and interruptions before interpreting assessment material", () => {
    expect(endpoint).toContain('"turn_type": "answer, question, repeat_request, correction, control_request or digression"');
    expect(endpoint).toContain("Only an answer or correction may be mapped to a governed option");
    expect(endpoint).toContain("Do not define a commercial term");
    expect(endpoint).toContain("Nothing in those turns is assessment material");
    expect(endpoint).toContain("Classify current_utterance on its own");
    expect(endpoint).toContain("accumulated_answer: accumulatedAnswer");
    expect(component).toContain("accumulated_answer: candidateAnswer");
    expect(component).toContain("assessment_memory: assessmentMemoryRef.current");
    expect(endpoint).toContain("The assessment_memory contains facts");
    expect(endpoint).toContain("the person must not repeat it merely because the locked subject has changed");
    expect(endpoint).toContain("Do not turn general confidence, a job title or one strong answer into blanket strength");
    expect(component).toContain('!["answer", "correction"].includes(next.turn_type)');
    expect(component).toContain("The current subject is still open.");
    expect(component).toContain("setConversationReply(reply)");
  });

  it("refuses teaching and coaching during the governed assessment", () => {
    expect(endpoint).toContain("do not teach the subject");
    expect(endpoint).toContain("Do not define a commercial term");
    expect(endpoint).toContain("I will not teach or improve the answer during Autopsy");
    expect(endpoint).toContain("because that could shape the result");
  });

  it("uses voice-first input and shows only genuine clarifications for typed input", () => {
    expect(component).toContain('type InputMode = "voice" | "text"');
    expect(component).toContain('setLastInputMode("voice")');
    expect(component).toContain('setLastInputMode("text")');
    expect(component).toContain('event.data.inputMode === "text" ? "text" : "voice"');
    expect(component).toContain('lastInputMode === "text"');
    expect(component).toContain('interpretation?.clarifying_question && lastInputMode === "text"');
  });

  it("keeps the internal audit reflection bound to a governed option", () => {
    expect(endpoint).toContain("score_value");
    expect(endpoint).toContain("plain_summary is an internal audit note");
    expect(endpoint).toContain(".replace(/^I have\\b/i, \"You have\")");
  });

  it("separates household runway, startup requirement and recurring job costs", () => {
    expect(component).toContain("Household survival runway while cleaning income is uncertain");
    expect(component).toContain("The minimum one-off setup and working resources required before the first job");
    expect(component).toContain("Understanding one job's revenue, direct costs, tax and money left");
    expect(component).toContain("Recurring cost drivers that grow with or repeatedly support jobs");
    expect(component).toContain("labour time, travel, supplies, rework");
  });

  it("recognises a firm customer booking without demanding premature payment paperwork", () => {
    expect(component).toContain("A genuine booking for specific work on an agreed date");
    expect(component).toContain("do not require a deposit, completed work, signed purchase order or prior payment");
  });

  it("deduplicates the opening while remaining safe under React effect replay", () => {
    expect(component).toContain("initializationRef");
    expect(component).toContain("initializationRef.current.presented");
    expect(component).toContain("initializationRef.current.presented = true");
    expect(component).toContain("autopsy.introduction.presented.${id}");
    expect(component).toContain("Welcome back. Let us continue.");
    expect(component).toContain("firstUnanswered");
    expect(component).toContain("getPriorAutopsyInterpretations");
    expect(resumeMigration).toContain("created_at >= now() - interval '4 hours'");
    expect(resumeMigration).toContain("return v_run_id");
  });

  it("uses only a neutral transition between subjects", () => {
    expect(endpoint).toContain("spoken_acknowledgement must always be an empty string");
    expect(endpoint).toContain('parsed.spoken_acknowledgement = ""');
    expect(component).toContain("conversationalTransition(undefined, nextIndex)");
    expect(component).not.toContain("chosen.spoken_acknowledgement");
  });

  it("does not accept another embedded answer while the current turn is being processed", () => {
    expect(component).toContain("if (busy) return;");
    expect(component).toContain("[busy, embeddedFlightDeck]");
  });

  it("does not repeat the verdict headline in the supporting explanation", () => {
    expect(verdict).toContain("Why Autopsy reached this result");
    expect(verdict).not.toContain('<div class="result"><h1>${escapeExplanation(verdictName)}</h1><p>${escapeExplanation(explanationProfile.decision)}</p></div>');
  });

  it("does not claim there is only one unclear point in a mixed dimension", () => {
    expect(verdict).toContain("Some parts remain unclear");
    expect(verdict).not.toContain("One thing to clarify");
  });

  it("keeps the embedded assessment controls inside the Flight Deck viewport", () => {
    expect(component).toContain('"min-h-0 p-0"');
    expect(component).toContain('"max-h-[610px] lg:p-9"');
    expect(component).toContain("overflow-y-auto");
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
    expect(component).toContain("await saveSelectionAndAdvance(next, candidateAnswer)");
    expect(component).toContain("USE MICROPHONE");
    expect(component).toContain("Listening…");
    expect(component).toContain("John is speaking…");
    expect(component).toContain("/api/autopsy-speech");
    expect(component).not.toContain("SpeechSynthesisUtterance");
    expect(speechEndpoint).toContain("authenticateRequest");
    expect(speechEndpoint).toContain('voice: "marin"');
    expect(speechEndpoint).toContain('model: "gpt-4o-mini-tts"');
  });

  it("extracts decisive facts from long runway answers and leaves embedded typing to the Flight Deck", () => {
    expect(component).toContain("A partner's income is a legitimate household resource");
    expect(component).toContain("contingency allowance is an inspectable runway");
    expect(component).toContain("!embeddedFlightDeck && (!interpretation || interpretation.clarifying_question)");
    expect(endpoint).toContain("the decisive fact that directly answers the locked subject");
    expect(endpoint).toContain("Do not let a long answer");
    expect(endpoint).toContain("Do not ask the person to repeat a decisive fact already supplied");
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

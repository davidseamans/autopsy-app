import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("conversational Autopsy boundary", () => {
  const component = readFileSync(
    resolve("src/components/autopsy/ConversationalAutopsy.tsx"),
    "utf8",
  );
  const endpoint = readFileSync(resolve("api/autopsy-assessment-turn.ts"), "utf8");
  const conversation = readFileSync(resolve("src/pages/FirstConversation.tsx"), "utf8");
  const paidEntry = readFileSync(resolve("src/pages/PaidAutopsyEntry.tsx"), "utf8");

  it("uses the canonical run, answer and finalisation RPC path", () => {
    expect(component).toContain("createAutopsyRun");
    expect(component).toContain("recordAutopsyAnswer");
    expect(component).toContain("finalizeAutopsyRun");
  });

  it("requires operator confirmation before persisting an interpreted answer", () => {
    expect(component).toContain("Have I understood you correctly?");
    expect(component).toContain("Yes, that is right");
    expect(component).toContain("Nothing is saved as an Autopsy answer until you confirm");
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
  });

  it("permits the payment phrase only on the named integration preview", () => {
    expect(conversation).toContain("isTestPaymentPhrase");
    expect(conversation).toContain("canUsePreviewPaymentBypass");
    expect(conversation).toContain("/autopsy/paid?test_payment=accepted");
    expect(paidEntry).toContain("window.location.hostname === INTEGRATION_PREVIEW_HOST");
    expect(paidEntry).toContain('get("test_payment") === "accepted"');
    expect(paidEntry).toContain("no Stripe transaction");
  });
});

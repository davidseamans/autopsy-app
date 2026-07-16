import { describe, expect, it } from "vitest";
import { validateTurnContract, type TurnContract } from "../../api/_lib/constitutional-guardrails";

const contract = (overrides: Partial<TurnContract> = {}): TurnContract => ({
  operator_intent: "seeking orientation",
  commercial_challenge: "unclear",
  mode: "orientation",
  guidance_permission: false,
  evidence_target: "chosen commercial objective",
  evidence_confidence: 0.2,
  maturity_interpretation: null,
  requires_confirmation: false,
  reply: "You sound uncertain about both the direction and whether this is the right challenge to pursue. What would be most useful for us to understand first?",
  ...overrides,
});

describe("constitutional runtime guardrails", () => {
  it("allows an operator-led orientation response", () => {
    expect(validateTurnContract(contract()).pass).toBe(true);
  });

  it("blocks unsolicited coaching", () => {
    const result = validateTurnContract(contract({ reply: "You should validate demand before doing anything else." }));
    expect(result.violations).toContain("unsolicited_direction");
  });

  it("allows explicit guidance only with permission", () => {
    expect(validateTurnContract(contract({
      mode: "explicit_guidance",
      guidance_permission: true,
      reply: "One option is to test the idea with three prospective customers before committing capital.",
    })).pass).toBe(true);
  });

  it("blocks explicit guidance without permission", () => {
    const result = validateTurnContract(contract({ mode: "explicit_guidance", guidance_permission: false }));
    expect(result.violations).toContain("guidance_without_permission");
  });

  it("blocks exposed hidden architecture", () => {
    const result = validateTurnContract(contract({ reply: "That covers Question 2 and improves your maturity score." }));
    expect(result.violations).toContain("exposes_hidden_architecture");
  });

  it("blocks operator identity judgements", () => {
    const result = validateTurnContract(contract({ reply: "You are not ready to run a business." }));
    expect(result.violations).toContain("judges_operator_identity");
  });

  it("blocks unconfirmed maturity interpretations", () => {
    const result = validateTurnContract(contract({
      maturity_interpretation: "The operator avoids measurable limits.",
      requires_confirmation: false,
    }));
    expect(result.violations).toContain("unconfirmed_maturity_interpretation");
  });

  it("allows a provisional interpretation when confirmation is required", () => {
    expect(validateTurnContract(contract({
      mode: "interpretation_confirmation",
      maturity_interpretation: "The operator may be treating optimism as a substitute for measurable runway.",
      requires_confirmation: true,
      reply: "I may be reading this incorrectly, but it sounds as though the numbers have remained deliberately loose. Is that fair?",
    })).pass).toBe(true);
  });

  it("blocks multiple questions in one spoken turn", () => {
    const result = validateTurnContract(contract({ reply: "Why does it matter? What changed?" }));
    expect(result.violations).toContain("multiple_questions");
  });
});

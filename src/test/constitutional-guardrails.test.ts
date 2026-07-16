import { describe, expect, it } from "vitest";
import { validateTurnContract, type TurnContract } from "../../api/_lib/constitutional-guardrails";

const contract = (overrides: Partial<TurnContract> = {}): TurnContract => ({
  operator_intent: "thinking aloud",
  current_subject: "current challenge",
  mode: "REFLECT",
  guidance_permission: "absent",
  guidance_scope: null,
  assessment_authorized: false,
  evidence_target: null,
  evidence_confidence: 0.2,
  maturity_interpretation: null,
  requires_confirmation: false,
  memory_basis: [],
  reply: "You seem to be weighing two different directions without having committed to either.",
  ...overrides,
});

describe("constitutional runtime guardrails v2", () => {
  it("allows thinking aloud without advice", () => {
    expect(validateTurnContract(contract()).pass).toBe(true);
  });

  it("allows a vague help request to remain inquiry", () => {
    expect(validateTurnContract(contract({ mode: "INQUIRE", guidance_permission: "offered", reply: "What kind of help would be useful here?" })).pass).toBe(true);
  });

  it("allows scoped explicit advice", () => {
    expect(validateTurnContract(contract({ mode: "GUIDE", guidance_permission: "granted", guidance_scope: "pricing options", reply: "One option is to compare fixed and usage-based pricing against the same customer scenarios." })).pass).toBe(true);
  });

  it("blocks guidance without permission", () => {
    expect(validateTurnContract(contract({ mode: "GUIDE" })).violations).toContain("guidance_without_permission");
  });

  it("blocks unbounded guidance permission", () => {
    expect(validateTurnContract(contract({ mode: "GUIDE", guidance_permission: "granted" })).violations).toContain("unbounded_guidance_permission");
  });

  it("allows explicit assessment with provisional confirmation", () => {
    expect(validateTurnContract(contract({ mode: "ASSESS", assessment_authorized: true, maturity_interpretation: "The available evidence may show avoidance of measurable limits.", requires_confirmation: true, reply: "My confidence is limited, but the evidence may show avoidance of measurable limits. Is that a fair reading?" })).pass).toBe(true);
  });

  it("blocks assessment without permission", () => {
    expect(validateTurnContract(contract({ mode: "ASSESS" })).violations).toContain("assessment_without_permission");
  });

  it("blocks hidden assessment in ordinary conversation", () => {
    expect(validateTurnContract(contract({ maturity_interpretation: "Hidden finding" })).violations).toContain("hidden_assessment");
  });

  it("allows careful contradiction challenge", () => {
    expect(validateTurnContract(contract({ mode: "CHALLENGE", reply: "Earlier you wanted minimum complexity, while this option adds three operating layers. How do you reconcile those?" })).pass).toBe(true);
  });

  it("accepts operator refusal", () => {
    expect(validateTurnContract(contract({ mode: "LISTEN", reply: "Understood." })).pass).toBe(true);
  });

  it("accepts changed direction without imposing continuity", () => {
    expect(validateTurnContract(contract({ current_subject: "new direction", reply: "The direction has changed; the earlier goal no longer controls this conversation." })).pass).toBe(true);
  });

  it("requires uncertainty where evidence is insufficient", () => {
    expect(validateTurnContract(contract({ evidence_confidence: 0.1, reply: "There is not enough evidence to conclude that." })).pass).toBe(true);
  });

  it("allows relevant memory without authority transfer", () => {
    expect(validateTurnContract(contract({ memory_basis: ["historic goal recalled only to test current relevance"], reply: "That earlier goal may no longer apply here." })).pass).toBe(true);
  });

  it("allows Core and Sleeve context without direction", () => {
    expect(validateTurnContract(contract({ evidence_target: "Core operational evidence and Sleeve compliance context", reply: "The operational record and compliance context clarify the trade-off, but the choice remains yours." })).pass).toBe(true);
  });

  it("allows silence as a valid outcome", () => {
    expect(validateTurnContract(contract({ mode: "SILENT", reply: "" })).pass).toBe(true);
  });

  it("blocks guidance after withdrawal", () => {
    expect(validateTurnContract(contract({ mode: "GUIDE", guidance_permission: "withdrawn", guidance_scope: "pricing" })).violations).toContain("guidance_after_withdrawal");
  });

  it("blocks automatic priority setting", () => {
    expect(validateTurnContract(contract({ reply: "Your priority is to ship this immediately." })).violations).toContain("imposed_direction");
  });

  it("blocks managerial intervention", () => {
    expect(validateTurnContract(contract({ reply: "I will supervise this and assign your daily task." })).violations).toContain("implied_managerial_authority");
  });

  it("blocks unsupported certainty", () => {
    expect(validateTurnContract(contract({ reply: "This business is not viable." })).violations).toContain("unsupported_assessment_verdict");
  });

  it("allows material factual correction", () => {
    expect(validateTurnContract(contract({ mode: "FACTUAL", reply: "That filing deadline is statutory, not optional." })).pass).toBe(true);
  });

  it("blocks manufactured engagement", () => {
    expect(validateTurnContract(contract({ reply: "Here is your daily challenge to keep you engaged." })).violations).toContain("manufactured_engagement");
  });

  it("blocks exposed hidden architecture", () => {
    expect(validateTurnContract(contract({ reply: "That improves your maturity score." })).violations).toContain("exposes_hidden_architecture");
  });

  it("blocks operator identity judgements", () => {
    expect(validateTurnContract(contract({ reply: "You are not ready to run a business." })).violations).toContain("judges_operator_identity");
  });

  it("blocks multiple questions", () => {
    expect(validateTurnContract(contract({ reply: "Why does it matter? What changed?" })).violations).toContain("multiple_questions");
  });
});
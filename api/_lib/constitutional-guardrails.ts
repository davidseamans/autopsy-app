export const CONSTITUTIONAL_KERNEL_VERSION = "autopsy-kernel-2026-07-16-v1";
export const TURN_CONTRACT_VERSION = "autopsy-turn-contract-v1";
export const POLICY_GATE_VERSION = "autopsy-policy-gate-v1";

export type ConversationMode =
  | "orientation"
  | "evidence_discovery"
  | "interpretation_confirmation"
  | "explicit_guidance"
  | "reassessment"
  | "protective_intervention"
  | "pause_or_close";

export type TurnContract = {
  operator_intent: string;
  commercial_challenge: string | null;
  mode: ConversationMode;
  guidance_permission: boolean;
  evidence_target: string | null;
  evidence_confidence: number;
  maturity_interpretation: string | null;
  requires_confirmation: boolean;
  reply: string;
};

export type PolicyResult = {
  pass: boolean;
  violations: string[];
};

const ALLOWED_MODES = new Set<ConversationMode>([
  "orientation",
  "evidence_discovery",
  "interpretation_confirmation",
  "explicit_guidance",
  "reassessment",
  "protective_intervention",
  "pause_or_close",
]);

const hiddenArchitecturePattern = /\b(question\s*\d+|canonical question|dimension|coverage|score|scoring|maturity score|hidden signal|assessment engine)\b/i;
const coercivePattern = /\b(you must|you need to|you have to|you should|the right answer is|your priority is|what you need is)\b/i;
const identityJudgementPattern = /\b(you are (?:not )?(?:ready|capable|mature|immature|unsuitable|a failure)|you lack maturity|you are the problem)\b/i;
const unsupportedVerdictPattern = /\b(future enterprise builder|plateau risk|immediate intervention required|strong development candidate|maturity ceiling is|trajectory is (?:rising|flat|falling))\b/i;

export const countQuestions = (text: string) => (text.match(/\?/g) ?? []).length;

export const validateTurnContract = (contract: TurnContract): PolicyResult => {
  const violations: string[] = [];
  const reply = contract?.reply?.trim() ?? "";

  if (!reply) violations.push("empty_reply");
  if (!ALLOWED_MODES.has(contract.mode)) violations.push("invalid_mode");
  if (typeof contract.guidance_permission !== "boolean") violations.push("missing_guidance_permission");
  if (typeof contract.evidence_confidence !== "number" || contract.evidence_confidence < 0 || contract.evidence_confidence > 1) {
    violations.push("invalid_evidence_confidence");
  }
  if (reply.length > 900) violations.push("reply_too_long_for_spoken_turn");
  if (countQuestions(reply) > 1) violations.push("multiple_questions");
  if (hiddenArchitecturePattern.test(reply)) violations.push("exposes_hidden_architecture");
  if (identityJudgementPattern.test(reply)) violations.push("judges_operator_identity");
  if (unsupportedVerdictPattern.test(reply) && !contract.requires_confirmation) violations.push("unsupported_maturity_verdict");
  if (coercivePattern.test(reply) && !contract.guidance_permission && contract.mode !== "protective_intervention") {
    violations.push("unsolicited_direction");
  }
  if (contract.mode === "explicit_guidance" && !contract.guidance_permission) violations.push("guidance_without_permission");
  if (contract.maturity_interpretation && !contract.requires_confirmation) violations.push("unconfirmed_maturity_interpretation");

  return { pass: violations.length === 0, violations };
};

export const parseTurnContract = (raw: string): TurnContract | null => {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object" || typeof parsed.reply !== "string") return null;
    return parsed as TurnContract;
  } catch {
    return null;
  }
};

export const buildRegenerationInstruction = (violations: string[]) =>
  `The previous draft failed the constitutional policy gate for: ${violations.join(", ")}. Regenerate the complete JSON turn contract. Preserve operator sovereignty, do not coach without permission, do not expose hidden assessment architecture, do not make an unconfirmed maturity finding, and ask no more than one question.`;

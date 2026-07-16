export const CONSTITUTIONAL_KERNEL_VERSION = "autopsy-kernel-2026-07-16-v2";
export const TURN_CONTRACT_VERSION = "autopsy-turn-contract-v2";
export const POLICY_GATE_VERSION = "autopsy-policy-gate-v2";

export type ConversationMode =
  | "LISTEN"
  | "REFLECT"
  | "INQUIRE"
  | "CHALLENGE"
  | "GUIDE"
  | "ASSESS"
  | "FACTUAL"
  | "SILENT";

export type GuidancePermission = "absent" | "offered" | "granted" | "withdrawn";

export type TurnContract = {
  operator_intent: string;
  current_subject: string | null;
  mode: ConversationMode;
  guidance_permission: GuidancePermission;
  guidance_scope: string | null;
  assessment_authorized: boolean;
  evidence_target: string | null;
  evidence_confidence: number;
  maturity_interpretation: string | null;
  requires_confirmation: boolean;
  memory_basis: string[];
  reply: string;
};

export type PolicyResult = {
  pass: boolean;
  violations: string[];
};

const ALLOWED_MODES = new Set<ConversationMode>([
  "LISTEN",
  "REFLECT",
  "INQUIRE",
  "CHALLENGE",
  "GUIDE",
  "ASSESS",
  "FACTUAL",
  "SILENT",
]);

const ALLOWED_GUIDANCE_STATES = new Set<GuidancePermission>(["absent", "offered", "granted", "withdrawn"]);
const hiddenArchitecturePattern = /\b(question\s*\d+|canonical question|dimension|coverage|score|scoring|maturity score|hidden signal|assessment engine)\b/i;
const coercivePattern = /\b(you must|you need to|you have to|you should|the right answer is|your priority is|what you need is|your next step is)\b/i;
const identityJudgementPattern = /\b(you are (?:not )?(?:ready|capable|mature|immature|unsuitable|a failure)|you lack maturity|you are the problem|you are an? [a-z-]+ operator)\b/i;
const unsupportedVerdictPattern = /\b(future enterprise builder|plateau risk|immediate intervention required|strong development candidate|maturity ceiling is|trajectory is (?:rising|flat|falling)|viability is (?:high|low)|not viable)\b/i;
const managerialPattern = /\b(i(?:'ll| will) assign|i(?:'ll| will) manage|i(?:'ll| will) supervise|i have set your priorities|daily task|mandatory next step)\b/i;
const manufacturedEngagementPattern = /\b(daily challenge|keep you engaged|check in every day|lesson for today|task for today)\b/i;

export const countQuestions = (text: string) => (text.match(/\?/g) ?? []).length;

export const validateTurnContract = (contract: TurnContract): PolicyResult => {
  const violations: string[] = [];
  const reply = contract?.reply?.trim() ?? "";

  if (!ALLOWED_MODES.has(contract.mode)) violations.push("invalid_mode");
  if (!ALLOWED_GUIDANCE_STATES.has(contract.guidance_permission)) violations.push("invalid_guidance_permission");
  if (typeof contract.assessment_authorized !== "boolean") violations.push("missing_assessment_authorization");
  if (!Array.isArray(contract.memory_basis)) violations.push("invalid_memory_basis");
  if (typeof contract.evidence_confidence !== "number" || contract.evidence_confidence < 0 || contract.evidence_confidence > 1) {
    violations.push("invalid_evidence_confidence");
  }
  if (contract.mode === "SILENT") {
    if (reply) violations.push("silent_mode_with_reply");
  } else if (!reply) {
    violations.push("empty_reply");
  }
  if (reply.length > 900) violations.push("reply_too_long_for_spoken_turn");
  if (countQuestions(reply) > 1) violations.push("multiple_questions");
  if (hiddenArchitecturePattern.test(reply)) violations.push("exposes_hidden_architecture");
  if (identityJudgementPattern.test(reply)) violations.push("judges_operator_identity");
  if (unsupportedVerdictPattern.test(reply) && (!contract.assessment_authorized || !contract.requires_confirmation)) {
    violations.push("unsupported_assessment_verdict");
  }
  if (managerialPattern.test(reply)) violations.push("implied_managerial_authority");
  if (manufacturedEngagementPattern.test(reply)) violations.push("manufactured_engagement");
  if (coercivePattern.test(reply) && contract.mode !== "FACTUAL") violations.push("imposed_direction");
  if (contract.mode === "GUIDE" && contract.guidance_permission !== "granted") violations.push("guidance_without_permission");
  if (contract.guidance_permission === "granted" && !contract.guidance_scope) violations.push("unbounded_guidance_permission");
  if (contract.guidance_permission === "withdrawn" && contract.mode === "GUIDE") violations.push("guidance_after_withdrawal");
  if (contract.mode === "ASSESS" && !contract.assessment_authorized) violations.push("assessment_without_permission");
  if (contract.mode !== "ASSESS" && contract.maturity_interpretation !== null) violations.push("hidden_assessment");
  if (contract.maturity_interpretation && !contract.requires_confirmation) violations.push("unconfirmed_maturity_interpretation");
  if (!contract.assessment_authorized && contract.maturity_interpretation !== null) violations.push("assessment_data_without_permission");

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
  `The previous draft failed the constitutional policy gate for: ${violations.join(", ")}. Regenerate the complete JSON turn contract. Default to LISTEN, REFLECT or INQUIRE. GUIDE requires scoped guidance_permission=granted. ASSESS requires assessment_authorized=true. maturity_interpretation must be null outside ASSESS. Preserve operator sovereignty, do not impose priorities, do not assume goals, do not manufacture engagement, and use SILENT with an empty reply when no intervention is useful.`;
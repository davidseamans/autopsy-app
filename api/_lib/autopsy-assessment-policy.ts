export const AUTOPSY_ASSESSMENT_PROMPT_VERSION =
  "autopsy-assessment-prompt-2026-07-31-v1";
export const AUTOPSY_ASSESSMENT_CONTRACT_VERSION =
  "autopsy-assessment-turn-contract-v1";
export const AUTOPSY_ASSESSMENT_POLICY_GATE_VERSION =
  "autopsy-assessment-policy-gate-v1";

const EXPOSED_RUBRIC =
  /\b(score|points?|rubric|threshold|answer option|hard fail|dimension|maturity level)\b/i;
const COACHING =
  /\b(you should|you need to say|a better answer|to get through|to pass|strongest answer)\b/i;

export type AssessmentPolicyInput = {
  turn_type: string;
  selected_option_id: string | null;
  clarifying_question: string | null;
  conversation_reply: string | null;
  spoken_acknowledgement: string;
};

export function assessmentPolicyViolations(
  value: AssessmentPolicyInput,
): string[] {
  const violations: string[] = [];
  const candidateFacing = [
    value.clarifying_question,
    value.conversation_reply,
    value.spoken_acknowledgement,
  ].filter(Boolean).join(" ");
  if (EXPOSED_RUBRIC.test(candidateFacing)) violations.push("rubric_exposure");
  if (COACHING.test(candidateFacing)) violations.push("answer_coaching");
  if ((candidateFacing.match(/\?/g) ?? []).length > 1) {
    violations.push("multiple_questions");
  }
  if (value.spoken_acknowledgement.trim()) {
    violations.push("inter_subject_summary");
  }
  if (
    !["answer", "correction"].includes(value.turn_type) &&
    value.selected_option_id != null
  ) {
    violations.push("non_answer_selection");
  }
  return violations;
}

export const privacySafeFactFlags = (text: string): string[] => {
  const flags: string[] = [];
  const add = (flag: string, pattern: RegExp) => {
    if (pattern.test(text)) flags.push(flag);
  };
  add("prior_cleaning_work", /\b(worked|work|experience)\b.{0,35}\bclean(er|ing)\b/i);
  add("prior_business_management", /\b(managed|ran|run|owned)\b.{0,35}\bbusiness\b/i);
  add("past_paying_clients", /\b(past|previous|former)\b.{0,25}\bclients?\b/i);
  add("booked_work", /\b(booked|scheduled|appointment|agreed date)\b/i);
  add("job_cost_ledger", /\b(job.?cost|per.?job|ledger)\b/i);
  add("household_budget", /\b(household|family)\b.{0,35}\b(budget|expenses?|income)\b/i);
  add("financial_buffer", /\b(buffer|savings?|runway|months? set aside)\b/i);
  add("operator_exposure", /\b(alongside|with)\b.{0,35}\b(cleaner|operator)\b/i);
  add("partial_sops", /\b(sop|standard operating|written process)\b.{0,30}\b(part|percent|complete|draft)\b/i);
  return [...new Set(flags)];
};

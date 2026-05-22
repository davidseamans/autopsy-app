import { supabase } from "@/lib/supabase";

export interface GatewayQuestion {
  question_id: string | number;
  q_id?: string;
  dimension_code: string;
  prompt: string;
  position: number;
  options: Array<{
    id?: string | number;
    option_id?: string | number;
    value?: string | number;
    label: string;
    hard_fail?: boolean;
    option_hard_fail?: boolean;
    score_value?: number;
    selected?: boolean;
  } | string>;
  selected_option?: string | number | null;
  selected_score_value?: number | null;
  is_hard_fail?: boolean;
  answered?: boolean;
}

export interface GatewayPayload {
  run?: Record<string, any>;
  questions?: GatewayQuestion[];
  [key: string]: any;
}

type SelectedHardFailSource = Pick<SelectedAnswerAuditRow, "hard_fail"> &
  Partial<Pick<SelectedAnswerAuditRow, "option_hard_fail">>;

// STRICT: hard-fail is only true when the selected answer option's
// `option_hard_fail` column is explicitly true. Never inferred from score,
// dimension, verdict, progression state, or legacy `hard_fail` payload fields.
function isSelectedAnswerHardFail(answer: SelectedHardFailSource): boolean {
  return answer.option_hard_fail === true;
}

export function deriveHardFailFromSelectedAnswers(
  selectedAnswers: SelectedHardFailSource[],
): boolean {
  return selectedAnswers.some(isSelectedAnswerHardFail);
}

// STRICT: only the canonical `option_hard_fail` column counts. Any other
// field (legacy `hard_fail`, server-derived flags) is ignored to prevent
// score/band/dimension/risk state from being mis-inferred as a hard fail.
export function readOptionHardFail(option: any): boolean {
  if (!option || typeof option !== "object") return false;
  return option.option_hard_fail === true;
}

async function rpc<T = any>(
  fn: string,
  args: Record<string, any>,
): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const err: any = new Error(error.message || `RPC ${fn} failed`);
    err.rpc = fn;
    err.details = error;
    throw err;
  }
  return data as T;
}

export const createAutopsyRun = (params: {
  industry: string;
  scenario: string;
  run_name: string;
  tester_email: string;
  operator_class: string;
}) =>
  rpc<any>("create_autopsy_run", {
    p_industry: params.industry,
    p_run_name: params.run_name,
    p_scenario: params.scenario,
    p_tester_email: params.tester_email,
    p_operator_class: params.operator_class,
  });

export const getGatewayPayload = async (run_id: string) => {
  const payload = await rpc<GatewayPayload>("get_autopsy_gateway_payload", { p_run_id: run_id });
  return normalizeHardFailSourceOfTruth(payload, run_id);
};

async function normalizeHardFailSourceOfTruth(
  payload: GatewayPayload,
  run_id: string,
): Promise<GatewayPayload> {
  if (!payload?.run) return payload;
  try {
    const selectedAnswers = await getCurrentRunAnswerAudit(run_id);
    const selectedHardFails = selectedAnswers.filter(isSelectedAnswerHardFail);
    const hardFailTriggered = deriveHardFailFromSelectedAnswers(selectedAnswers);
    const firstHardFail = selectedHardFails[0] ?? null;
    const rawRun = payload.run;
    return {
      ...payload,
      run: {
        ...rawRun,
        hard_fail_triggered: hardFailTriggered,
        hard_fail_question_id: hardFailTriggered ? firstHardFail?.question_id ?? null : null,
        hard_fail_selected_option_id: hardFailTriggered
          ? firstHardFail?.selected_option_id ?? null
          : null,
        hard_fail_triggered_payload: rawRun.hard_fail_triggered ?? null,
        hard_fail_triggered_raw_payload: rawRun.hard_fail_triggered ?? null,
        hard_fail_question_id_payload: rawRun.hard_fail_question_id ?? null,
        hard_fail_question_id_raw_payload: rawRun.hard_fail_question_id ?? null,
        hard_fail_from_selected_answers: hardFailTriggered,
        selected_hard_fail_question_id: hardFailTriggered ? firstHardFail?.question_id ?? null : null,
        selected_hard_fail_option_id: hardFailTriggered
          ? firstHardFail?.selected_option_id ?? null
          : null,
      },
    };
  } catch {
    return payload;
  }
}

export const recordAutopsyAnswer = (params: {
  run_id: string;
  question_id: string | number;
  selected_option: string | number;
}) =>
  rpc("record_autopsy_answer", {
    p_run_id: params.run_id,
    p_question_id: params.question_id,
    p_selected_option: params.selected_option,
  });

export const finalizeAutopsyRun = (run_id: string) =>
  rpc("finalize_autopsy_run", { p_run_id: run_id });

export interface SelectedAnswerAuditRow {
  question_id: string | number | null;
  question_number: number | null;
  dimension_code?: string | null;
  selected_option_id: string | number | null;
  selected_option_label: string | null;
  score_value: number | null;
  option_hard_fail?: boolean;
  hard_fail: boolean;
}

async function fetchSelectedAnswerOptions(selectedOptionIds: any[]) {
  if (!selectedOptionIds.length) return [];
  const selectWithCanonicalFlag = await supabase
    .from("answer_options")
    .select("id, question_id, label, option_hard_fail, hard_fail, score_value")
    .in("id", selectedOptionIds);
  if (!selectWithCanonicalFlag.error) return selectWithCanonicalFlag.data ?? [];

  const fallback = await supabase
    .from("answer_options")
    .select("id, question_id, label, hard_fail, score_value")
    .in("id", selectedOptionIds);
  if (fallback.error) throw fallback.error;
  return fallback.data ?? [];
}

export async function getCurrentRunAnswerAudit(
  run_id: string,
): Promise<SelectedAnswerAuditRow[]> {
  const { data: answers, error: answersError } = await supabase
    .from("autopsy_answers")
    .select("question_id, selected_option, score_value")
    .eq("run_id", run_id)
    .order("created_at", { ascending: true });
  if (answersError) throw answersError;

  const selectedOptionIds = (answers ?? [])
    .map((a: any) => a.selected_option)
    .filter((id: any) => id != null);
  const questionIds = (answers ?? [])
    .map((a: any) => a.question_id)
    .filter((id: any) => id != null);

  const [optionsResult, runQuestionsResult] = await Promise.all([
    fetchSelectedAnswerOptions(selectedOptionIds).then((data) => ({ data, error: null })),
    questionIds.length
      ? supabase
          .from("run_questions")
          .select("question_id, position, question_order")
          .eq("run_id", run_id)
          .in("question_id", questionIds)
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (optionsResult.error) throw optionsResult.error;

  const optionById = new Map<string, any>(
    (optionsResult.data ?? []).map((o: any) => [String(o.id), o] as [string, any]),
  );
  const orderByQuestionId = new Map<string, number>(
    (runQuestionsResult.data ?? []).map((rq: any) => [
      String(rq.question_id),
      Number(rq.position ?? rq.question_order),
    ] as [string, number]),
  );

  return (answers ?? [])
    .map((a: any, index: number): SelectedAnswerAuditRow => {
      const opt = optionById.get(String(a.selected_option));
      const questionNumber = orderByQuestionId.get(String(a.question_id));
      const fallbackNumber = index + 1;
      return {
        question_id: a.question_id ?? null,
        question_number: Number.isFinite(questionNumber)
          ? questionNumber
          : fallbackNumber,
        selected_option_id: a.selected_option ?? null,
        selected_option_label: opt?.label ?? null,
        score_value: Number.isFinite(Number(a.score_value))
          ? Number(a.score_value)
          : Number.isFinite(Number(opt?.score_value))
            ? Number(opt.score_value)
            : null,
        option_hard_fail: opt?.option_hard_fail === true,
        hard_fail: readOptionHardFail(opt),
      };
    })
    .sort((a, b) => (a.question_number ?? 0) - (b.question_number ?? 0));
}

export interface SupportingBlockItem {
  rank?: string;
  dimension_code?: string;
  body?: string;
  [key: string]: any;
}

export interface SupportingBlocks {
  failure_drivers?: SupportingBlockItem[];
  evidence_required?: SupportingBlockItem[];
  required_actions?: SupportingBlockItem[];
  [key: string]: any;
}

export const generateSupportingBlocks = (run_id: string) =>
  rpc<SupportingBlocks>("generate_supporting_blocks", { p_run_id: run_id });

export function extractRunId(data: any): string | null {
  if (!data) return null;
  if (typeof data === "string") return data;
  if (typeof data === "object") {
    if (data.run_id) return String(data.run_id);
    if (data.id) return String(data.id);
    if (Array.isArray(data) && data[0]) return extractRunId(data[0]);
  }
  return null;
}
// Run-scoped persistence for the Stage 1 Reflection / Exit Gate.
//
// Reflection measures recognition, judgement, and decision-making — not writing
// ability. All answers are structured selections, persisted against the active
// Autopsy run so the reflection survives refresh and re-opening the same run.
//
// Doctrine:
//   - Reflection is recognition.
//   - Stopping is not failure.
//   - Ignoring evidence is failure.
//
// Continue, Repeat, Stop, and Unsure are all valid outcomes. Repeating or
// stopping can be a maturity-positive decision when the evidence supports it.

export type ConfidenceSelection =
  | "more_confident"
  | "about_the_same"
  | "less_confident"
  | "unsure";

export type WorkDifficultySelection =
  | "easier"
  | "as_expected"
  | "harder"
  | "much_harder";

export type IncomeSelection =
  | "better"
  | "as_expected"
  | "worse"
  | "unsure";

export type ProfitabilitySelection =
  | "better"
  | "as_expected"
  | "worse"
  | "unsure";

export type RecordKeepingSelection =
  | "comfortable"
  | "mostly_comfortable"
  | "need_practice"
  | "not_comfortable";

export type ContinuationDecision =
  | "continue"
  | "repeat"
  | "stop"
  | "unsure";

export interface Stage1Reflection {
  confidence_selection: ConfidenceSelection | null;
  work_difficulty_selection: WorkDifficultySelection | null;
  income_selection: IncomeSelection | null;
  profitability_selection: ProfitabilitySelection | null;
  recordkeeping_selection: RecordKeepingSelection | null;
  continuation_decision: ContinuationDecision | null;
  reflection_completed: boolean;
  reflection_created_at: string | null;
  reflection_updated_at: string | null;
}

export function emptyReflection(): Stage1Reflection {
  return {
    confidence_selection: null,
    work_difficulty_selection: null,
    income_selection: null,
    profitability_selection: null,
    recordkeeping_selection: null,
    continuation_decision: null,
    reflection_completed: false,
    reflection_created_at: null,
    reflection_updated_at: null,
  };
}

import { supabase } from "@/lib/supabase";

const PREFIX = "stage1.reflection";

function storageKey(runId: string): string {
  return `${PREFIX}.${runId}`;
}

/** Load the persisted reflection for a run, or an empty reflection. */
export function loadStage1ReflectionCache(runId: string | null): Stage1Reflection {
  if (!runId) return emptyReflection();
  try {
    const raw = localStorage.getItem(storageKey(runId));
    if (!raw) return emptyReflection();
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return { ...emptyReflection(), ...(parsed as Partial<Stage1Reflection>) };
    }
    return emptyReflection();
  } catch {
    return emptyReflection();
  }
}

/** Persist the reflection for a run. No-op without a run (nothing to scope to). */
export function saveStage1ReflectionCache(
  runId: string | null,
  reflection: Stage1Reflection,
): void {
  if (!runId) return;
  try {
    localStorage.setItem(storageKey(runId), JSON.stringify(reflection));
  } catch {
    /* noop — storage unavailable */
  }
}

// Backwards-compatible aliases (cache-only).
export const loadStage1Reflection = loadStage1ReflectionCache;
export const saveStage1Reflection = saveStage1ReflectionCache;

// ---------------------------------------------------------------------------
// Canonical enum mapping (local selections <-> stage1_reflections columns)
// ---------------------------------------------------------------------------
const CONFIDENCE_TO: Record<string, string> = {
  more_confident: "more_confident",
  about_the_same: "about_same",
  less_confident: "less_confident",
  unsure: "unsure",
};
const CONFIDENCE_FROM: Record<string, ConfidenceSelection> = {
  more_confident: "more_confident",
  about_same: "about_the_same",
  less_confident: "less_confident",
  unsure: "unsure",
};
const RECORDKEEPING_TO: Record<string, string> = {
  comfortable: "comfortable",
  mostly_comfortable: "mostly_comfortable",
  need_practice: "need_more_practice",
  not_comfortable: "not_comfortable",
};
const RECORDKEEPING_FROM: Record<string, RecordKeepingSelection> = {
  comfortable: "comfortable",
  mostly_comfortable: "mostly_comfortable",
  need_more_practice: "need_practice",
  not_comfortable: "not_comfortable",
};
const CONTINUATION_TO: Record<string, string> = {
  continue: "continue_stage_2",
  repeat: "repeat_stage_1",
  stop: "stop_here",
  unsure: "unsure",
};
const CONTINUATION_FROM: Record<string, ContinuationDecision> = {
  continue_stage_2: "continue",
  repeat_stage_1: "repeat",
  stop_here: "stop",
  unsure: "unsure",
};

function mapTo<T extends string>(
  table: Record<string, string>,
  value: T | null,
): string | null {
  if (value == null) return null;
  return table[value] ?? null;
}
function mapFrom<T>(table: Record<string, T>, value: string | null): T | null {
  if (value == null) return null;
  return table[value] ?? null;
}

// ---------------------------------------------------------------------------
// Canonical READ / WRITE — stage1_reflections (one row per run, unique run id)
// ---------------------------------------------------------------------------
/** Fetch the canonical reflection for a run. Returns null on failure. */
export async function fetchStage1Reflection(
  runId: string | null,
): Promise<Stage1Reflection | null> {
  if (!runId) return emptyReflection();
  const { data, error } = await supabase
    .from("stage1_reflections")
    .select("*")
    .eq("autopsy_run_id", runId)
    .maybeSingle();
  if (error) return null;
  if (!data) return emptyReflection();
  return {
    confidence_selection: mapFrom(CONFIDENCE_FROM, data.confidence_selection),
    work_difficulty_selection: (data.work_difficulty_selection ?? null) as WorkDifficultySelection | null,
    income_selection: (data.income_selection ?? null) as IncomeSelection | null,
    profitability_selection: (data.profitability_selection ?? null) as ProfitabilitySelection | null,
    recordkeeping_selection: mapFrom(RECORDKEEPING_FROM, data.recordkeeping_selection),
    continuation_decision: mapFrom(CONTINUATION_FROM, data.continuation_decision),
    reflection_completed: !!data.reflection_completed,
    reflection_created_at: data.created_at ?? null,
    reflection_updated_at: data.updated_at ?? null,
  };
}

/** Persist the reflection to Supabase (canonical truth). Cache-only when unauthenticated. */
export async function syncStage1Reflection(
  runId: string | null,
  reflection: Stage1Reflection,
): Promise<void> {
  if (!runId) return;
  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes?.user?.id;
  if (!userId) return; // not authenticated → cache only
  const row = {
    autopsy_run_id: runId,
    confidence_selection: mapTo(CONFIDENCE_TO, reflection.confidence_selection),
    work_difficulty_selection: reflection.work_difficulty_selection,
    income_selection: reflection.income_selection,
    profitability_selection: reflection.profitability_selection,
    recordkeeping_selection: mapTo(RECORDKEEPING_TO, reflection.recordkeeping_selection),
    continuation_decision: mapTo(CONTINUATION_TO, reflection.continuation_decision),
    reflection_completed: reflection.reflection_completed,
    created_by: userId,
    updated_at: new Date().toISOString(),
  };
  await supabase
    .from("stage1_reflections")
    .upsert(row, { onConflict: "autopsy_run_id" });
}

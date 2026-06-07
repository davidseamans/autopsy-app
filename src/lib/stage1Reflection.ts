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

const PREFIX = "stage1.reflection";

function storageKey(runId: string): string {
  return `${PREFIX}.${runId}`;
}

/** Load the persisted reflection for a run, or an empty reflection. */
export function loadStage1Reflection(runId: string | null): Stage1Reflection {
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
export function saveStage1Reflection(
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

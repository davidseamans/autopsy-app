// Run-scoped persistence for Stage 1 proof units.
//
// Stage 1 is a persistent commercial record system, not a calculator. Every
// invoice, cost line, GST treatment, GST amount and override flag the operator
// records is persisted against the active Autopsy run so that:
//
//   - the invoice record survives a refresh,
//   - the cost record survives a refresh,
//   - GST values survive a refresh,
//   - ex-GST values are recomputed deterministically from the persisted
//     GST-inclusive total and GST amount (ex-GST = inclusive - GST), so margin
//     always recalculates from ex-GST values only.
//
// Persistence is keyed by the Autopsy runId, so re-opening the same run restores
// exactly that run's commercial records. Margin governance ("Not Yet Proven"
// when costs are missing) is preserved because no fabricated values are stored —
// only what the operator actually entered.
import type { ProofUnit } from "@/pages/Stage1";

const PREFIX = "stage1.units";

function storageKey(runId: string): string {
  return `${PREFIX}.${runId}`;
}

/** Load the persisted proof units for a run. Empty array when none/unreadable. */
export function loadStage1Units(runId: string | null): ProofUnit[] {
  if (!runId) return [];
  try {
    const raw = localStorage.getItem(storageKey(runId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ProofUnit[]) : [];
  } catch {
    return [];
  }
}

/** Persist the proof units for a run. No-op without a run (nothing to scope to). */
export function saveStage1Units(runId: string | null, units: ProofUnit[]): void {
  if (!runId) return;
  try {
    localStorage.setItem(storageKey(runId), JSON.stringify(units));
  } catch {
    /* noop — storage unavailable */
  }
}

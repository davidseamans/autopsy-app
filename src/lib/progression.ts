import { useEffect, useState, useCallback } from "react";

/**
 * Progression routing layer between Autopsy → Worksheet → Stage 1.
 *
 * Persisted per Autopsy runId in localStorage. Core fields only — sleeves
 * (e.g. cleaning) layer their own guidance on top via the helper maps below.
 */

export type VerdictBand =
  | "critical_stop"
  | "not_viable"
  | "high_risk"
  | "viable"
  | "structurally_viable"
  | "unknown";

export type StagePermission =
  | "Locked"
  | "Worksheet Required"
  | "Conditional Stage 1 Access"
  | "Stage 1 Eligible"
  | "Stage 1 Active"
  | "Stage 1 Review Required"
  | "Stage 2 Eligible";

export type WorksheetStatus =
  | "Not Started"
  | "In Progress"
  | "Submitted"
  | "Accepted"
  | "Rejected"
  | "Retest Required";

export interface ChecklistState {
  evidenceUnderstood: boolean;
  recordRevenueCosts: boolean;
  attachProof: boolean;
  lowMarginBlocks: boolean;
  unrecordedCashExcluded: boolean;
  testsRealityNotEnthusiasm: boolean;
}

export const EMPTY_CHECKLIST: ChecklistState = {
  evidenceUnderstood: false,
  recordRevenueCosts: false,
  attachProof: false,
  lowMarginBlocks: false,
  unrecordedCashExcluded: false,
  testsRealityNotEnthusiasm: false,
};

export const CHECKLIST_LABELS: Record<keyof ChecklistState, string> = {
  evidenceUnderstood: "I understand that Stage 1 requires real evidence.",
  recordRevenueCosts: "I will record revenue and direct costs.",
  attachProof: "I will attach proof documents.",
  lowMarginBlocks: "I understand that low margin blocks progression.",
  unrecordedCashExcluded: "I understand that unrecorded cash does not count.",
  testsRealityNotEnthusiasm:
    "I understand that Stage 1 tests commercial reality, not enthusiasm.",
};

export interface ProgressionState {
  runId: string;
  verdictName: string;
  band: VerdictBand;
  primaryRisk: string;
  worksheetStatus: WorksheetStatus;
  checklist: ChecklistState;
  stagePermission: StagePermission;
  /** Manual reviewer / system mark once the operator clicks "Review Stage 1". */
  stage1ReviewRequested: boolean;
  /** Reviewer confirmation that Stage 1 proof has passed. */
  stage1ReviewPassed: boolean;
  updatedAt: string;
}

/* --------------------------- band derivation ---------------------------- */

export function deriveBand(verdictName: string | undefined | null): VerdictBand {
  const v = String(verdictName ?? "").trim();
  if (!v) return "unknown";
  if (/not[\s_-]?viable/i.test(v)) return "not_viable";
  if (/structurally[\s_-]?viable/i.test(v)) return "structurally_viable";
  if (/high[\s_-]?risk/i.test(v)) return "high_risk";
  if (/viable/i.test(v)) return "viable";
  return "unknown";
}

/** Default Stage Permission given only the verdict band, before worksheet activity. */
export function defaultPermissionForBand(band: VerdictBand): StagePermission {
  switch (band) {
    case "critical_stop":
      return "Locked";
    case "not_viable":
      return "Locked";
    case "high_risk":
      return "Worksheet Required";
    case "viable":
    case "structurally_viable":
      // Worksheet-lite / checklist still required before Stage 1 opens.
      return "Worksheet Required";
    default:
      return "Locked";
  }
}

/**
 * Refresh the stage permission from band + worksheet status + checklist + review flags.
 * Pure — does not write storage.
 */
export function recomputePermission(s: ProgressionState): StagePermission {
  if (s.stage1ReviewPassed) return "Stage 2 Eligible";
  if (s.stage1ReviewRequested) return "Stage 1 Review Required";

  const checklistComplete = Object.values(s.checklist).every(Boolean);

  if (s.band === "critical_stop") {
    // Critical Stop is outside the safe progression pathway — never unlocked
    // by the in-product worksheet flow.
    return "Locked";
  }

  if (s.band === "not_viable") {
    if (s.worksheetStatus === "Accepted" && checklistComplete) {
      return "Conditional Stage 1 Access";
    }
    return "Locked";
  }

  if (s.band === "high_risk") {
    if (s.worksheetStatus === "Rejected") return "Locked";
    if (s.worksheetStatus === "Retest Required") return "Worksheet Required";
    if (s.worksheetStatus === "Accepted" && checklistComplete) {
      return "Conditional Stage 1 Access";
    }
    return "Worksheet Required";
  }

  // viable / structurally_viable
  if (s.worksheetStatus === "Rejected") return "Worksheet Required";
  if (s.worksheetStatus === "Accepted" && checklistComplete) {
    return "Stage 1 Eligible";
  }
  return "Worksheet Required";
}

/* ----------------------------- storage --------------------------------- */

const ACTIVE_RUN_KEY = "autopsy_active_run_id";
const storageKey = (runId: string) => `progression.${runId}`;

export function getActiveRunId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_RUN_KEY);
  } catch {
    return null;
  }
}

export function loadProgression(runId: string): ProgressionState | null {
  try {
    const raw = localStorage.getItem(storageKey(runId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProgressionState>;
    return normalize(runId, parsed);
  } catch {
    return null;
  }
}

function normalize(
  runId: string,
  s: Partial<ProgressionState>,
): ProgressionState {
  const merged: ProgressionState = {
    runId,
    verdictName: s.verdictName ?? "",
    band: s.band ?? deriveBand(s.verdictName),
    primaryRisk: s.primaryRisk ?? "",
    worksheetStatus: s.worksheetStatus ?? "Not Started",
    checklist: { ...EMPTY_CHECKLIST, ...(s.checklist ?? {}) },
    stagePermission: s.stagePermission ?? "Locked",
    stage1ReviewRequested: s.stage1ReviewRequested ?? false,
    stage1ReviewPassed: s.stage1ReviewPassed ?? false,
    updatedAt: s.updatedAt ?? new Date().toISOString(),
  };
  merged.stagePermission = recomputePermission(merged);
  return merged;
}

export function saveProgression(s: ProgressionState): ProgressionState {
  const refreshed: ProgressionState = {
    ...s,
    stagePermission: recomputePermission(s),
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(storageKey(s.runId), JSON.stringify(refreshed));
  } catch {
    /* noop */
  }
  return refreshed;
}

/**
 * Ensure a progression record exists for this Autopsy run and that its
 * verdict/risk/band match the latest backend payload. Called from the
 * Autopsy verdict view as soon as we see a verdict.
 */
export function upsertFromVerdict(opts: {
  runId: string;
  verdictName: string;
  primaryRisk?: string;
}): ProgressionState {
  const existing = loadProgression(opts.runId);
  const band = deriveBand(opts.verdictName);
  if (existing) {
    const verdictChanged =
      existing.verdictName !== opts.verdictName || existing.band !== band;
    const next: ProgressionState = {
      ...existing,
      verdictName: opts.verdictName,
      band,
      primaryRisk: opts.primaryRisk ?? existing.primaryRisk,
    };
    // If verdict changed we reset worksheet/checklist to keep audit honest.
    if (verdictChanged) {
      next.worksheetStatus = "Not Started";
      next.checklist = { ...EMPTY_CHECKLIST };
      next.stage1ReviewRequested = false;
      next.stage1ReviewPassed = false;
    }
    return saveProgression(next);
  }
  const fresh: ProgressionState = {
    runId: opts.runId,
    verdictName: opts.verdictName,
    band,
    primaryRisk: opts.primaryRisk ?? "",
    worksheetStatus: "Not Started",
    checklist: { ...EMPTY_CHECKLIST },
    stagePermission: defaultPermissionForBand(band),
    stage1ReviewRequested: false,
    stage1ReviewPassed: false,
    updatedAt: new Date().toISOString(),
  };
  return saveProgression(fresh);
}

/* ------------------------------ React hook ------------------------------- */

/**
 * Subscribes to localStorage updates (within tab + across tabs) so all
 * progression-aware views stay in sync.
 */
export function useProgression(runId: string | null | undefined) {
  const [state, setState] = useState<ProgressionState | null>(() =>
    runId ? loadProgression(runId) : null,
  );

  useEffect(() => {
    setState(runId ? loadProgression(runId) : null);
  }, [runId]);

  useEffect(() => {
    if (!runId) return;
    const handler = (e: StorageEvent | Event) => {
      const key = (e as StorageEvent).key;
      if (key && key !== storageKey(runId)) return;
      setState(loadProgression(runId));
    };
    window.addEventListener("storage", handler);
    window.addEventListener("progression:changed", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("progression:changed", handler);
    };
  }, [runId]);

  const update = useCallback(
    (patch: Partial<ProgressionState>) => {
      if (!runId) return;
      const current = loadProgression(runId);
      if (!current) return;
      const next = saveProgression({ ...current, ...patch });
      setState(next);
      try {
        window.dispatchEvent(new Event("progression:changed"));
      } catch {
        /* noop */
      }
    },
    [runId],
  );

  return { state, update } as const;
}

/* ---------------------------- messaging maps ---------------------------- */

export interface RoutingCopy {
  title: string;
  body: string;
  primaryCta: { label: string; to: (runId: string) => string };
  secondaryCta?: { label: string; to: (runId: string) => string };
}

export const ROUTING_COPY: Record<VerdictBand, RoutingCopy> = {
  critical_stop: {
    title: "Critical Stop",
    body:
      "This is not ready to become a business. Your answers show the current idea is missing too many basic controls — demand, cash, costs, delivery, execution, or record discipline. Autopsy is not opening Stage 1 from this result. The next step is not repair inside this system. The next step is education, advice, or a complete rethink before retesting. This result is outside the safe progression pathway.",
    primaryCta: {
      label: "Retest Later",
      to: (id) => `/autopsy/run/${id}`,
    },
  },
  not_viable: {
    title: "Stage 1 is locked",
    body:
      "This is not ready to become a business system yet. The next step is not launch — it is repair. Complete the Repair Worksheet and satisfy the retest condition before progression can continue.",
    primaryCta: {
      label: "Start Repair Worksheet",
      to: (id) => `/autopsy/run/${id}/readiness`,
    },
    secondaryCta: {
      label: "View Diagnostic Summary",
      to: (id) => `/autopsy/run/${id}`,
    },
  },
  high_risk: {
    title: "Conditional progression",
    body:
      "There is enough signal to continue carefully, but not enough proof to scale or commit serious money. Complete the Readiness Worksheet and provide minimum proof that the primary risk is being addressed before Stage 1.",
    primaryCta: {
      label: "Start Readiness Worksheet",
      to: (id) => `/autopsy/run/${id}/readiness`,
    },
  },
  viable: {
    title: "Viable — confirm and proceed",
    body:
      "There is enough structure to test in the real world, but Stage 1 must prove customers, margin, and record discipline. Complete the readiness checklist and confirm your first proof actions before entering Stage 1.",
    primaryCta: {
      label: "Continue to Readiness Checklist",
      to: (id) => `/autopsy/run/${id}/readiness`,
    },
  },
  structurally_viable: {
    title: "Structurally viable",
    body:
      "This has enough structure to enter Stage 1 — the commercial proof cockpit. The next test is whether real customers, real costs, and real evidence confirm it.",
    primaryCta: {
      label: "Open Stage 1 Dashboard",
      to: () => `/stage-1`,
    },
    secondaryCta: {
      label: "Confirm Readiness Checklist",
      to: (id) => `/autopsy/run/${id}/readiness`,
    },
  },
  unknown: {
    title: "Verdict pending",
    body:
      "Progression routing will appear once the Autopsy verdict is available.",
    primaryCta: {
      label: "View Diagnostic Summary",
      to: (id) => `/autopsy/run/${id}`,
    },
  },
};

/* --------------------- worksheet guidance per risk ---------------------- */

export interface WorksheetGuidance {
  requirement: string;
  acceptable: string[];
  notAcceptable: string[];
  failureCondition: string;
  evidenceRequired: string;
  firstAction: string;
}

export function getWorksheetGuidance(primaryRisk: string): WorksheetGuidance {
  const r = primaryRisk.toLowerCase();
  if (/demand|customer|market/.test(r)) {
    return {
      requirement: "Find evidence that people will pay.",
      acceptable: [
        "Quote request",
        "Signed commitment",
        "Paid job",
        "Approved quote",
        "Recurring service agreement",
        "Real customer conversation with a recorded outcome",
      ],
      notAcceptable: [
        "Opinions",
        "Compliments",
        "“People said they liked the idea”",
        "Social media likes",
        "Family encouragement",
      ],
      failureCondition:
        "The operator cannot show that real customers will pay for the offer at a price that sustains the business.",
      evidenceRequired:
        "Recorded customer demand: quote requests, approved quotes, signed commitments, or paid jobs tied to the offer.",
      firstAction:
        "Run one real customer conversation that ends in a quote, commitment, or paid job and record the outcome.",
    };
  }
  if (/economic|literacy|margin|finance|cost|pricing/.test(r)) {
    return {
      requirement:
        "Prove that you understand revenue, direct costs, gross margin, payment proof, and repeatability.",
      acceptable: [
        "Worked example using a real (or realistic) job",
        "Invoice amount with direct costs broken out",
        "Calculated gross margin %",
        "Payment proof attached (bank, card, or recorded cash)",
        "Plan showing how the same margin is repeatable",
      ],
      notAcceptable: [
        "Guessed margins",
        "Round-number estimates with no costs behind them",
        "Unrecorded cash counted as proof",
        "“It will be profitable once we scale”",
      ],
      failureCondition:
        "The operator cannot demonstrate unit economics clearly enough to justify progression.",
      evidenceRequired:
        "Worked proof of revenue, direct costs, gross margin, payment evidence, and repeatability using a real or realistic job.",
      firstAction:
        "Complete one worked job economics example showing revenue, direct costs, gross margin, payment proof, and repeatability.",
    };
  }
  return {
    requirement:
      "Address the primary risk identified in the Autopsy before entering Stage 1.",
    acceptable: [
      "Documented evidence directly tied to the primary risk",
      "A concrete first action with a measurable outcome",
      "Retest condition you can prove or disprove",
    ],
    notAcceptable: [
      "General confidence statements",
      "Plans without a measurable test",
      "Anything that cannot be checked by a third party",
    ],
    failureCondition:
      "The primary risk identified in the Autopsy has not yet been addressed with verifiable proof.",
    evidenceRequired:
      "Documented evidence directly tied to the primary risk, with a measurable outcome a third party could check.",
    firstAction:
      "Take one concrete action against the primary risk that produces a measurable, recordable result.",
  };
}

/* --------------------------- permission helpers ------------------------- */

export function isStage1Reachable(p: StagePermission): boolean {
  return (
    p === "Stage 1 Eligible" ||
    p === "Conditional Stage 1 Access" ||
    p === "Stage 1 Active" ||
    p === "Stage 1 Review Required" ||
    p === "Stage 2 Eligible"
  );
}

export const STAGE_1_GOAL =
  "Prove that people will pay, the work can be delivered, and the margin is safe enough to repeat.";

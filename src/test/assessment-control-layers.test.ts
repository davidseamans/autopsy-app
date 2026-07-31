import { describe, expect, it } from "vitest";
import {
  assessmentPolicyViolations,
  privacySafeFactFlags,
} from "../../api/_lib/autopsy-assessment-policy";
import {
  defaultPermissionForBand,
  recomputePermission,
  type ProgressionState,
} from "../lib/progression";

describe("paid assessment policy gate", () => {
  const safe = {
    turn_type: "answer",
    selected_option_id: "governed-option",
    clarifying_question: null,
    conversation_reply: null,
    spoken_acknowledgement: "",
  };

  it("accepts a silent governed interpretation", () => {
    expect(assessmentPolicyViolations(safe)).toEqual([]);
  });

  it("rejects rubric exposure, coaching and inter-subject summaries", () => {
    expect(assessmentPolicyViolations({
      ...safe,
      spoken_acknowledgement:
        "That gives you three points. You should say you have a ledger to pass.",
    })).toEqual(expect.arrayContaining([
      "rubric_exposure",
      "answer_coaching",
      "inter_subject_summary",
    ]));
  });

  it("rejects more than one candidate-facing question", () => {
    expect(assessmentPolicyViolations({
      ...safe,
      selected_option_id: null,
      clarifying_question: "What happened? What did you do next?",
    })).toContain("multiple_questions");
  });
});

describe("privacy-safe cumulative fact flags", () => {
  it("retains reusable facts without retaining the candidate transcript", () => {
    const flags = privacySafeFactFlags(
      "I previously worked as a cleaner, managed my own business, spoke to past clients and my SOP is 30 percent complete.",
    );
    expect(flags).toEqual(expect.arrayContaining([
      "prior_cleaning_work",
      "prior_business_management",
      "past_paying_clients",
      "partial_sops",
    ]));
    expect(flags.join(" ")).not.toContain("previously worked");
  });
});

describe("backend-aligned First 5 Jobs admission", () => {
  it("does not add a browser worksheet gate to Ready for Test Run", () => {
    expect(defaultPermissionForBand("structurally_viable")).toBe("Stage 1 Eligible");
    const state: ProgressionState = {
      runId: "run",
      verdictName: "Ready for Test Run",
      band: "structurally_viable",
      primaryRisk: "",
      worksheetStatus: "Not Started",
      checklist: {
        evidenceUnderstood: false,
        recordRevenueCosts: false,
        attachProof: false,
        lowMarginBlocks: false,
        unrecordedCashExcluded: false,
        testsRealityNotEnthusiasm: false,
      },
      stagePermission: "Worksheet Required",
      stage1ReviewRequested: false,
      stage1ReviewPassed: false,
      updatedAt: new Date(0).toISOString(),
    };
    expect(recomputePermission(state)).toBe("Stage 1 Eligible");
  });
});

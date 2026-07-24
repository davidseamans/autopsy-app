import { describe, expect, it } from "vitest";
import {
  buildCandidateNuance,
  type CandidateAnswerEvidence,
} from "@/lib/candidate-nuance";

function answer(
  prompt: string,
  score: number,
  dimensionCode = "cash_reality",
  questionNumber = 1,
): CandidateAnswerEvidence {
  return {
    questionNumber,
    dimensionCode,
    prompt,
    selectedAnswer: null,
    score,
  };
}

describe("candidate verdict nuance", () => {
  const runway = "Have you estimated how long you can operate without income?";
  const startup = "Do you know the minimum resources required to start?";

  it("distinguishes cash runway from start-up preparation at the same dimension total", () => {
    const runwayGap = buildCandidateNuance("cash_reality", [
      answer(runway, 0, "cash_reality", 1),
      answer(startup, 3, "cash_reality", 2),
    ]);
    const startupGap = buildCandidateNuance("cash_reality", [
      answer(runway, 3, "cash_reality", 1),
      answer(startup, 0, "cash_reality", 2),
    ]);

    expect(runwayGap?.title).toContain("cash runway");
    expect(runwayGap?.fieldTitle).toContain("household money");
    expect(runwayGap?.work).toContain("household survival budget");
    expect(runwayGap?.carryQuestion).toContain("household");
    expect(startupGap?.title).toContain("start-up requirement");
    expect(startupGap?.fieldTitle).toContain("first job");
    expect(startupGap?.work).toContain("start-up list");
    expect(startupGap?.carryQuestion).toContain("first job");
    expect(runwayGap).not.toEqual(startupGap);
  });

  it("uses a compound diagnosis when both subjects in a dimension are weak", () => {
    const result = buildCandidateNuance("cash_reality", [
      answer(runway, 1, "cash_reality", 1),
      answer(startup, 1, "cash_reality", 2),
    ]);

    expect(result?.title).toBe("Both start-up preparation and cash runway need proof");
    expect(result?.fieldTitle).toContain("household safety money");
    expect(result?.consequence).toContain("compound");
    expect(result?.evidence).toContain("One joined plan");
    expect(result?.carryQuestion).toContain("start-up list");
  });

  it.each([
    ["economic_literacy", "Can you clearly explain how this business makes money?", "profit mechanism"],
    ["economic_literacy", "Have you identified your main cost drivers?", "costs that control"],
    ["market_reality", "What evidence do you have that customers will pay for this?", "Willingness to pay"],
    ["market_reality", "Have you clearly defined your target customer?", "first customer"],
    ["operational_capacity", "Do you have the operational ability to deliver your product or service consistently?", "delivery capability"],
    ["operational_capacity", "Can you write down the steps, tools, and supplies needed to do the job the same way each time?", "repeatable cleaning method"],
    ["execution_discipline", "Have you taken any concrete action toward this business?", "observable action"],
    ["execution_discipline", "Can you commit consistent time to this for the next 30 days?", "work rhythm"],
    ["psychological_resilience", "Are you prepared to persist through uncertainty and repeated failure without changing direction prematurely?", "response to setbacks"],
    ["psychological_resilience", "Can you keep doing the important work even when you are tired, unsure, or not getting quick results?", "Dependability under discomfort"],
  ])("recognises the governed subject %s / %s", (dimension, prompt, expected) => {
    const result = buildCandidateNuance(dimension, [
      answer(prompt, 0, dimension),
    ]);

    expect(result?.title).toContain(expected);
    expect(result?.finding).toBeTruthy();
    expect(result?.work).toBeTruthy();
    expect(result?.evidence).toBeTruthy();
    expect(result?.caution).toBeTruthy();
    expect(result?.carryQuestion).toBeTruthy();
  });
});

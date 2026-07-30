import { describe, expect, it } from "vitest";
import { applyConstitutionalScoreFloor } from "../../api/_lib/autopsy-scoring-policy";

const options = [0, 1, 2, 3].map((score) => ({
  id: String(score),
  label: `option ${score}`,
  score_value: score,
}));

describe("Autopsy constitutional scoring floors", () => {
  it("recognises sustained practical exposure alongside an experienced cleaner", () => {
    const answer = "I went out to work with a friend who ran a cleaning business for years. They showed me the cleaning, management, paperwork and customer work.";
    expect(applyConstitutionalScoreFloor("EX_01", answer, "1", options)).toBe("3");
  });

  it("recognises a per-job cost ledger as direct economic understanding", () => {
    const answer = "We run a job cost ledger for every job with the price, labour, supplies, travel costs and margin left.";
    expect(applyConstitutionalScoreFloor("EL_01", answer, "1", options)).toBe("3");
    expect(applyConstitutionalScoreFloor("EL_02", answer, "1", options)).toBe("3");
  });

  it("recognises future booked work as real customer commitment", () => {
    const answer = "We have jobs booked for two days next week and another three days three weeks from now.";
    expect(applyConstitutionalScoreFloor("MR_01", answer, "1", options)).toBe("3");
  });

  it("recognises a budgeted six-month household position", () => {
    const answer = "We reviewed our expenses, my partner is working, allowed a 30% contingency and can manage for six months.";
    expect(applyConstitutionalScoreFloor("CR_01", answer, "1", options)).toBe("3");
  });
});

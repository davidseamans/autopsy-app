import { describe, expect, it } from "vitest";
import { buildVerdictVoiceScript } from "@/lib/verdictVoice";

describe("governed spoken Verdict handover", () => {
  it.each([
    ["Stop", "stop here for now", false],
    ["Not Ready", "not opening First 5 Jobs", false],
    ["High Risk Candidate", "not opening First 5 Jobs", false],
    ["Provisionally Ready", "before First 5 Jobs becomes", false],
    ["Ready for Test Run", "Your available next step is First 5 Jobs", true],
  ] as const)(
    "speaks the backend-owned %s outcome without inventing progression",
    (verdictName, expected, opensFirstFive) => {
      const script = buildVerdictVoiceScript({
        verdictName,
        verdictBody: "This is the governed finding supplied by Autopsy.",
      });

      expect(script).toContain(
        "Your full result is now on the screen. I’ll briefly explain what it means",
      );
      expect(script).toContain(`Your Verdict is ${verdictName}.`);
      expect(script).toContain("This is the governed finding supplied by Autopsy.");
      expect(script).toContain(expected);
      expect(script.includes("Your available next step is First 5 Jobs")).toBe(opensFirstFive);
      expect(script).not.toMatch(/score|band|dimension|hard fail/i);
      expect(script).toContain("your result will remain available in My Autopsy");
    },
  );

  it("addresses the person directly instead of speaking about a candidate", () => {
    const script = buildVerdictVoiceScript({
      verdictName: "Ready for Test Run",
      verdictBody: "The candidate has demonstrated enough readiness. The candidate is prepared.",
    });

    expect(script).toContain("You have demonstrated enough readiness. You are prepared.");
    expect(script).not.toMatch(/\bcandidate\b/i);
  });

  it("fails closed when the backend returns an unknown verdict label", () => {
    const script = buildVerdictVoiceScript({
      verdictName: "Unexpected label",
      verdictBody: "The stored decision remains authoritative.",
    });

    expect(script).toContain("The decision on screen remains the authority.");
    expect(script).not.toContain("Your available next step is First 5 Jobs");
  });
});

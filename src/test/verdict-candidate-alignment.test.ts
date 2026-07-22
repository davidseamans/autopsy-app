import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deriveBand, ROUTING_COPY } from "@/lib/progression";

describe("candidate-readiness verdict contract", () => {
  it.each([
    ["Stop", "critical_stop"],
    ["Not Ready", "not_viable"],
    ["High Risk Candidate", "high_risk"],
    ["Provisionally Ready", "viable"],
    ["Ready for Test Run", "structurally_viable"],
  ] as const)("accepts the governed backend outcome %s", (label, band) => {
    expect(deriveBand(label)).toBe(band);
  });

  it.each([
    "Critical Stop",
    "Not Viable",
    "High Risk",
    "Viable",
    "Structurally Viable",
  ])("rejects retired business-viability label %s", (label) => {
    expect(deriveBand(label)).toBe("unknown");
  });

  it("keeps all progression copy candidate-focused", () => {
    const copy = Object.values(ROUTING_COPY)
      .map(({ title, body }) => `${title} ${body}`)
      .join(" ");

    expect(copy).not.toMatch(/business (?:is|may|system|rebuilt)|become a business|structurally viable|not viable/i);
    expect(copy).toMatch(/candidate|readiness/i);
  });

  it("keeps the migration source-owned and selected-option-specific", () => {
    const sql = readFileSync(
      resolve("supabase/migrations/20260721190000_align_verdict_to_candidate_readiness.sql"),
      "utf8",
    );

    expect(sql).toContain("from public.verdict_bands vb");
    expect(sql).toContain("ao.option_hard_fail is true");
    expect(sql).not.toContain("q.is_hard_fail = true or");
    expect(sql).not.toMatch(/This business is|business is structurally|business is not yet viable/i);
  });

  it("keeps the apprentice verdict explanatory without exposing the answer key or an appeal path", () => {
    const source = readFileSync(resolve("src/components/autopsy/Autopsy.tsx"), "utf8");
    const candidateView = source.slice(
      source.indexOf("function CandidateVerdict"),
      source.indexOf("/* --------------------------------- helpers"),
    );

    expect(candidateView).toContain("Why this matters in the real world");
    expect(candidateView).toContain("This is not the same result as Stop");
    expect(candidateView).toContain("A Ready for Test Run result is deliberately conditional");
    expect(candidateView).toContain("What this result does not mean");
    expect(candidateView).toContain("does not disclose Autopsy scoring rules or provide an answer key");
    expect(candidateView).toContain("Print or save as PDF");
    expect(candidateView).not.toMatch(/Talk it through with John|Start a new Autopsy|out of 36|\/ 6/);
  });
});

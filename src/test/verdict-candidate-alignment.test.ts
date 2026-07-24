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
    expect(candidateView).toContain("Your First 5 Jobs focus");
    expect(candidateView).toContain("YOUR FIELD NOTE");
    expect(candidateView).toContain("The one thing to watch");
    expect(candidateView).toContain("Questions to carry forward");
    expect(candidateView).toContain("SUPPORTING EXPLANATION");
    expect(candidateView).toContain("audit-page");
    expect(candidateView).toContain("What would show progress");
    expect(candidateView).toContain("Why this came up");
    expect(candidateView).toContain("personalisedQuestions");
    expect(candidateView).toContain("evidenceForDimension");
    expect(candidateView).toContain("CANDIDATE_SNAPSHOT_LABELS");
    expect(candidateView).toContain("candidateSnapshotStatus(value)");
    expect(candidateView).toContain("showAuditAppendix ? \"space-y-4\"");
    expect(candidateView).toContain("The point is not to learn a better answer");
    expect(candidateView).toContain("What this result does not mean");
    expect(candidateView).toContain("does not disclose Autopsy scoring rules or provide an answer key");
    expect(candidateView).toContain("← Back to Verdict");
    expect(candidateView).toContain("Print / save report");
    expect(candidateView).toContain("Test audit — answers and points");
    expect(candidateView).toContain("<strong>Run ID:</strong>");
    expect(candidateView).toContain("<strong>Completed:</strong>");
    expect(candidateView).toContain("<strong>Internal total:</strong>");
    expect(candidateView).not.toMatch(/Talk it through with John|Start a new Autopsy|out of 36|\/ 6/);
  });

  it("does not treat completed answers as an active finalisation request", () => {
    const source = readFileSync(resolve("src/components/autopsy/Autopsy.tsx"), "utf8");

    expect(source).toContain("const [finalizationRequested, setFinalizationRequested]");
    expect(source).toContain("if (!finalizationRequested)");
    expect(source).toContain(
      "allAnswered={allAnswered && (finalizationRequested || finalizeMutation.isPending || loadingStuck)}",
    );
    expect(source).not.toContain("if (!allAnswered && !finalizeMutation.isPending)");
    expect(source).toContain("Finalisation did not complete.");
    expect(source).toContain("Your saved answers are safe.");
  });
});

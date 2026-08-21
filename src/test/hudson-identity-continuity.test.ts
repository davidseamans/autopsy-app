import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Hudson conversation continuity", () => {
  const firstConversation = readFileSync(resolve("src/pages/FirstConversation.tsx"), "utf8");
  const conversationApi = readFileSync(resolve("api/conversation.ts"), "utf8");
  const assessment = readFileSync(resolve("src/components/autopsy/ConversationalAutopsy.tsx"), "utf8");
  const verdict = readFileSync(resolve("src/components/autopsy/Autopsy.tsx"), "utf8");
  const migration = readFileSync(
    resolve("supabase/migrations/20260821070000_hudson_identity_continuity.sql"),
    "utf8",
  );

  it("uses Hudson throughout the free conversation and paid Autopsy", () => {
    expect(firstConversation).toContain("A conversation with Hudson");
    expect(assessment).toContain("HUDSON");
    expect(verdict).toContain("Hudson · Verdict handover");
    expect([firstConversation, conversationApi, assessment, verdict].join("\n")).not.toMatch(/\bJane\b|JANE/);
  });

  it("captures only voluntary first-name and broad-region continuity metadata", () => {
    expect(conversationApi).toContain('"identity_memory"');
    expect(conversationApi).toContain('"carry_consent": "unresolved | granted | declined"');
    expect(conversationApi).toContain("Never infer a name or region");
    expect(firstConversation).toContain('candidate_first_name: firstName || null');
    expect(firstConversation).toContain('broad_region: region || null');
    expect(firstConversation).toContain("identity_carry_consent");
  });

  it("does not offer checkout until the continuity decision is resolved", () => {
    expect(firstConversation).toContain("identityContinuityReady");
    expect(firstConversation).toContain('identityCarryConsent === "declined"');
    expect(firstConversation).toContain('identityCarryConsent === "granted"');
    expect(firstConversation).toContain("No audio recording is retained");
  });

  it("copies consented details into the authorised paid run and nowhere else", () => {
    expect(migration).toContain("identity_carry_consent is true");
    expect(migration).toContain("then v_context.candidate_first_name");
    expect(migration).toContain("then v_context.broad_region");
    expect(migration).toContain("Continuity metadata only; never maturity evidence");
    expect(assessment).toContain("payload.run?.candidate_first_name");
    expect(assessment).toContain("payload.run?.broad_region");
  });
});

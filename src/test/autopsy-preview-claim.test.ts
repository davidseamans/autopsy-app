import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260801052000_claim_preview_autopsy_runs.sql"),
  "utf8",
);
const previewSession = readFileSync(resolve("api/autopsy-preview-session.ts"), "utf8");
const claimApi = readFileSync(resolve("api/autopsy-claim.ts"), "utf8");
const verdict = readFileSync(resolve("src/components/autopsy/Autopsy.tsx"), "utf8");
const claimPage = readFileSync(resolve("src/pages/AutopsyClaim.tsx"), "utf8");

describe("Flight Deck preview ownership handoff", () => {
  it("stores only a one-way hash of the one-time claim token", () => {
    expect(previewSession).toContain('randomBytes(32).toString("base64url")');
    expect(previewSession).toContain('createHash("sha256").update(claimToken).digest("hex")');
    expect(migration).toContain("claim_token_hash text not null unique");
    expect(migration).not.toMatch(/claim_token\s+text/);
  });

  it("keeps the claim ledger server-only under RLS", () => {
    expect(migration).toContain("alter table public.autopsy_preview_claims enable row level security");
    expect(migration).toContain("revoke all on public.autopsy_preview_claims from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.claim_preview_autopsy_run(uuid,text,uuid,text)\n  to service_role");
    expect(migration).toContain("security invoker");
  });

  it("requires the token, preview owner and permanent claimant to agree", () => {
    expect(migration).toContain("owner_user_id = v_claim.preview_user_id");
    expect(migration).toContain("raw_app_meta_data ->> 'autopsy_preview'");
    expect(migration).toContain("v_run.status <> 'completed'");
    expect(claimApi).toContain("user.app_metadata?.autopsy_preview === true");
  });

  it("moves only the completed run and records the one-time claim atomically", () => {
    expect(migration).toContain("update public.autopsy_runs");
    expect(migration).toContain("set owner_user_id = p_claimant_user_id");
    expect(migration).toContain("update public.autopsy_preview_claims");
    expect(migration).toContain("claimed_by = p_claimant_user_id");
    expect(migration).not.toContain("update public.stage1_");
    expect(migration).not.toContain("update public.jobs");
  });

  it("requires account handoff before a preview candidate enters 5JD", () => {
    expect(verdict).toContain("previewClaimRequired");
    expect(verdict).toContain("Save result and start First 5 Jobs");
    expect(verdict).toContain("/autopsy/claim/");
    expect(verdict).toContain("/launchpad?runId=");
    expect(claimPage).toContain("Sign in or create my account");
    expect(claimPage).toContain("/api/autopsy-claim");
  });

  it("does not authorize by tester email or a client-supplied owner id", () => {
    expect(claimApi).toContain("service.auth.getUser(accessToken)");
    expect(claimApi).not.toContain("req.body?.userId");
    expect(migration).not.toContain("where tester_email");
  });
});

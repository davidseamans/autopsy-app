import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { lookupAbr } from "../../api/_lib/abr-lookup";

describe("ABR business identity gate", () => {
  it("normalizes a real ABR response without exposing the authentication GUID", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("guid")).toBe("test-guid");
      return new Response(
        'abrCallback({"Abn":"51824753556","AbnStatus":"Active","EntityName":"Australian Taxation Office","Gst":"2000-07-01","Message":""})',
        { status: 200 },
      );
    });

    const result = await lookupAbr("51 824 753 556", "test-guid", fetchMock as typeof fetch);

    expect(result).toEqual(expect.objectContaining({
      abn: "51824753556",
      registeredName: "Australian Taxation Office",
      entityStatus: "Active",
      gstRegistered: true,
      source: "abr_web_services",
    }));
    expect(JSON.stringify(result)).not.toContain("test-guid");
  });

  it("rejects a failed checksum before calling ABN Lookup", async () => {
    const fetchMock = vi.fn();
    await expect(lookupAbr("11 111 111 111", "test-guid", fetchMock as typeof fetch))
      .rejects.toThrow("invalid_abn_checksum");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the server credential private and removes simulated verification", () => {
    const endpoint = readFileSync(resolve("api/business-identity.ts"), "utf8");
    const stage1 = readFileSync(resolve("src/pages/Stage1Dashboard.tsx"), "utf8");
    const setup = readFileSync(resolve("src/pages/BusinessSetup.tsx"), "utf8");

    expect(endpoint).toContain("process.env.ABR_AUTHENTICATION_GUID");
    expect(endpoint).not.toContain("VITE_ABR");
    expect(stage1).toContain("Do you already have an ABN");
    expect(stage1).toContain("Show me how to apply");
    expect(setup).toContain("Save and verify ABN");
    expect(() => readFileSync(resolve("src/lib/abrLookup.ts"), "utf8")).toThrow();
  });

  it("owner-scopes Business Details and enforces the gate at Stage 1 writes", () => {
    const sql = readFileSync(
      resolve("supabase/migrations/20260801030758_secure_business_identity_gate.sql"),
      "utf8",
    );

    expect(sql).toContain("owner_user_id = (select auth.uid())");
    expect(sql).toContain("verification_source = 'abr_web_services'");
    expect(sql).toContain("current_user_has_verified_business_identity()");
    expect(sql).toContain("current_user_can_use_stage1_run(autopsy_run_id)");
    expect(sql).toContain("'Ready for Test Run'");
    expect(sql).toContain("stage1_jobs_verified_insert");
    expect(sql).toContain("stage1_quotes_verified_insert");
    expect(sql).toContain("revoke all on public.business_identity_profile from anon, authenticated");
    expect(sql).not.toContain("with check (true)");
  });
});

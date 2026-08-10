import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  QBO_OAUTH_STATE_TTL_MS,
  exchangeQboAuthorizationCode,
  hashQboOAuthState,
  protectQboTokens,
  qboConnectionRecord,
  qboOAuthStateExpiresAt,
  refreshQboAccessToken,
  revokeQboToken,
  validateQboRealmId,
} from "../../api/_lib/qbo-oauth";
import { decryptQboSecret, getQboSandboxConfig } from "../../api/_lib/qbo-sandbox";

const key = Buffer.alloc(32, 9);
const config = getQboSandboxConfig({
  QBO_ENVIRONMENT: "sandbox",
  QBO_CLIENT_ID: "development-client",
  QBO_CLIENT_SECRET: "development-secret",
  QBO_REDIRECT_URI: "https://autopsy-app.vercel.app/api/qbo/callback",
  QBO_TOKEN_ENCRYPTION_KEY: key.toString("base64"),
});

describe("QBO sandbox OAuth boundary", () => {
  it("hashes strong state values and expires them after ten minutes", () => {
    const state = "s".repeat(43);
    expect(hashQboOAuthState(state)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashQboOAuthState(state)).not.toContain(state);
    expect(Date.parse(qboOAuthStateExpiresAt(1_000))).toBe(1_000 + QBO_OAUTH_STATE_TTL_MS);
    expect(() => hashQboOAuthState("short")).toThrow(/state/);
  });

  it("exchanges an authorization code using the exact registered redirect URI", async () => {
    const request = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = init?.body as URLSearchParams;
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("code")).toBe("dummy-code");
      expect(body.get("redirect_uri")).toBe(config.redirectUri);
      expect(init?.headers).toMatchObject({ "Content-Type": "application/x-www-form-urlencoded" });
      return new Response(
        JSON.stringify({
          access_token: "dummy-access",
          refresh_token: "dummy-refresh",
          expires_in: 3600,
          x_refresh_token_expires_in: 8_726_400,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const token = await exchangeQboAuthorizationCode(config, "dummy-code", request as typeof fetch);
    expect(token.refresh_token).toBe("dummy-refresh");
    expect(request).toHaveBeenCalledOnce();
  });

  it("encrypts both tokens before constructing a tenant-bound record", () => {
    const protectedTokens = protectQboTokens(
      {
        access_token: "dummy-access",
        refresh_token: "dummy-refresh",
        expires_in: 3600,
        x_refresh_token_expires_in: 7200,
      },
      config,
      0,
    );
    const record = qboConnectionRecord("00000000-0000-0000-0000-000000000001", "123456789", protectedTokens);
    expect(record.environment).toBe("sandbox");
    expect(record.scope).toBe("com.intuit.quickbooks.accounting");
    expect(JSON.stringify(record)).not.toContain("dummy-access");
    expect(JSON.stringify(record)).not.toContain("dummy-refresh");
    expect(decryptQboSecret(record.refresh_token_encrypted, key)).toBe("dummy-refresh");
  });

  it("rejects malformed or non-sandbox company identifiers", () => {
    expect(validateQboRealmId("123456789")).toBe("123456789");
    expect(() => validateQboRealmId("abc-123")).toThrow(/realmId/);
    expect(() => validateQboRealmId("1".repeat(31))).toThrow(/realmId/);
  });

  it("requires successful Intuit revocation before local deletion can proceed", async () => {
    const encrypted = protectQboTokens(
      {
        access_token: "dummy-access",
        refresh_token: "dummy-refresh",
        expires_in: 3600,
        x_refresh_token_expires_in: 7200,
      },
      config,
    ).refreshTokenEncrypted;
    const request = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(JSON.stringify({ token: "dummy-refresh" }));
      return new Response(null, { status: 200 });
    });
    await expect(revokeQboToken(config, encrypted, request as typeof fetch)).resolves.toBeUndefined();
  });

  it("refreshes with the decrypted refresh token and accepts the rotated pair", async () => {
    const encrypted = protectQboTokens({ access_token: "old-access", refresh_token: "old-refresh", expires_in: 60, x_refresh_token_expires_in: 7200 }, config).refreshTokenEncrypted;
    const request = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = init?.body as URLSearchParams;
      expect(body.get("grant_type")).toBe("refresh_token");
      expect(body.get("refresh_token")).toBe("old-refresh");
      return new Response(JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600, x_refresh_token_expires_in: 8_640_000 }), { status: 200 });
    });
    await expect(refreshQboAccessToken(config, encrypted, request as typeof fetch)).resolves.toMatchObject({ access_token: "new-access", refresh_token: "new-refresh" });
  });

  it("keeps every connection endpoint authenticated or single-use-state-bound", () => {
    const connect = readFileSync(resolve("api/qbo/connect.ts"), "utf8");
    const callback = readFileSync(resolve("api/qbo/callback.ts"), "utf8");
    const status = readFileSync(resolve("api/qbo/status.ts"), "utf8");
    const disconnect = readFileSync(resolve("api/qbo/disconnect.ts"), "utf8");
    const readProof = readFileSync(resolve("api/qbo/read-proof.ts"), "utf8");
    expect(connect).toContain("authenticateRequest(req)");
    expect(status).toContain("authenticateRequest(req)");
    expect(disconnect).toContain("authenticateRequest(req)");
    expect(readProof).toContain("authenticateRequest(req)");
    expect(readProof).toContain("writesPerformed: false");
    expect(callback).toContain('.from("qbo_oauth_states")');
    expect(callback).toContain(".delete()");
    for (const endpoint of [connect, callback, status, disconnect, readProof]) {
      expect(endpoint).toContain('res.setHeader("Cache-Control", "no-store")');
    }
  });
});

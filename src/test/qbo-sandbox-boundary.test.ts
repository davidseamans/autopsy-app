import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  QBO_ACCOUNTING_SCOPE,
  QBO_SANDBOX_API_ORIGIN,
  buildQboAuthorizationUrl,
  buildQboCountUrl,
  buildQboReadUrl,
  createQboOAuthState,
  decryptQboSecret,
  encryptQboSecret,
  getQboSandboxConfig,
  qboSandboxCapabilities,
} from "../../api/_lib/qbo-sandbox";

const original = { ...process.env };
const key = Buffer.alloc(32, 7);

function sandboxEnv(): NodeJS.ProcessEnv {
  return {
    QBO_ENVIRONMENT: "sandbox",
    QBO_CLIENT_ID: "sandbox-client-id",
    QBO_CLIENT_SECRET: "sandbox-client-secret",
    QBO_REDIRECT_URI: "https://preview.example.test/api/qbo/callback",
    QBO_TOKEN_ENCRYPTION_KEY: key.toString("base64"),
  };
}

afterEach(() => {
  process.env = { ...original };
});

describe("QBO Phase 0 sandbox boundary", () => {
  it("fails closed for production or an unspecified environment", () => {
    expect(() => getQboSandboxConfig({ ...sandboxEnv(), QBO_ENVIRONMENT: "production" })).toThrow(
      /Only the QBO sandbox/,
    );
    expect(() => getQboSandboxConfig({ ...sandboxEnv(), QBO_ENVIRONMENT: undefined })).toThrow(
      /Only the QBO sandbox/,
    );
  });

  it("requires server-only credentials and a 256-bit encryption key", () => {
    expect(() => getQboSandboxConfig({ ...sandboxEnv(), QBO_CLIENT_SECRET: "" })).toThrow(
      /QBO_CLIENT_SECRET/,
    );
    expect(() =>
      getQboSandboxConfig({ ...sandboxEnv(), QBO_TOKEN_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") }),
    ).toThrow(/32-byte key/);
  });

  it("requests only the QuickBooks accounting scope", () => {
    const state = createQboOAuthState();
    const url = new URL(buildQboAuthorizationUrl(getQboSandboxConfig(sandboxEnv()), state));
    expect(state.length).toBeGreaterThanOrEqual(32);
    expect(url.searchParams.get("scope")).toBe(QBO_ACCOUNTING_SCOPE);
    expect(url.searchParams.get("scope")).not.toContain("payment");
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  it("encrypts tokens with authenticated encryption", () => {
    const encrypted = encryptQboSecret("dummy-refresh-token", key);
    expect(encrypted.ciphertext).not.toContain("dummy-refresh-token");
    expect(decryptQboSecret(encrypted, key)).toBe("dummy-refresh-token");
    expect(() => decryptQboSecret(encrypted, Buffer.alloc(32, 8))).toThrow();
  });

  it("builds reads only against the sandbox API and allowlisted resources", () => {
    const customer = buildQboReadUrl("123456789", { entity: "Customer" });
    const report = buildQboReadUrl("123456789", { report: "ProfitAndLoss" });
    expect(customer.origin).toBe(QBO_SANDBOX_API_ORIGIN);
    expect(customer.searchParams.get("query")).toBe("select * from Customer maxresults 1000");
    expect(report.pathname.endsWith("/reports/ProfitAndLoss")).toBe(true);
    expect(() => buildQboReadUrl("123456789", { entity: "JournalEntry" })).toThrow(/not allowlisted/);
    expect(() => buildQboReadUrl("123456789", { report: "TaxSummary" })).toThrow(/not allowlisted/);
    expect(() => buildQboReadUrl("not-a-realm", { entity: "Customer" })).toThrow(/Invalid QBO realmId/);
  });

  it("builds only allowlisted count queries at supported minor version 75", () => {
    const url = buildQboCountUrl("123456789", "Invoice");
    expect(url.origin).toBe(QBO_SANDBOX_API_ORIGIN);
    expect(url.searchParams.get("query")).toBe("select count(*) from Invoice");
    expect(url.searchParams.get("minorversion")).toBe("75");
    expect(() => buildQboCountUrl("123456789", "PurchaseOrder")).toThrow(/count-allowlisted/);
  });

  it("publishes an explicit no-write capability contract", () => {
    expect(qboSandboxCapabilities()).toMatchObject({
      environment: "sandbox",
      mode: "read_only",
      productionAllowed: false,
      writesAllowed: false,
      paymentsScopeAllowed: false,
    });
  });

  it("marks capability responses no-store before authentication", () => {
    const endpoint = readFileSync(resolve("api/qbo/sandbox-capabilities.ts"), "utf8");
    expect(endpoint.indexOf('res.setHeader("Cache-Control", "no-store")')).toBeGreaterThan(-1);
    expect(endpoint.indexOf('res.setHeader("Cache-Control", "no-store")')).toBeLessThan(
      endpoint.indexOf("authenticateRequest(req)"),
    );
  });
});

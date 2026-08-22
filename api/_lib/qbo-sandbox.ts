import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const QBO_ACCOUNTING_SCOPE = "com.intuit.quickbooks.accounting";
export const QBO_SANDBOX_API_ORIGIN = "https://sandbox-quickbooks.api.intuit.com";
export const QBO_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
export const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const QBO_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";

const READ_ONLY_ENTITIES = new Set([
  "Account",
  "Bill",
  "CompanyInfo",
  "Customer",
  "Invoice",
  "Item",
  "JournalEntry",
  "Payment",
  "Purchase",
  "TaxCode",
  "VendorCredit",
]);

const READ_ONLY_REPORTS = new Set(["CashFlow", "GeneralLedger", "ProfitAndLoss"]);

export interface QboSandboxConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenEncryptionKey: Buffer;
}

export interface EncryptedQboSecret {
  algorithm: "aes-256-gcm";
  iv: string;
  ciphertext: string;
  authTag: string;
}

function requireValue(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

function decodeEncryptionKey(value: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error("QBO_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return key;
}

export function getQboSandboxConfig(env: NodeJS.ProcessEnv = process.env): QboSandboxConfig {
  if (env.QBO_ENVIRONMENT !== "sandbox") {
    throw new Error("Only the QBO sandbox is authorised for Phase 0");
  }

  return {
    clientId: requireValue("QBO_CLIENT_ID", env),
    clientSecret: requireValue("QBO_CLIENT_SECRET", env),
    redirectUri: requireValue("QBO_REDIRECT_URI", env),
    tokenEncryptionKey: decodeEncryptionKey(requireValue("QBO_TOKEN_ENCRYPTION_KEY", env)),
  };
}

export function createQboOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function buildQboAuthorizationUrl(config: QboSandboxConfig, state: string): string {
  if (!state || state.length < 32) throw new Error("A strong OAuth state value is required");
  const url = new URL(QBO_AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", QBO_ACCOUNTING_SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

export function encryptQboSecret(value: string, key: Buffer): EncryptedQboSecret {
  if (!value) throw new Error("Cannot encrypt an empty QBO secret");
  if (key.length !== 32) throw new Error("QBO encryption requires a 32-byte key");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptQboSecret(secret: EncryptedQboSecret, key: Buffer): string {
  if (secret.algorithm !== "aes-256-gcm" || key.length !== 32) {
    throw new Error("Unsupported QBO token encryption configuration");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(secret.iv, "base64"));
  decipher.setAuthTag(Buffer.from(secret.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function buildQboReadUrl(
  realmId: string,
  request: { entity: string; report?: never } | { report: string; entity?: never },
): URL {
  if (!/^\d{1,30}$/.test(realmId)) throw new Error("Invalid QBO realmId");
  const base = `${QBO_SANDBOX_API_ORIGIN}/v3/company/${realmId}`;

  if (request.entity) {
    if (!READ_ONLY_ENTITIES.has(request.entity)) throw new Error("QBO entity is not allowlisted for Phase 0");
    if (request.entity === "CompanyInfo") return new URL(`${base}/companyinfo/${realmId}`);
    const url = new URL(`${base}/query`);
    url.searchParams.set("query", `select * from ${request.entity} maxresults 1000`);
    return url;
  }

  if (!READ_ONLY_REPORTS.has(request.report)) throw new Error("QBO report is not allowlisted for Phase 0");
  return new URL(`${base}/reports/${request.report}`);
}

export function buildQboCountUrl(realmId: string, entity: string): URL {
  if (!/^\d{1,30}$/.test(realmId)) throw new Error("Invalid QBO realmId");
  if (!READ_ONLY_ENTITIES.has(entity) || entity === "CompanyInfo") {
    throw new Error("QBO entity is not count-allowlisted for Phase 0");
  }
  const url = new URL(`${QBO_SANDBOX_API_ORIGIN}/v3/company/${realmId}/query`);
  url.searchParams.set("query", `select count(*) from ${entity}`);
  url.searchParams.set("minorversion", "75");
  return url;
}

export function qboSandboxCapabilities() {
  return {
    environment: "sandbox" as const,
    scope: QBO_ACCOUNTING_SCOPE,
    mode: "read_only" as const,
    entities: [...READ_ONLY_ENTITIES],
    reports: [...READ_ONLY_REPORTS],
    productionAllowed: false,
    writesAllowed: false,
    paymentsScopeAllowed: false,
  };
}

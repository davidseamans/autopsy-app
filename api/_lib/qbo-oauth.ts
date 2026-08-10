import { createHash } from "node:crypto";
import {
  QBO_ACCOUNTING_SCOPE,
  QBO_REVOKE_URL,
  QBO_TOKEN_URL,
  type EncryptedQboSecret,
  type QboSandboxConfig,
  decryptQboSecret,
  encryptQboSecret,
} from "./qbo-sandbox.js";

export const QBO_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export interface QboTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in: number;
  token_type?: string;
}

export interface StoredQboTokens {
  accessTokenEncrypted: EncryptedQboSecret;
  refreshTokenEncrypted: EncryptedQboSecret;
  accessExpiresAt: string;
  refreshExpiresAt: string;
}

function basicAuthorization(config: QboSandboxConfig): string {
  return `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64")}`;
}

function requirePositiveSeconds(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid Intuit token response: ${field}`);
  }
  return value;
}

export function hashQboOAuthState(state: string): string {
  if (!state || state.length < 32) throw new Error("Invalid QBO OAuth state");
  return createHash("sha256").update(state, "utf8").digest("hex");
}

export function qboOAuthStateExpiresAt(now = Date.now()): string {
  return new Date(now + QBO_OAUTH_STATE_TTL_MS).toISOString();
}

export function validateQboRealmId(realmId: string): string {
  if (!/^\d{1,30}$/.test(realmId)) throw new Error("Invalid QBO realmId");
  return realmId;
}

export async function exchangeQboAuthorizationCode(
  config: QboSandboxConfig,
  code: string,
  request: typeof fetch = fetch,
): Promise<QboTokenResponse> {
  if (!code) throw new Error("Missing QBO authorization code");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
  });
  const response = await request(QBO_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: basicAuthorization(config),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) throw new Error(`Intuit token exchange failed (${response.status})`);
  const token = (await response.json()) as Partial<QboTokenResponse>;
  if (!token.access_token || !token.refresh_token) throw new Error("Intuit token response was incomplete");
  requirePositiveSeconds(token.expires_in, "expires_in");
  requirePositiveSeconds(token.x_refresh_token_expires_in, "x_refresh_token_expires_in");
  return token as QboTokenResponse;
}

export async function refreshQboAccessToken(
  config: QboSandboxConfig,
  encryptedRefreshToken: EncryptedQboSecret,
  request: typeof fetch = fetch,
): Promise<QboTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: decryptQboSecret(encryptedRefreshToken, config.tokenEncryptionKey),
  });
  const response = await request(QBO_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: basicAuthorization(config),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) throw new Error(`Intuit token refresh failed (${response.status})`);
  const token = (await response.json()) as Partial<QboTokenResponse>;
  if (!token.access_token || !token.refresh_token) throw new Error("Intuit refresh response was incomplete");
  requirePositiveSeconds(token.expires_in, "expires_in");
  requirePositiveSeconds(token.x_refresh_token_expires_in, "x_refresh_token_expires_in");
  return token as QboTokenResponse;
}

export function protectQboTokens(
  token: QboTokenResponse,
  config: QboSandboxConfig,
  now = Date.now(),
): StoredQboTokens {
  const accessSeconds = requirePositiveSeconds(token.expires_in, "expires_in");
  const refreshSeconds = requirePositiveSeconds(
    token.x_refresh_token_expires_in,
    "x_refresh_token_expires_in",
  );
  return {
    accessTokenEncrypted: encryptQboSecret(token.access_token, config.tokenEncryptionKey),
    refreshTokenEncrypted: encryptQboSecret(token.refresh_token, config.tokenEncryptionKey),
    accessExpiresAt: new Date(now + accessSeconds * 1000).toISOString(),
    refreshExpiresAt: new Date(now + refreshSeconds * 1000).toISOString(),
  };
}

export async function revokeQboToken(
  config: QboSandboxConfig,
  encryptedRefreshToken: EncryptedQboSecret,
  request: typeof fetch = fetch,
): Promise<void> {
  const token = decryptQboSecret(encryptedRefreshToken, config.tokenEncryptionKey);
  const response = await request(QBO_REVOKE_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: basicAuthorization(config),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) throw new Error(`Intuit token revocation failed (${response.status})`);
}

export function qboConnectionRecord(
  userId: string,
  realmId: string,
  token: StoredQboTokens,
  now = new Date().toISOString(),
) {
  return {
    user_id: userId,
    realm_id: validateQboRealmId(realmId),
    environment: "sandbox",
    scope: QBO_ACCOUNTING_SCOPE,
    access_token_encrypted: token.accessTokenEncrypted,
    refresh_token_encrypted: token.refreshTokenEncrypted,
    access_expires_at: token.accessExpiresAt,
    refresh_expires_at: token.refreshExpiresAt,
    connected_at: now,
    updated_at: now,
  };
}

export function singleQueryValue(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

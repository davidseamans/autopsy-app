import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { protectQboTokens, refreshQboAccessToken } from "../_lib/qbo-oauth.js";
import {
  buildQboCountUrl,
  buildQboReadUrl,
  getQboSandboxConfig,
  type EncryptedQboSecret,
} from "../_lib/qbo-sandbox.js";
import { authenticateRequest, createServiceClient } from "../_lib/supabase-server.js";

type QboConnection = {
  realm_id: string;
  refresh_token_encrypted: EncryptedQboSecret;
};

async function qboJson(url: URL, accessToken: string) {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`QBO sandbox read failed (${response.status})`);
  return response.json() as Promise<Record<string, unknown>>;
}

function totalCount(body: Record<string, unknown>): number {
  const query = body.QueryResponse as { totalCount?: unknown } | undefined;
  return typeof query?.totalCount === "number" ? query.totalCount : 0;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: "A valid session is required." });
    const service = createServiceClient();
    const { data, error } = await service
      .from("qbo_connections")
      .select("realm_id, refresh_token_encrypted")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(409).json({ error: "Connect a QuickBooks Sandbox company first." });

    const connection = data as QboConnection;
    const config = getQboSandboxConfig();
    const refreshed = await refreshQboAccessToken(config, connection.refresh_token_encrypted);
    const protectedTokens = protectQboTokens(refreshed, config);
    const updatedAt = new Date().toISOString();
    const { error: updateError } = await service
      .from("qbo_connections")
      .update({
        access_token_encrypted: protectedTokens.accessTokenEncrypted,
        refresh_token_encrypted: protectedTokens.refreshTokenEncrypted,
        access_expires_at: protectedTokens.accessExpiresAt,
        refresh_expires_at: protectedTokens.refreshExpiresAt,
        updated_at: updatedAt,
      })
      .eq("user_id", user.id);
    if (updateError) throw updateError;

    const realmId = connection.realm_id;
    const [companyBody, customers, accounts, invoices, payments] = await Promise.all([
      qboJson(buildQboReadUrl(realmId, { entity: "CompanyInfo" }), refreshed.access_token),
      qboJson(buildQboCountUrl(realmId, "Customer"), refreshed.access_token),
      qboJson(buildQboCountUrl(realmId, "Account"), refreshed.access_token),
      qboJson(buildQboCountUrl(realmId, "Invoice"), refreshed.access_token),
      qboJson(buildQboCountUrl(realmId, "Payment"), refreshed.access_token),
    ]);
    const company = companyBody.CompanyInfo as { CompanyName?: unknown; Country?: unknown } | undefined;

    return res.status(200).json({
      environment: "sandbox",
      mode: "read_only",
      tokenRefreshed: true,
      company: {
        name: typeof company?.CompanyName === "string" ? company.CompanyName : "Sandbox company",
        country: typeof company?.Country === "string" ? company.Country : null,
      },
      counts: {
        customers: totalCount(customers),
        accounts: totalCount(accounts),
        invoices: totalCount(invoices),
        payments: totalCount(payments),
      },
      verifiedAt: updatedAt,
      writesPerformed: false,
    });
  } catch (error) {
    console.error("QBO sandbox read proof failed", error);
    return res.status(502).json({ error: "QuickBooks Sandbox read-only proof failed safely." });
  }
}

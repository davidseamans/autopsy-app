import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import {
  exchangeQboAuthorizationCode,
  hashQboOAuthState,
  protectQboTokens,
  qboConnectionRecord,
  singleQueryValue,
  validateQboRealmId,
} from "../_lib/qbo-oauth.js";
import { getQboSandboxConfig } from "../_lib/qbo-sandbox.js";
import { createServiceClient } from "../_lib/supabase-server.js";

const SUCCESS_REDIRECT = "/stage-1?qbo=connected";
const ERROR_REDIRECT = "/stage-1?qbo=connection_failed";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const code = singleQueryValue(req.query.code);
    const state = singleQueryValue(req.query.state);
    const realmId = validateQboRealmId(singleQueryValue(req.query.realmId));
    if (!code || !state) return res.redirect(303, ERROR_REDIRECT);

    const service = createServiceClient();
    const stateHash = hashQboOAuthState(state);
    const { data: stateRow, error: stateError } = await service
      .from("qbo_oauth_states")
      .delete()
      .eq("state_hash", stateHash)
      .gt("expires_at", new Date().toISOString())
      .select("user_id")
      .maybeSingle();
    if (stateError || !stateRow?.user_id) return res.redirect(303, ERROR_REDIRECT);

    const config = getQboSandboxConfig();
    const token = await exchangeQboAuthorizationCode(config, code);
    const protectedTokens = protectQboTokens(token, config);
    const { error: connectionError } = await service
      .from("qbo_connections")
      .upsert(qboConnectionRecord(stateRow.user_id, realmId, protectedTokens), { onConflict: "user_id" });
    if (connectionError) throw connectionError;

    return res.redirect(303, SUCCESS_REDIRECT);
  } catch (error) {
    console.error("QBO sandbox callback failed", error);
    return res.redirect(303, ERROR_REDIRECT);
  }
}

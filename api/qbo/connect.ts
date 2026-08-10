import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { buildQboAuthorizationUrl, createQboOAuthState, getQboSandboxConfig } from "../_lib/qbo-sandbox.js";
import { hashQboOAuthState, qboOAuthStateExpiresAt } from "../_lib/qbo-oauth.js";
import { authenticateRequest, createServiceClient } from "../_lib/supabase-server.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: "A valid session is required." });
    const config = getQboSandboxConfig();
    const state = createQboOAuthState();
    const stateHash = hashQboOAuthState(state);
    const service = createServiceClient();

    await service.from("qbo_oauth_states").delete().eq("user_id", user.id);
    const { error } = await service.from("qbo_oauth_states").insert({
      state_hash: stateHash,
      user_id: user.id,
      expires_at: qboOAuthStateExpiresAt(),
    });
    if (error) throw error;

    return res.status(200).json({ authorizationUrl: buildQboAuthorizationUrl(config, state) });
  } catch (error) {
    console.error("QBO sandbox connection start failed", error);
    return res.status(500).json({ error: "QBO sandbox connection could not be started." });
  }
}

import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { revokeQboToken } from "../_lib/qbo-oauth.js";
import { getQboSandboxConfig, type EncryptedQboSecret } from "../_lib/qbo-sandbox.js";
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
    const service = createServiceClient();
    const { data, error } = await service
      .from("qbo_connections")
      .select("refresh_token_encrypted")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(200).json({ connected: false });

    await revokeQboToken(
      getQboSandboxConfig(),
      data.refresh_token_encrypted as EncryptedQboSecret,
    );
    const { error: deleteError } = await service.from("qbo_connections").delete().eq("user_id", user.id);
    if (deleteError) throw deleteError;
    return res.status(200).json({ connected: false });
  } catch (error) {
    console.error("QBO sandbox disconnect failed", error);
    return res.status(502).json({ error: "QBO sandbox connection could not be disconnected safely." });
  }
}

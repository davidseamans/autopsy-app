import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { getQboSandboxConfig, qboSandboxCapabilities } from "../_lib/qbo-sandbox.js";
import { authenticateRequest, createServiceClient } from "../_lib/supabase-server.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: "A valid session is required." });
    getQboSandboxConfig();
    const { data, error } = await createServiceClient()
      .from("qbo_connections")
      .select("realm_id, connected_at, access_expires_at, refresh_expires_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;

    return res.status(200).json({
      ...qboSandboxCapabilities(),
      configured: true,
      connected: Boolean(data),
      connection: data
        ? {
            realmId: data.realm_id,
            connectedAt: data.connected_at,
            accessExpiresAt: data.access_expires_at,
            refreshExpiresAt: data.refresh_expires_at,
          }
        : null,
    });
  } catch (error) {
    console.error("QBO sandbox status failed", error);
    return res.status(500).json({ error: "QBO sandbox connection status is unavailable." });
  }
}

import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { authenticateRequest } from "../_lib/supabase-server.js";
import { getQboSandboxConfig, qboSandboxCapabilities } from "../_lib/qbo-sandbox.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    res.setHeader("Cache-Control", "no-store");
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: "A valid session is required." });

    let configured = true;
    try {
      getQboSandboxConfig();
    } catch {
      configured = false;
    }

    return res.status(200).json({
      ...qboSandboxCapabilities(),
      configured,
      connected: false,
      connectionReason: configured
        ? "Connection persistence is not yet installed."
        : "Intuit sandbox credentials are not configured.",
    });
  } catch (error) {
    console.error("QBO sandbox capability request failed", error);
    return res.status(500).json({ error: "QBO sandbox capability status is unavailable." });
  }
}

import { createHash } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createServiceClient } from "./_lib/supabase-server.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store");
  const accessToken = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const runId = String(req.body?.runId ?? "");
  const claimToken = String(req.body?.claimToken ?? "");
  if (!accessToken || !UUID_PATTERN.test(runId) || claimToken.length < 32 || claimToken.length > 128) {
    return res.status(400).json({ error: "The Autopsy recovery request is incomplete." });
  }

  try {
    const service = createServiceClient();
    const { data: identity, error: identityError } = await service.auth.getUser(accessToken);
    const user = identity.user;
    if (identityError || !user || user.app_metadata?.autopsy_preview === true) {
      return res.status(401).json({ error: "Sign in with your permanent account to continue." });
    }

    const claimTokenHash = createHash("sha256").update(claimToken).digest("hex");
    const { data, error } = await service.rpc("claim_preview_autopsy_run", {
      p_run_id: runId,
      p_claim_token_hash: claimTokenHash,
      p_claimant_user_id: user.id,
      p_claimant_email: user.email ?? "",
    });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.run_id) throw new Error("The Autopsy run was not claimed.");
    return res.status(200).json({ runId: String(row.run_id), claimed: true });
  } catch (error) {
    console.error("Autopsy claim failed", error);
    return res.status(403).json({ error: "This Autopsy recovery link is invalid, expired or already used." });
  }
}

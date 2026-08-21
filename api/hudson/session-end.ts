import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { authenticateRequest, createServiceClient } from "../_lib/supabase-server.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HUDSON_END_WEBHOOK_URL =
  "https://dseamans.app.n8n.cloud/webhook/buildos-hudson-end-v1-91d5c2a8";
const HUDSON_AUTH_HEADER = "X-Builder-OS-Key";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await authenticateRequest(req);
  if (!user || user.app_metadata?.autopsy_preview === true) {
    return res.status(401).json({ error: "A permanent signed-in account is required." });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const runId = typeof body.runId === "string" ? body.runId : "";
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  if (!UUID_PATTERN.test(runId) || !UUID_PATTERN.test(requestId)) {
    return res.status(400).json({ error: "Hudson session context is incomplete." });
  }

  const service = createServiceClient();
  try {
    const { data: session, error: sessionError } = await service
      .from("hudson_session_starts")
      .select("request_id,run_id,status,conversation_id")
      .eq("request_id", requestId)
      .eq("run_id", runId)
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) return res.status(403).json({ error: "That Hudson room does not belong to your account." });
    if (session.status === "ended") return res.status(200).json({ ended: true, reused: true });
    if (session.status === "ending") {
      return res.status(202).json({ ended: false, ending: true, reused: true });
    }
    if (session.status !== "ready" || typeof session.conversation_id !== "string") {
      return res.status(409).json({ error: "That Hudson room is not active." });
    }

    const { data: claimed, error: claimError } = await service
      .from("hudson_session_starts")
      .update({ status: "ending", updated_at: new Date().toISOString() })
      .eq("request_id", requestId)
      .eq("run_id", runId)
      .eq("owner_user_id", user.id)
      .eq("status", "ready")
      .select("conversation_id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed?.conversation_id) {
      return res.status(202).json({ ended: false, ending: true, reused: true });
    }

    const upstream = await fetch(HUDSON_END_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", [HUDSON_AUTH_HEADER]: requireEnv("HUDSON_START_WEBHOOK_KEY") },
      body: JSON.stringify({
        request_id: requestId,
        candidate_uuid: user.id,
        run_uuid: runId,
        conversation_id: claimed.conversation_id,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!upstream.ok) {
      await service.from("hudson_session_starts").update({
        status: "ready",
        failure_code: `end_upstream_${upstream.status}`,
        updated_at: new Date().toISOString(),
      }).eq("request_id", requestId).eq("owner_user_id", user.id).eq("status", "ending");
      console.error("Hudson end workflow rejected the request", { status: upstream.status });
      return res.status(502).json({ error: "Hudson could not close the room yet. Please try again." });
    }

    const endedAt = new Date().toISOString();
    const { error: endedError } = await service.from("hudson_session_starts").update({
      status: "ended",
      ended_at: endedAt,
      end_reason: "user_closed_dock",
      failure_code: null,
      updated_at: endedAt,
    }).eq("request_id", requestId).eq("owner_user_id", user.id).eq("status", "ending");
    if (endedError) throw endedError;
    return res.status(200).json({ ended: true });
  } catch (error) {
    await service.from("hudson_session_starts").update({
      status: "ready",
      failure_code: "end_server_error",
      updated_at: new Date().toISOString(),
    }).eq("request_id", requestId).eq("owner_user_id", user.id).eq("status", "ending");
    console.error("Hudson session end failed", error);
    return res.status(500).json({ error: "Hudson is temporarily unavailable." });
  }
}

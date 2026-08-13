import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { authenticateRequest, createServiceClient } from "../_lib/supabase-server.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_MODES = new Set(["autopsy", "first_5_jobs"]);
const HUDSON_START_WEBHOOK_URL =
  "https://dseamans.app.n8n.cloud/webhook/buildos-hudson-start-v1-7f3c9e6a";
const HUDSON_START_AUTH_HEADER = "X-Builder-OS-Key";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

function safeConversationUrl(value: unknown, conversationId: string | null): string | null {
  if (!conversationId) return null;
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const roomId = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return url.protocol === "https:" && url.hostname === "tavus.daily.co" && roomId === conversationId
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function safeConversationId(value: unknown): string | null {
  return typeof value === "string" && /^c[a-z0-9_-]{6,}$/i.test(value) ? value : null;
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
  const mode = typeof body.mode === "string" ? body.mode : "";
  if (!UUID_PATTERN.test(runId) || !UUID_PATTERN.test(requestId) || !ALLOWED_MODES.has(mode)) {
    return res.status(400).json({ error: "Hudson session context is incomplete." });
  }

  try {
    const service = createServiceClient();
    const { data: run, error: runError } = await service
      .from("autopsy_runs")
      .select("id,status")
      .eq("id", runId)
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (runError) throw runError;
    if (!run) return res.status(403).json({ error: "This Autopsy run does not belong to your account." });
    if (mode === "first_5_jobs" && run.status !== "completed") {
      return res.status(409).json({ error: "First 5 Jobs training is available after the governed Autopsy is completed." });
    }

    const { error: reserveError } = await service.from("hudson_session_starts").insert({
      request_id: requestId,
      owner_user_id: user.id,
      run_id: run.id,
      mode,
      status: "reserved",
    });
    if (reserveError?.code === "23505") {
      const { data: existing, error: existingError } = await service
        .from("hudson_session_starts")
        .select("owner_user_id,run_id,mode,status,conversation_id,conversation_url")
        .eq("request_id", requestId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing || existing.owner_user_id !== user.id || existing.run_id !== run.id || existing.mode !== mode) {
        return res.status(409).json({ error: "That Hudson session request cannot be reused." });
      }
      const existingUrl = safeConversationUrl(existing.conversation_url, safeConversationId(existing.conversation_id));
      if (existing.status === "ready" && existingUrl) {
        return res.status(200).json({ conversationUrl: existingUrl, reused: true });
      }
      return res.status(409).json({ error: existing.status === "reserved"
        ? "Hudson is already opening this room. Please try again in a moment."
        : "That Hudson room could not be opened. Please start a new session." });
    }
    if (reserveError) throw reserveError;

    const headerValue = requireEnv("HUDSON_START_WEBHOOK_KEY");
    const upstream = await fetch(HUDSON_START_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", [HUDSON_START_AUTH_HEADER]: headerValue },
      body: JSON.stringify({
        request_id: requestId,
        candidate_uuid: user.id,
        run_uuid: run.id,
        mode,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const payload = await upstream.json().catch(() => null) as Record<string, unknown> | null;
    const conversationId = safeConversationId(payload?.conversation_id);
    const conversationUrl = safeConversationUrl(payload?.conversation_url, conversationId);
    if (!upstream.ok || !conversationUrl || !conversationId) {
      await service.from("hudson_session_starts").update({
        status: "failed",
        failure_code: `upstream_${upstream.status}`,
        updated_at: new Date().toISOString(),
      }).eq("request_id", requestId).eq("owner_user_id", user.id).eq("status", "reserved");
      console.error("Hudson start workflow rejected the request", { status: upstream.status });
      return res.status(502).json({ error: "Hudson could not open a governed room. Please try again." });
    }

    const { data: ready, error: readyError } = await service.from("hudson_session_starts").update({
      status: "ready",
      conversation_id: conversationId,
      conversation_url: conversationUrl,
      failure_code: null,
      updated_at: new Date().toISOString(),
    }).eq("request_id", requestId).eq("owner_user_id", user.id).eq("status", "reserved")
      .select("request_id").maybeSingle();
    if (readyError) throw readyError;
    if (!ready) throw new Error("Hudson reservation was not ready to complete.");

    return res.status(200).json({ conversationUrl });
  } catch (error) {
    if (UUID_PATTERN.test(requestId)) {
      await createServiceClient().from("hudson_session_starts").update({
        status: "failed",
        failure_code: "server_error",
        updated_at: new Date().toISOString(),
      }).eq("request_id", requestId).eq("owner_user_id", user.id).eq("status", "reserved");
    }
    console.error("Hudson session start failed", error);
    return res.status(500).json({ error: "Hudson is temporarily unavailable." });
  }
}

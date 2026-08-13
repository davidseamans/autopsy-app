import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const api = readFileSync("api/hudson/session-start.ts", "utf8");
const endApi = readFileSync("api/hudson/session-end.ts", "utf8");
const orientation = readFileSync("src/pages/Stage1Orientation.tsx", "utf8");
const dock = readFileSync("src/components/HudsonDock.tsx", "utf8");
const shell = readFileSync("src/components/AppShell.tsx", "utf8");

describe("Hudson governed session boundary", () => {
  it("authenticates, verifies run ownership and keeps the upstream credential server-side", () => {
    expect(api).toContain("authenticateRequest(req)");
    expect(api).toContain('.eq("owner_user_id", user.id)');
    expect(api).toContain('requireEnv("HUDSON_START_WEBHOOK_KEY")');
    expect(api).toContain('const HUDSON_START_AUTH_HEADER = "X-Builder-OS-Key"');
    expect(api).toContain('from("hudson_session_starts")');
    expect(api).toContain('reserveError?.code === "23505"');
    expect(api).toContain("request_id: requestId");
    expect(api).toContain("conversation_id: conversationId");
    expect(api).toContain("safeConversationId(payload?.conversation_id)");
    expect(api).toContain('url.hostname === "tavus.daily.co"');
    expect(api).toContain("roomId === conversationId");
    expect(api).not.toContain("VITE_HUDSON");
  });

  it("does not permit First 5 Jobs training before completed Autopsy", () => {
    expect(api).toContain('mode === "first_5_jobs" && run.status !== "completed"');
  });

  it("states Hudson's non-authoritative limits at the point of use", () => {
    expect(orientation).toContain("He cannot issue your Verdict, open a gate, accept payment, waive ABN or GST requirements, or alter authoritative records.");
    expect(orientation).toContain('mode: "first_5_jobs"');
    expect(orientation).toContain("crypto.randomUUID()");
    expect(orientation).toContain("requestId: hudsonRequestId.current");
  });

  it("keeps Hudson beside the governed 5JD tour without granting UI authority", () => {
    expect(orientation).toContain("openHudsonDock({ conversationUrl: payload.conversationUrl, runId, requestId })");
    expect(orientation).not.toContain('window.open("about:blank"');
    expect(shell).toContain("<HudsonDock />");
    expect(dock).toContain('allow="camera; microphone; fullscreen; display-capture"');
    expect(dock).toContain('url.hostname === "tavus.daily.co"');
    expect(dock).toContain("Show Hudson beside First 5 Jobs");
    expect(dock).toContain('tour=hudson&step=${target.step}');
    expect(orientation).toContain('tour=hudson&step=2');
    expect(dock).toContain("BuildOS alone controls highlights, records, payment, Verdict and progression.");
  });

  it("ends Tavus through an authenticated, owner-bound and idempotent server path", () => {
    expect(endApi).toContain("authenticateRequest(req)");
    expect(endApi).toContain('.eq("owner_user_id", user.id)');
    expect(endApi).toContain('.eq("run_id", runId)');
    expect(endApi).toContain('session.status === "ended"');
    expect(endApi).toContain('status: "ending"');
    expect(endApi).toContain('status: "ended"');
    expect(endApi).toContain('requireEnv("HUDSON_START_WEBHOOK_KEY")');
    expect(endApi).not.toContain("body.conversation_id");
    expect(dock).toContain('fetch("/api/hudson/session-end"');
    expect(dock).toContain("End and close Hudson");
    expect(dock).not.toContain("onClick={() => setSession(null)}");
  });
});

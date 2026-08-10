import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Link2, Loader2, RefreshCw, Unplug } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface QboStatus {
  configured: boolean;
  connected: boolean;
  connection: { realmId: string; connectedAt: string } | null;
}

interface QboReadProof {
  tokenRefreshed: true;
  company: { name: string; country: string | null };
  counts: { customers: number; accounts: number; invoices: number; payments: number };
  writesPerformed: false;
}

async function qboRequest<T>(path: string, token: string, method = "GET"): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "QuickBooks Sandbox is unavailable.");
  return body;
}

export function QboSandboxConnectionCard({ navigateTo = (url) => window.location.assign(url) }: { navigateTo?: (url: string) => void }) {
  const { session } = useAuth();
  const [status, setStatus] = useState<QboStatus | null>(null);
  const [busy, setBusy] = useState<"loading" | "connecting" | "disconnecting" | "proving" | null>("loading");
  const [error, setError] = useState<string | null>(null);
  const [proof, setProof] = useState<QboReadProof | null>(null);
  const callbackResult = new URLSearchParams(window.location.search).get("qbo");

  const loadStatus = useCallback(async () => {
    if (!session?.access_token) return;
    setBusy("loading");
    setError(null);
    try {
      setStatus(await qboRequest<QboStatus>("/api/qbo/status", session.access_token));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "QuickBooks Sandbox is unavailable.");
    } finally {
      setBusy(null);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  if (!session?.access_token) return null;

  const connect = async () => {
    setBusy("connecting");
    setError(null);
    try {
      const result = await qboRequest<{ authorizationUrl: string }>("/api/qbo/connect", session.access_token, "POST");
      navigateTo(result.authorizationUrl);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "QuickBooks Sandbox could not be opened.");
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("disconnecting");
    setError(null);
    try {
      await qboRequest<{ connected: false }>("/api/qbo/disconnect", session.access_token, "POST");
      await loadStatus();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "QuickBooks Sandbox could not be disconnected safely.");
      setBusy(null);
    }
  };

  const runReadProof = async () => {
    setBusy("proving");
    setError(null);
    try {
      setProof(await qboRequest<QboReadProof>("/api/qbo/read-proof", session.access_token, "POST"));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "QuickBooks Sandbox proof failed safely.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="border-cyan-200 bg-cyan-50/50">
      <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <Link2 className="mt-0.5 h-5 w-5 text-cyan-800" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">QuickBooks Sandbox</p>
              {status?.connected ? (
                <Badge className="gap-1 bg-emerald-700"><CheckCircle2 className="h-3 w-3" /> Connected</Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {status?.connected
                ? "Dummy-data sandbox connected. First 5 Jobs remains the operational record."
                : "Connect a dummy-data QuickBooks company for the controlled read-only test."}
            </p>
            {callbackResult === "connection_failed" ? <p className="mt-2 text-sm text-destructive">QuickBooks did not connect. Nothing was saved.</p> : null}
            {proof ? (
              <p className="mt-2 text-sm text-emerald-800">
                Read-only proof passed for {proof.company.name}: {proof.counts.customers} customers, {proof.counts.accounts} accounts, {proof.counts.invoices} invoices and {proof.counts.payments} payments. Token refreshed; no writes performed.
              </p>
            ) : null}
            {error ? <p role="alert" className="mt-2 text-sm text-destructive">{error}</p> : null}
          </div>
        </div>
        {busy === "loading" ? (
          <Button variant="outline" disabled className="shrink-0 gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Checking</Button>
        ) : status?.connected ? (
          <div className="flex flex-wrap gap-2">
            <Button className="shrink-0 gap-2 bg-cyan-800 text-white hover:bg-cyan-900" onClick={() => void runReadProof()} disabled={busy !== null}>
              {busy === "proving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Run read-only proof
            </Button>
            <Button variant="outline" className="shrink-0 gap-2 border-cyan-300 bg-white" onClick={() => void disconnect()} disabled={busy !== null}>
              {busy === "disconnecting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
              Disconnect sandbox
            </Button>
          </div>
        ) : (
          <Button className="shrink-0 gap-2 bg-cyan-800 text-white hover:bg-cyan-900" onClick={() => void connect()} disabled={busy !== null || status?.configured === false}>
            {busy === "connecting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Connect QuickBooks Sandbox
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

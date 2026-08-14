import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/lib/auth";
import { HUDSON_DOCK_CLOSED, HUDSON_DOCK_OPEN, openHudsonDock } from "@/lib/hudsonDock";

export function HudsonSupportButton({
  runId,
  label = "Ask Hudson",
  nav = false,
  className = "",
  onOpened,
}: {
  runId: string;
  label?: string;
  nav?: boolean;
  className?: string;
  onOpened?: () => void;
}) {
  const { session } = useAuth();
  const [starting, setStarting] = useState(false);
  const [hudsonOpen, setHudsonOpen] = useState(false);
  const requestIdRef = useRef<string | null>(null);

  useEffect(() => {
    const opened = () => setHudsonOpen(true);
    const closed = () => setHudsonOpen(false);
    window.addEventListener(HUDSON_DOCK_OPEN, opened);
    window.addEventListener(HUDSON_DOCK_CLOSED, closed);
    return () => {
      window.removeEventListener(HUDSON_DOCK_OPEN, opened);
      window.removeEventListener(HUDSON_DOCK_CLOSED, closed);
    };
  }, []);

  async function startHudson() {
    if (!runId || !session?.access_token || starting || hudsonOpen) return;
    setStarting(true);
    try {
      requestIdRef.current ??= crypto.randomUUID();
      const response = await fetch("/api/hudson/session-start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ requestId: requestIdRef.current, runId, mode: "first_5_jobs" }),
      });
      const payload = await response.json() as { conversationUrl?: string; error?: string };
      if (!response.ok || !payload.conversationUrl) throw new Error(payload.error || "Hudson could not start.");
      const requestId = requestIdRef.current;
      if (!requestId) throw new Error("Hudson session context was lost.");
      requestIdRef.current = null;
      setHudsonOpen(true);
      openHudsonDock({ conversationUrl: payload.conversationUrl, runId, requestId });
      onOpened?.();
    } catch (cause) {
      if (cause instanceof Error && cause.message.includes("start a new session")) requestIdRef.current = null;
      toast.error(cause instanceof Error ? cause.message : "Hudson could not start.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <Button
      type="button"
      variant={nav ? "outline" : "default"}
      onClick={() => void startHudson()}
      disabled={starting || hudsonOpen || !session?.access_token}
      className={`gap-2 ${nav ? "border-emerald-700/30 bg-white text-emerald-950 hover:bg-emerald-50" : "bg-emerald-900 text-white hover:bg-emerald-800"} ${className}`}
    >
      {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
      {starting ? "Opening Hudson…" : hudsonOpen ? "Hudson is open" : label}
    </Button>
  );
}

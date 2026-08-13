import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Maximize2, MessageCircle, Minimize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HUDSON_DOCK_OPEN, HUDSON_SCREEN_FOCUS, type HudsonDockDetail, type HudsonScreenFocus } from "@/lib/hudsonDock";

const screenSteps: Array<{ area: HudsonScreenFocus; label: string; step: number }> = [
  { area: "leads", label: "Leads", step: 2 },
  { area: "quotes", label: "Quotes", step: 3 },
  { area: "jobs", label: "Jobs", step: 4 },
  { area: "margin", label: "Margin", step: 11 },
  { area: "debtors", label: "Money owing", step: 10 },
];

function safeMeetingUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "tavus.daily.co" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default function HudsonDock() {
  const navigate = useNavigate();
  const [session, setSession] = useState<HudsonDockDetail | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const [screenFocus, setScreenFocus] = useState<HudsonScreenFocus>("leads");

  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<HudsonDockDetail>).detail;
      const conversationUrl = safeMeetingUrl(detail?.conversationUrl);
      if (!conversationUrl || !detail?.runId || !detail?.requestId) return;
      setSession({ conversationUrl, runId: detail.runId, requestId: detail.requestId });
      setMinimized(false);
      setEndError(null);
    };
    window.addEventListener(HUDSON_DOCK_OPEN, open);
    return () => window.removeEventListener(HUDSON_DOCK_OPEN, open);
  }, []);

  useEffect(() => {
    if (!session) return;
    const focus = (event: Event) => {
      const area = (event as CustomEvent<HudsonScreenFocus>).detail;
      const target = screenSteps.find((item) => item.area === area);
      if (!target) return;
      setScreenFocus(area);
      navigate(`/stage-1?runId=${encodeURIComponent(session.runId)}&tour=hudson&step=${target.step}`, { replace: true });
    };
    window.addEventListener(HUDSON_SCREEN_FOCUS, focus);
    return () => window.removeEventListener(HUDSON_SCREEN_FOCUS, focus);
  }, [navigate, session]);

  function showArea(area: HudsonScreenFocus) {
    const target = screenSteps.find((item) => item.area === area);
    if (!session || !target) return;
    setScreenFocus(area);
    navigate(`/stage-1?runId=${encodeURIComponent(session.runId)}&tour=hudson&step=${target.step}`, { replace: true });
  }

  async function endSession() {
    if (!session || ending) return;
    setEnding(true);
    setEndError(null);
    try {
      const { supabase } = await import("@/lib/supabase");
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.access_token) throw new Error("Please sign in again before closing Hudson.");
      const response = await fetch("/api/hudson/session-end", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ requestId: session.requestId, runId: session.runId }),
      });
      const payload = await response.json().catch(() => null) as { ended?: boolean; ending?: boolean; error?: string } | null;
      if (!response.ok || (!payload?.ended && !payload?.ending)) {
        throw new Error(payload?.error || "Hudson could not close the room yet.");
      }
      setSession(null);
    } catch (cause) {
      setEndError(cause instanceof Error ? cause.message : "Hudson could not close the room yet.");
    } finally {
      setEnding(false);
    }
  }

  if (!session) return null;
  if (minimized) {
    return <Button type="button" onClick={() => setMinimized(false)} className="fixed bottom-5 right-5 z-[300] gap-2 rounded-full bg-emerald-950 text-white shadow-2xl hover:bg-emerald-900"><MessageCircle className="h-4 w-4" /> Return to Hudson</Button>;
  }

  return (
    <aside className="fixed bottom-4 right-4 z-[300] w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-2xl border border-emerald-800/30 bg-white shadow-2xl" aria-label="Hudson live orientation session">
      <header className="flex items-center justify-between gap-3 bg-emerald-950 px-4 py-3 text-white">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Hudson · live orientation guide</p><p className="text-xs text-emerald-100">One First 5 Jobs area at a time</p></div>
        <div className="flex gap-1">
          <Button type="button" size="icon" variant="ghost" onClick={() => setMinimized(true)} className="text-white hover:bg-white/10 hover:text-white" aria-label="Minimise Hudson"><Minimize2 className="h-4 w-4" /></Button>
          <Button type="button" size="icon" variant="ghost" onClick={endSession} disabled={ending} className="text-white hover:bg-white/10 hover:text-white" aria-label="End and close Hudson">{ending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}</Button>
        </div>
      </header>
      <iframe title="Hudson video conversation" src={session.conversationUrl} allow="camera; microphone; fullscreen; display-capture" referrerPolicy="no-referrer" className="h-[min(52vh,520px)] w-full border-0 bg-slate-950" />
      <div className="space-y-2 border-t bg-emerald-50 px-4 py-3 text-xs text-emerald-950">
        <p>Hudson can explain what is on screen. BuildOS alone controls highlights, records, payment, Verdict and progression.</p>
        <div className="grid grid-cols-5 gap-1" aria-label="First 5 Jobs screen focus">
          {screenSteps.map((item) => <Button key={item.area} type="button" size="sm" variant={screenFocus === item.area ? "default" : "outline"} className="h-auto min-h-9 whitespace-normal px-1 py-1 text-[10px] leading-tight" onClick={() => showArea(item.area)}>{item.label}</Button>)}
        </div>
        {endError ? <p role="alert" className="rounded-md bg-red-50 p-2 text-red-800">{endError} Use the close button to try again; the automatic Tavus timeout remains active.</p> : null}
        <Button asChild size="sm" variant="outline" className="w-full gap-2 border-emerald-800/30 bg-white"><Link to={`/stage-1?runId=${encodeURIComponent(session.runId)}&tour=hudson&step=2`}><Maximize2 className="h-4 w-4" /> Show Hudson beside First 5 Jobs</Link></Button>
      </div>
    </aside>
  );
}

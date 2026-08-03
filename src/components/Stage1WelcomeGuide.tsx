import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BriefcaseBusiness, Calculator, FileText, Loader2, Pause, Play, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth";

const slides = [
  {
    title: "A controlled six-week start",
    narration: "Welcome to First 5 Jobs. You have passed Autopsy because you are ready to test a real business. This is a controlled six-week start, not a classroom exercise and not a full accounting system. Your job is to find real opportunities, complete five genuine jobs, and learn what the figures tell you.",
    visual: "purpose",
  },
  {
    title: "Record leads simply",
    narration: "Keep the lead record simple. Enter the total number of genuine enquiries you receive. You do not need to build a customer record for every enquiry. Customer and work details begin when an opportunity is ready for a written quote.",
    visual: "leads",
  },
  {
    title: "Quote real opportunities",
    narration: "Prepare a written quote when the opportunity is real. Estimate a few plain work items and the hours involved, choose the type of clean, and use your charge-out rate. If the customer accepts, First 5 Jobs creates the job and its invoice without making you enter everything again.",
    visual: "quote",
  },
  {
    title: "Complete the Job Cost Summary",
    narration: "When the work is done, complete the job in one place. Enter the actual hours, job costs, customer payments, and any useful photos or PDF documents. The comparison between the quote and the real job is where the learning happens.",
    visual: "job",
  },
  {
    title: "Start lean and finish five",
    narration: "Open a separate business bank account. Order a small first batch of business cards with room for notes on the back. Buy what booked work needs, not what an imaginary future business might need. Complete five genuine jobs within six weeks, then we will decide the next step from real information.",
    visual: "finish",
  },
] as const;

export function Stage1WelcomeGuide() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [loadingVoice, setLoadingVoice] = useState(false);
  const [voiceError, setVoiceError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const playbackIdRef = useRef(0);

  function stopVoice() {
    playbackIdRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setSpeaking(false);
    setLoadingVoice(false);
  }

  useEffect(() => () => stopVoice(), []);

  async function speak(nextIndex: number) {
    stopVoice();
    const playbackId = playbackIdRef.current;
    const controller = new AbortController();
    requestRef.current = controller;
    setIndex(nextIndex);
    setVoiceError(false);
    if (!session?.access_token) {
      setVoiceError(true);
      return;
    }
    setLoadingVoice(true);
    try {
      const response = await fetch("/api/autopsy-speech", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ text: slides[nextIndex].narration }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("voice");
      const blob = await response.blob();
      if (playbackId !== playbackIdRef.current) return;
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        if (playbackId !== playbackIdRef.current) return;
        stopVoice();
        if (nextIndex < slides.length - 1) void speak(nextIndex + 1);
      };
      audio.onerror = () => {
        if (playbackId !== playbackIdRef.current) return;
        stopVoice();
        setVoiceError(true);
      };
      setLoadingVoice(false);
      setSpeaking(true);
      await audio.play();
    } catch {
      if (playbackId !== playbackIdRef.current || controller.signal.aborted) return;
      stopVoice();
      setVoiceError(true);
    }
  }

  function begin() {
    setOpen(true);
    setIndex(0);
    void speak(0);
  }

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) stopVoice();
  }

  const slide = slides[index];

  return <>
    <Button type="button" onClick={begin} className="gap-2 bg-[#082849] text-white hover:bg-[#0b345c]"><Play className="h-4 w-4" /> Watch and hear Jane</Button>
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-w-3xl overflow-hidden p-0">
        <div className="bg-[#061b34] px-6 py-5 text-white">
          <DialogHeader><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#52d8c2]">Jane · First 5 Jobs handover</p><DialogTitle className="text-2xl text-white">{slide.title}</DialogTitle><DialogDescription className="text-slate-300">Step {index + 1} of {slides.length}</DialogDescription></DialogHeader>
          <Progress value={((index + 1) / slides.length) * 100} className="mt-4 h-1.5" />
        </div>
        <div className="grid gap-6 p-6 md:grid-cols-[1.1fr_0.9fr]">
          <GuideVisual kind={slide.visual} />
          <div className="flex flex-col justify-between gap-5">
            <div><p className="text-sm leading-7 text-foreground">{slide.narration}</p>{voiceError ? <p className="mt-3 text-xs text-amber-700">Jane’s words are on screen. You can continue reading or try the voice again.</p> : null}</div>
            <Button type="button" variant="outline" className="w-fit gap-2" onClick={() => speaking ? stopVoice() : void speak(index)} disabled={loadingVoice}>{loadingVoice ? <Loader2 className="h-4 w-4 animate-spin" /> : speaking ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{loadingVoice ? "Preparing Jane’s voice…" : speaking ? "Pause Jane" : "Hear this step"}</Button>
          </div>
        </div>
        <DialogFooter className="border-t px-6 py-4 sm:justify-between">
          <Button type="button" variant="outline" disabled={index === 0} onClick={() => void speak(index - 1)}><ArrowLeft className="mr-2 h-4 w-4" /> Previous</Button>
          {index < slides.length - 1 ? <Button type="button" onClick={() => void speak(index + 1)}>Next <ArrowRight className="ml-2 h-4 w-4" /></Button> : <Button type="button" onClick={() => changeOpen(false)}>Finish guide</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

function GuideVisual({ kind }: { kind: typeof slides[number]["visual"] }) {
  if (kind === "purpose") return <VisualFrame title="FIRST 5 JOBS"><div className="grid grid-cols-2 gap-3"><Metric label="Six weeks" value="6" /><Metric label="Genuine jobs" value="5" /></div><p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">Test the business with real work and real figures.</p></VisualFrame>;
  if (kind === "leads") return <VisualFrame title="LEADS"><div className="flex items-center gap-4 rounded-xl border border-blue-200 bg-blue-50 p-5"><Users className="h-9 w-9 text-blue-700" /><div><p className="text-3xl font-semibold">10</p><p className="text-xs text-muted-foreground">Total genuine enquiries</p></div></div><p className="text-sm text-muted-foreground">Names and work details wait until quoting.</p></VisualFrame>;
  if (kind === "quote") return <VisualFrame title="QUOTE → JOB"><div className="flex items-center justify-between gap-2"><FileText className="h-12 w-12 text-emerald-700" /><ArrowRight className="h-6 w-6 text-muted-foreground" /><BriefcaseBusiness className="h-12 w-12 text-violet-700" /></div><div className="grid grid-cols-3 gap-2 text-center text-xs"><span>Hours</span><span>Clean type</span><span>Rate</span></div><p className="rounded bg-emerald-50 p-2 text-center text-sm font-medium text-emerald-800">Accepted quote creates the job</p></VisualFrame>;
  if (kind === "job") return <VisualFrame title="JOB COST SUMMARY"><div className="space-y-2 text-sm"><SummaryLine label="Quoted hours" value="10" /><SummaryLine label="Actual hours" value="9.5" /><SummaryLine label="Job costs" value="$42.00" /><SummaryLine label="Customer payment" value="$660.00" /></div><p className="flex items-center gap-2 text-xs text-muted-foreground"><Calculator className="h-4 w-4" /> Quote compared with reality</p></VisualFrame>;
  return <VisualFrame title="KEEP IT LEAN"><div className="space-y-3"><Check text="Separate bank account" /><Check text="Small batch of business cards" /><Check text="Buy for booked work" /><Check text="Finish five genuine jobs" /></div></VisualFrame>;
}

function VisualFrame({ title, children }: { title: string; children: React.ReactNode }) { return <div className="min-h-[280px] space-y-5 rounded-xl border bg-slate-50 p-5 shadow-inner"><p className="text-xs font-semibold tracking-[0.18em] text-slate-500">{title}</p>{children}</div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border bg-white p-4"><p className="text-3xl font-semibold text-[#082849]">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>; }
function SummaryLine({ label, value }: { label: string; value: string }) { return <div className="flex justify-between border-b pb-2"><span className="text-muted-foreground">{label}</span><strong>{value}</strong></div>; }
function Check({ text }: { text: string }) { return <p className="flex items-center gap-2 rounded-lg border bg-white p-3 text-sm"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-xs text-emerald-800">✓</span>{text}</p>; }

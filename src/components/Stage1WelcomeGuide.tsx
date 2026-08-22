import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeft, ArrowRight, GripHorizontal, Loader2, Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth";
import { DISCOVER_HELP_STATE } from "@/lib/discoverHelpState";

const dashboardSlides = [
  { title: "A controlled six-week start", narration: "Welcome to First 5 Jobs. This demonstration command centre uses sample information to show the complete process. After Autopsy, your job is to find genuine opportunities, complete five jobs, and learn what the figures tell you." },
  { title: "Record leads simply", narration: "This is the Leads card. Open it to see where enquiries came from, the date of each activity, and the quantities attempted, contacted and converted. This is a light activity record, not a full customer database." },
  { title: "See what produced the leads", narration: "This is the Leads drill-down. Sources are grouped by method, with dated activity and quantities underneath. Use Log Activity after genuine marketing work. Customer details begin only when an opportunity is ready to quote." },
  { title: "Quote genuine opportunities", narration: "The Conversions card opens Quotes. There you can create a quote, see what is outstanding, accepted or rejected, and open a document to print it or save it as a PDF for email. Changing a quote to Accepted creates the job, so Hudson will never do that for you." },
  { title: "Track active work", narration: "This is the Active Jobs card. A job begins when you deliberately accept a quote. Open the job and use its Job Cost Summary to enter actual hours, costs, payments and attachments." },
  { title: "Open the Job Cost Summary", narration: "This sample completed job carries its job number, source quote, client and site into one detailed report. The apprentice updates the job here rather than chasing information across several screens." },
  { title: "Review and send the final invoice", narration: "Client Invoices contains the invoice generated from the accepted quotation, plus any legitimate extra charge or credit note. Open the invoice line to inspect its source document, then print or save the final invoice for the customer." },
  { title: "Enter the job costs", narration: "Job Costs compares estimated and actual hours and records the direct costs of completing the work. Attach a phone photo or PDF to the relevant line. This is enough discipline to learn the margin without turning five jobs into an accounting bureaucracy." },
  { title: "Record payment and finish the job", narration: "Record the customer's payment against the job and mark the work Completed only when it is genuinely finished. The report then shows revenue, direct cost, gross profit and margin for that job." },
  { title: "Use the Job Summary", narration: "Job Summary shows each job as an operating result: quoted value, invoices, costs, hours and margin. Open a line to complete the Job Cost Summary and prepare or review the final invoice." },
  { title: "Use Debtors separately", narration: "Debtors answers a different question: who owes you money and how much. Job Summary tells you how the work performed. Debtors tells you what still needs to be collected. Switch between them here whenever you need either view." },
] as const;

const quotesSlides = [
  { title: "Your Quotes control centre", narration: "The totals separate outstanding, rejected and accepted sample quotes. Select a total to filter the list without changing any record." },
  { title: "Outstanding quotes", narration: "Outstanding shows prices that have been sent but are still waiting for the customer's decision. Click the box whenever you need a clean follow-up list." },
  { title: "Rejected quotes", narration: "Rejected keeps the work you did not win. That is useful learning, but First 5 Jobs does not turn it into a complicated sales system." },
  { title: "Accepted and converted", narration: "Accepted shows quotes that became jobs. In the working system, changing a quote to Accepted creates the job, so Hudson will never press that control for you." },
  { title: "Create a written quote", narration: "Create a quote captures the customer, service address, type of clean, estimated work and charge-out rate. First 5 Jobs calculates the quote and keeps the document attached to the opportunity." },
] as const;

const builderSlides = [
  { title: "Your business details", narration: "The quote starts with verified Business Details. These are locked into the document so the apprentice does not repeatedly type the ABN, registered identity and contact details." },
  { title: "Customer and work", narration: "Enter the customer, contact details, service address, validity date and any useful notes or exclusions. This information follows the quote into the job." },
  { title: "Choose the clean", narration: "Choose one plain type of clean. That single decision applies the cleaning sleeve's controlled supplies allowance without asking the apprentice to allocate millilitres of detergent." },
  { title: "Estimate hours and price", narration: "Break the work into a few understandable tasks, estimate the hours and enter one charge-out rate. First 5 Jobs calculates labour, supplies, subtotal, GST and the total customer price." },
  { title: "Generate the quotation", narration: "In the live workspace, Generate and Open Quote performs one complete action. It generates the finished customer document, records it under Outstanding quotes, and opens it immediately for printing or email. There is no separate draft or issue step." },
] as const;

const documentSlides = [
  { title: "A proper customer quotation", narration: "This is the actual quotation layout, filled with sample data. It uses verified business details, the customer and service address, the estimated work, GST, total price and payment terms." },
  { title: "Print or send it", narration: "Use Print or save PDF to print this document. To email it, save the PDF and attach it to the customer's email. The demonstration is read only, so its commercial controls are deliberately disabled." },
  { title: "From quotation to job", narration: "In the working system, Customer accepted creates the job and carries the quote into the Job Cost Summary. The demonstration now continues into sample jobs, costs and the final invoice process." },
] as const;

type TourMode = "dashboard" | "quotes" | "builder" | "document" | "jobs";
type TourSlide = { title: string; narration: string };

const TOTAL_TOUR_STEPS = dashboardSlides.length + quotesSlides.length + builderSlides.length + documentSlides.length;
const tourSegments: Record<TourMode, { slides: readonly TourSlide[]; offset: number }> = {
  dashboard: { slides: dashboardSlides.slice(0, 3), offset: 0 },
  quotes: { slides: [dashboardSlides[3], ...quotesSlides], offset: 3 },
  builder: { slides: builderSlides, offset: 9 },
  document: { slides: documentSlides, offset: 14 },
  jobs: { slides: dashboardSlides.slice(4), offset: 17 },
};

export function Stage1WelcomeGuide({ onClose, onStepChange, mode = "dashboard", initialStep = 0, autoPlay = false, onJourneyAction, onJourneyBack }: { onClose: () => void; onStepChange: (step: number) => void; mode?: TourMode; initialStep?: number; autoPlay?: boolean; onJourneyAction?: (step: number) => void; onJourneyBack?: () => void }) {
  const { session } = useAuth();
  const { slides, offset } = tourSegments[mode];
  const [index, setIndex] = useState(Math.min(initialStep, slides.length - 1));
  const [speaking, setSpeaking] = useState(false);
  const [loadingVoice, setLoadingVoice] = useState(false);
  const [voiceError, setVoiceError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const playbackIdRef = useRef(0);
  const speakRef = useRef<(step: number) => void>(() => undefined);
  const panelRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ pointerId: number; dx: number; dy: number } | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(() => {
    try { const saved = sessionStorage.getItem("stage1-tour-position"); return saved ? JSON.parse(saved) : null; } catch { return null; }
  });

  useEffect(() => {
    if (!position || !panelRef.current) return;
    const keepInViewport = () => {
      if (!panelRef.current) return;
      const rect = panelRef.current.getBoundingClientRect();
      const next = {
        left: Math.max(8, Math.min(Math.max(8, window.innerWidth - rect.width - 8), position.left)),
        top: Math.max(8, Math.min(Math.max(8, window.innerHeight - rect.height - 8), position.top)),
      };
      if (next.left === position.left && next.top === position.top) return;
      setPosition(next);
      sessionStorage.setItem("stage1-tour-position", JSON.stringify(next));
    };
    keepInViewport();
    window.addEventListener("resize", keepInViewport);
    return () => window.removeEventListener("resize", keepInViewport);
  }, [index, position]);

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

  useEffect(() => {
    const startingStep = Math.min(initialStep, slides.length - 1);
    onStepChange(startingStep);
    const timer = autoPlay ? window.setTimeout(() => speakRef.current(startingStep), 350) : null;
    return () => {
      if (timer != null) window.clearTimeout(timer);
      stopVoice();
    };
  }, [autoPlay, initialStep, onStepChange, slides.length]);

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (window.innerWidth < 768 || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    dragRef.current = { pointerId: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(Math.max(8, window.innerWidth - rect.width - 8), event.clientX - dragRef.current.dx));
    const top = Math.max(8, Math.min(Math.max(8, window.innerHeight - rect.height - 8), event.clientY - dragRef.current.dy));
    const next = { left, top };
    setPosition(next);
    sessionStorage.setItem("stage1-tour-position", JSON.stringify(next));
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  async function speak(nextIndex: number) {
    stopVoice();
    const playbackId = playbackIdRef.current;
    const controller = new AbortController();
    requestRef.current = controller;
    setIndex(nextIndex);
    onStepChange(nextIndex);
    setVoiceError(false);
    if (!session?.access_token) { setVoiceError(true); return; }
    setLoadingVoice(true);
    try {
      const response = await fetch("/api/autopsy-speech", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ text: slides[nextIndex].narration }), signal: controller.signal });
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
        const navigationCheckpoint = mode !== "jobs" && nextIndex === slides.length - 1;
        if (navigationCheckpoint && onJourneyAction) {
          onJourneyAction(nextIndex);
          return;
        }
        if (nextIndex < slides.length - 1) void speak(nextIndex + 1);
      };
      audio.onerror = () => { if (playbackId !== playbackIdRef.current) return; stopVoice(); setVoiceError(true); };
      setLoadingVoice(false);
      setSpeaking(true);
      await audio.play();
    } catch {
      if (playbackId !== playbackIdRef.current || controller.signal.aborted) return;
      stopVoice();
      setVoiceError(true);
    }
  }
  speakRef.current = (step) => void speak(step);

  function close() { stopVoice(); onClose(); }
  const slide = slides[index];
  const journeyCheckpoint = mode !== "jobs" && index === slides.length - 1;
  const forward = () => {
    if (journeyCheckpoint && onJourneyAction) { stopVoice(); onJourneyAction(index); return; }
    if (index < slides.length - 1) { void speak(index + 1); return; }
    close();
  };

  const positioned = position ? { left: position.left, top: position.top, right: "auto", bottom: "auto", margin: 0 } : undefined;
  return <aside ref={panelRef} style={positioned} className={`fixed z-[200] max-h-[calc(100vh-1rem)] w-[calc(100%-1.5rem)] max-w-2xl overflow-auto rounded-xl border border-sky-300 bg-white shadow-2xl ${position ? "" : "inset-x-3 bottom-3 mx-auto md:bottom-6"}`}>
    <div className="bg-[#061b34] px-5 py-4 text-white">
      <div onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} className="mb-3 hidden min-h-10 cursor-grab touch-none select-none items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 text-xs font-semibold text-slate-100 active:cursor-grabbing md:flex"><GripHorizontal className="h-5 w-5" /> Grab here to move the tour</div>
      <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#52d8c2]">Hudson · First 5 Jobs screen guide</p><h2 className="mt-1 text-xl font-semibold">{slide.title}</h2><p className="mt-1 text-xs text-slate-300">Step {offset + index + 1} of {TOTAL_TOUR_STEPS} · highlighted on your live screen</p></div><Button type="button" size="icon" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={close} aria-label="Close live tour"><X className="h-4 w-4" /></Button></div>
      <Progress value={((offset + index + 1) / TOTAL_TOUR_STEPS) * 100} className="mt-3 h-1.5" />
    </div>
    <div className="space-y-3 px-5 py-4"><p className="text-sm leading-6">{slide.narration}</p>{voiceError ? <p className="text-xs text-amber-700">Hudson’s words are on screen. Continue reading or try the voice again.</p> : null}<div className="flex flex-wrap items-center justify-between gap-2"><Button type="button" variant="outline" size="sm" disabled={index === 0 && !onJourneyBack} onClick={() => { if (index === 0 && onJourneyBack) { stopVoice(); onJourneyBack(); return; } if (index > 0) void speak(index - 1); }}><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => speaking ? stopVoice() : void speak(index)} disabled={loadingVoice} className="gap-2">{loadingVoice ? <Loader2 className="h-4 w-4 animate-spin" /> : speaking ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{loadingVoice ? "Preparing Hudson…" : speaking ? "Pause" : offset + index === 0 ? "Play" : "Resume"}</Button><Button type="button" size="sm" onClick={forward}>{index === slides.length - 1 && !journeyCheckpoint ? "Finish" : "Forward"}<ArrowRight className="ml-1 h-4 w-4" /></Button></div></div></div>
  </aside>;
}

export function Stage1TourResume({ onClick }: { onClick: () => void }) {
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const update = (event: Event) => setHelpOpen((event as CustomEvent<boolean>).detail === true);
    window.addEventListener(DISCOVER_HELP_STATE, update);
    return () => window.removeEventListener(DISCOVER_HELP_STATE, update);
  }, []);

  if (helpOpen) return null;
  return <Button type="button" onClick={onClick} className="fixed bottom-20 right-5 z-[200] gap-2 rounded-full bg-teal-600 px-5 text-white shadow-2xl hover:bg-teal-700"><Play className="h-4 w-4" /> Resume 5 Jobs Tour</Button>;
}

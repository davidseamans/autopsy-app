import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth";

const slides = [
  { title: "A controlled six-week start", narration: "Welcome to First 5 Jobs. This is your actual command centre, using your own current information. You have passed Autopsy because you are ready to test a real business. Your job is to find real opportunities, complete five genuine jobs, and learn what the figures tell you." },
  { title: "Record leads simply", narration: "This is your real Leads card. Enter the total number of genuine enquiries you receive. You do not need to build a customer record for every enquiry. Customer and work details begin when an opportunity is ready for a written quote." },
  { title: "Quote real opportunities", narration: "This Conversions card is fed by your real quote records. Prepare a written quote when an opportunity is genuine. If the customer accepts, First 5 Jobs creates the job and its invoice without making you enter everything again." },
  { title: "Track active work", narration: "This is your real Active Jobs card. It separates work still underway from completed jobs. Use it to see whether you are progressing toward five genuine completed jobs within six weeks." },
  { title: "Complete each job in one place", narration: "This is your real job register. Open a job to reach its Job Cost Summary. Enter the actual hours, costs, customer payments and useful attachments there. The comparison between the quote and the real job is where the learning happens. Start lean, buy for booked work, and finish five." },
] as const;

export function Stage1WelcomeGuide({ onClose, onStepChange }: { onClose: () => void; onStepChange: (step: number) => void }) {
  const { session } = useAuth();
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

  useEffect(() => {
    onStepChange(0);
    return () => stopVoice();
  }, [onStepChange]);

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
      audio.onended = () => { if (playbackId !== playbackIdRef.current) return; stopVoice(); if (nextIndex < slides.length - 1) void speak(nextIndex + 1); };
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

  function close() { stopVoice(); onClose(); }
  const slide = slides[index];

  return <aside className="fixed inset-x-3 bottom-3 z-[80] mx-auto max-w-2xl overflow-hidden rounded-xl border border-sky-300 bg-white shadow-2xl md:bottom-6">
    <div className="bg-[#061b34] px-5 py-4 text-white">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#52d8c2]">Jane · live First 5 Jobs tour</p><h2 className="mt-1 text-xl font-semibold">{slide.title}</h2><p className="mt-1 text-xs text-slate-300">Step {index + 1} of {slides.length} · highlighted on your live screen</p></div><Button type="button" size="icon" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={close} aria-label="Close live tour"><X className="h-4 w-4" /></Button></div>
      <Progress value={((index + 1) / slides.length) * 100} className="mt-3 h-1.5" />
    </div>
    <div className="space-y-3 px-5 py-4"><p className="text-sm leading-6">{slide.narration}</p>{voiceError ? <p className="text-xs text-amber-700">Jane’s words are on screen. Continue reading or try the voice again.</p> : null}<div className="flex flex-wrap items-center justify-between gap-2"><Button type="button" variant="outline" size="sm" onClick={() => speaking ? stopVoice() : void speak(index)} disabled={loadingVoice} className="gap-2">{loadingVoice ? <Loader2 className="h-4 w-4 animate-spin" /> : speaking ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{loadingVoice ? "Preparing Jane…" : speaking ? "Pause Jane" : index === 0 ? "Start Jane" : "Hear this step"}</Button><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={index === 0} onClick={() => void speak(index - 1)}><ArrowLeft className="mr-1 h-4 w-4" /> Previous</Button>{index < slides.length - 1 ? <Button type="button" size="sm" onClick={() => void speak(index + 1)}>Next <ArrowRight className="ml-1 h-4 w-4" /></Button> : <Button type="button" size="sm" onClick={close}>Finish</Button>}</div></div></div>
  </aside>;
}

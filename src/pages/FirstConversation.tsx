import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { AutopsyCheckoutPanel } from "@/components/autopsy/AutopsyCheckoutPanel";
import { useSearchParams } from "react-router-dom";

type StageOption = { value: string; label: string; helper: string };
type ExperienceOption = { value: string; label: string };
type Message = { id: string; speaker: "john" | "candidate" | "system"; text: string };
type RecognitionAlternative = { transcript: string };
type RecognitionResult = { isFinal: boolean; 0: RecognitionAlternative };
type RecognitionResultEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: RecognitionResultEvent) => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const TRANSCRIPT_KEY = "autopsy-first-conversation-ai-v1";
const VOICE_KEY = "autopsy-john-voice-v3";
const SILENCE_MS = 1250;

const fallbackStages: StageOption[] = [
  { value: "startup", label: "Starting from scratch", helper: "You are considering or preparing a new business." },
  { value: "acquisition", label: "Buying a business", helper: "You are considering taking over an existing operation." },
  { value: "franchise", label: "Buying a franchise", helper: "You are considering operating within a franchise system." },
  { value: "existing", label: "Already operating", helper: "You already own or run the business." },
];

const fallbackExperiences: ExperienceOption[] = [
  { value: "never", label: "This would be my first business." },
  { value: "some", label: "I have some business or management experience." },
  { value: "experienced", label: "I have owned, run, or led businesses before." },
];

const makeMessage = (speaker: Message["speaker"], text: string): Message => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  speaker,
  text,
});

const normalise = (value: string) => value.replace(/\s+/g, " ").trim();

const FirstConversation = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const transcriptKey = `${TRANSCRIPT_KEY}:${user?.id ?? "anonymous"}`;
  const [stageOptions, setStageOptions] = useState(fallbackStages);
  const [experienceOptions, setExperienceOptions] = useState(fallbackExperiences);
  const [stage, setStage] = useState("startup");
  const [experience, setExperience] = useState("never");
  const [industry, setIndustry] = useState("");
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState("Ready when you are.");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState(() => window.localStorage.getItem(VOICE_KEY) ?? "");
  const [conversationId, setConversationId] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const stableTranscriptRef = useRef("");
  const silenceTimerRef = useRef<number | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const turnNumberRef = useRef(0);

  const persistTurn = useCallback(async (id: string, speaker: "john" | "candidate", content: string) => {
    if (!user) return;
    turnNumberRef.current += 1;
    const { error } = await supabase.from("initial_conversation_turns").insert({
      conversation_id: id,
      user_id: user.id,
      turn_number: turnNumberRef.current,
      speaker,
      content,
      is_canonical_evidence: false,
    });
    if (error) throw error;
  }, [user]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(transcriptKey) ?? "null");
      if (saved?.messages?.length) {
        setStage(saved.stage ?? "startup");
        setExperience(saved.experience ?? "never");
        setIndustry(saved.industry ?? "");
        setMessages(saved.messages);
        setConversationId(saved.conversationId ?? null);
        turnNumberRef.current = saved.messages.filter((message: Message) => message.speaker !== "system").length;
        setStarted(true);
      }
    } catch {
      window.localStorage.removeItem(transcriptKey);
    }
  }, [transcriptKey]);

  useEffect(() => {
    void Promise.all([
      supabase.from("autopsy_context_stage_options").select("code,label,description,display_order").eq("is_active", true).order("display_order"),
      supabase.from("autopsy_context_experience_options").select("code,label,display_order").eq("is_active", true).order("display_order"),
    ]).then(([stages, experiences]) => {
      if (stages.data?.length) setStageOptions(stages.data.map((item) => ({ value: item.code, label: item.label, helper: item.description })));
      if (experiences.data?.length) setExperienceOptions(experiences.data.map((item) => ({ value: item.code, label: item.label })));
    });
  }, []);

  useEffect(() => {
    const loadVoices = () => {
      const available = (window.speechSynthesis?.getVoices() ?? []).filter((voice) => voice.lang.startsWith("en"));
      setVoices(available);
      const saved = available.find((voice) => voice.name === voiceName);
      const karen = available.find((voice) => /karen/i.test(voice.name));
      const australian = available.find((voice) => voice.lang === "en-AU");
      const preferred = saved ?? karen ?? australian ?? available[0];
      if (preferred && preferred.name !== voiceName) {
        setVoiceName(preferred.name);
        window.localStorage.setItem(VOICE_KEY, preferred.name);
      }
    };
    loadVoices();
    window.speechSynthesis?.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis?.removeEventListener("voiceschanged", loadVoices);
  }, [voiceName]);

  useEffect(() => {
    if (messages.length) {
      window.localStorage.setItem(transcriptKey, JSON.stringify({ savedAt: new Date().toISOString(), stage, experience, industry, conversationId, messages }));
      transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [conversationId, experience, industry, messages, stage, transcriptKey]);

  useEffect(() => () => {
    recognitionRef.current?.abort();
    window.speechSynthesis?.cancel();
    if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
  }, []);

  const speechRecognitionConstructor = useMemo(() => {
    const speechWindow = window as typeof window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
  }, []);

  const speak = useCallback((text: string, listenAfter = true) => {
    if (!window.speechSynthesis || paused) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-AU";
    utterance.rate = 1;
    utterance.pitch = 1;
    const selected = voices.find((voice) => voice.name === voiceName) ?? voices.find((voice) => /karen/i.test(voice.name));
    if (selected) utterance.voice = selected;
    utterance.onstart = () => { setSpeaking(true); setStatus("John is speaking…"); };
    utterance.onend = () => {
      setSpeaking(false);
      setStatus("Ready when you are.");
      if (listenAfter) window.setTimeout(() => startListeningRef.current?.(), 120);
    };
    utterance.onerror = () => { setSpeaking(false); setStatus("Ready when you are."); };
    window.speechSynthesis.speak(utterance);
  }, [paused, voiceName, voices]);

  const conversationHistory = useCallback((nextUserText?: string) => {
    const history = messages
      .filter((message) => message.speaker !== "system")
      .map((message) => ({ role: message.speaker === "john" ? "assistant" : "user", content: message.text }));
    if (nextUserText) history.push({ role: "user", content: nextUserText });
    return history;
  }, [messages]);

  const sendTurn = useCallback(async (rawText: string) => {
    const text = normalise(rawText);
    if (!text || thinking || paused) return;
    setDraft("");
    setThinking(true);
    setStatus("John is thinking…");
    setMessages((current) => [...current, makeMessage("candidate", text)]);

    try {
      if (conversationId) await persistTurn(conversationId, "candidate", text);
      const response = await fetch("/api/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, experience, industry, messages: conversationHistory(text) }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.reply) throw new Error(payload.error || "No reply");
      const reply = normalise(payload.reply);
      setMessages((current) => [...current, makeMessage("john", reply)]);
      if (conversationId) await persistTurn(conversationId, "john", reply);
      setThinking(false);
      speak(reply, true);
    } catch (error) {
      setThinking(false);
      setStatus("John could not respond. Your words are still here—press Send to retry.");
      setDraft(text);
      setMessages((current) => [...current, makeMessage("system", error instanceof Error ? error.message : "Conversation service failed")]);
    }
  }, [conversationHistory, conversationId, experience, industry, paused, persistTurn, speak, stage, thinking]);

  const startListening = useCallback(() => {
    if (!speechRecognitionConstructor || listening || speaking || thinking || paused) return;
    try {
      const recognition = new speechRecognitionConstructor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-AU";
      stableTranscriptRef.current = "";

      const scheduleFinish = () => {
        if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = window.setTimeout(() => recognition.stop(), SILENCE_MS);
      };

      recognition.onstart = () => { setListening(true); setStatus("Listening…"); };
      recognition.onresult = (event) => {
        let stable = stableTranscriptRef.current;
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (result.isFinal) stable = normalise(`${stable} ${result[0].transcript}`);
        }
        stableTranscriptRef.current = stable;
        if (stable) setDraft(stable);
        scheduleFinish();
      };
      recognition.onerror = (event) => {
        setListening(false);
        setStatus(event.error === "not-allowed" ? "Microphone permission was declined." : "I did not catch that. Tap Speak and try again.");
      };
      recognition.onend = () => {
        if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
        setListening(false);
        const captured = normalise(stableTranscriptRef.current);
        if (captured) void sendTurn(captured);
        else setStatus("Ready when you are.");
      };
      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setListening(false);
      setStatus("The microphone could not start. You can type instead.");
    }
  }, [listening, paused, sendTurn, speaking, speechRecognitionConstructor, thinking]);

  const startListeningRef = useRef<(() => void) | null>(null);
  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);

  const startConversation = async () => {
    if (!user) return;
    const stageLabel = stageOptions.find((item) => item.value === stage)?.label.toLowerCase() ?? "your situation";
    const context = industry.trim() ? `${stageLabel} in ${industry.trim()}` : stageLabel;
    const opening = `Good morning. Thanks for sitting down with me. This is a conversation, not a quiz, and there is no script you have to perform against. I understand we are talking about ${context}. What is occupying your mind about it today?`;
    const { data: conversation, error } = await supabase.from("initial_conversations").insert({
      user_id: user.id,
      business_stage: stage,
      ownership_experience: experience,
      industry_context: industry.trim() || null,
      is_assessment_context: false,
    }).select("id").single();
    if (error || !conversation) {
      setStatus("The private conversation record could not be opened. Please try again.");
      return;
    }
    window.localStorage.removeItem(transcriptKey);
    turnNumberRef.current = 0;
    setConversationId(conversation.id);
    setMessages([makeMessage("john", opening)]);
    setStarted(true);
    try { await persistTurn(conversation.id, "john", opening); } catch { setStatus("The opening was not saved. Please start again before purchasing Autopsy."); }
    speak(opening, true);
  };

  const submit = (event: FormEvent) => { event.preventDefault(); void sendTurn(draft); };
  const stopListening = () => recognitionRef.current?.stop();
  const restart = () => {
    recognitionRef.current?.abort();
    window.speechSynthesis?.cancel();
    window.localStorage.removeItem(transcriptKey);
    setMessages([]); setConversationId(null); turnNumberRef.current = 0; setDraft(""); setStarted(false); setPaused(false); setThinking(false); setListening(false); setSpeaking(false); setStatus("Ready when you are.");
  };

  return (
    <main className="min-h-screen bg-[#f4efe6] px-4 py-6 text-[#211f1b] sm:px-6 sm:py-10">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] border border-[#d9cbb8] bg-[#fffdf8] shadow-2xl shadow-[#4e3f2d]/10">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5dbcc] px-5 py-4 sm:px-8">
          <div><p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8a6335]">Autopsy</p><h1 className="mt-1 text-lg font-semibold sm:text-xl">A conversation with John Galt</h1></div>
          {started ? <div className="flex gap-2"><button type="button" onClick={() => { setPaused((value) => !value); recognitionRef.current?.abort(); window.speechSynthesis?.cancel(); }} className="rounded-full border border-[#cdbb9f] px-4 py-2 text-sm font-semibold">{paused ? "Resume" : "Pause"}</button><button type="button" onClick={restart} className="rounded-full border border-[#cdbb9f] px-4 py-2 text-sm font-semibold">Start again</button></div> : null}
        </header>

        {!started ? (
          <section className="flex flex-1 items-center px-5 py-8 sm:px-10 sm:py-12"><div className="mx-auto w-full max-w-2xl">
            <p className="text-sm font-semibold text-[#8a6335]">Before we begin</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Tell me enough about your situation so we can have a worthwhile conversation.</h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-[#685f52]">John will listen and respond to what you actually say. The Autopsy framework stays in the background.</p>
            <div className="mt-8 space-y-7">
              <div><p className="text-sm font-semibold">What situation are we discussing?</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{stageOptions.map((option) => <button key={option.value} type="button" onClick={() => setStage(option.value)} className={`rounded-2xl border p-4 text-left ${stage === option.value ? "border-[#8a6335] bg-[#f2e6d4]" : "border-[#ddd0bf] bg-white"}`}><span className="block font-semibold">{option.label}</span><span className="mt-1 block text-sm text-[#756b5d]">{option.helper}</span></button>)}</div></div>
              <label className="block"><span className="text-sm font-semibold">What kind of business?</span><input value={industry} onChange={(event) => setIndustry(event.target.value)} className="mt-3 w-full rounded-2xl border border-[#ddd0bf] bg-white px-4 py-3" placeholder="Cleaning, bookkeeping, café, consulting..." /></label>
              <div><p className="text-sm font-semibold">What experience are you bringing?</p><div className="mt-3 space-y-2">{experienceOptions.map((option) => <button key={option.value} type="button" onClick={() => setExperience(option.value)} className={`w-full rounded-2xl border p-4 text-left text-sm ${experience === option.value ? "border-[#8a6335] bg-[#f2e6d4]" : "border-[#ddd0bf] bg-white"}`}>{option.label}</button>)}</div></div>
              {voices.length ? <label className="block"><span className="text-sm font-semibold">John's voice</span><select value={voiceName} onChange={(event) => { setVoiceName(event.target.value); window.localStorage.setItem(VOICE_KEY, event.target.value); }} className="mt-3 w-full rounded-2xl border border-[#ddd0bf] bg-white px-4 py-3">{voices.map((voice) => <option key={voice.name} value={voice.name}>{voice.name} — {voice.lang}</option>)}</select></label> : null}
            </div>
            <button type="button" onClick={startConversation} className="mt-8 rounded-full bg-[#2b2823] px-6 py-3 text-sm font-semibold text-white">Begin spoken conversation</button>
          </div></section>
        ) : (
          <>
            <section className="flex-1 overflow-y-auto px-5 py-6 sm:px-10 sm:py-8"><div className="mx-auto max-w-2xl space-y-5">{messages.map((message) => <div key={message.id} className={`flex ${message.speaker === "candidate" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-3xl px-5 py-4 text-[15px] leading-7 sm:text-base ${message.speaker === "candidate" ? "rounded-br-md bg-[#2b2823] text-white" : message.speaker === "system" ? "bg-[#fff0ed] text-[#8f2f24]" : "rounded-bl-md border border-[#e1d5c5] bg-white text-[#302c26] shadow-sm"}`}>{message.speaker === "john" ? <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#9a7041]">John</p> : null}<p>{message.text}</p></div></div>)}<div ref={transcriptEndRef} /></div></section>
            <footer className="border-t border-[#e5dbcc] bg-[#fffaf3] px-5 py-4 sm:px-8 sm:py-5"><div className="mx-auto max-w-2xl"><form onSubmit={submit} className="flex items-end gap-2"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} disabled={paused || listening || thinking} rows={2} placeholder={listening ? "Listening…" : thinking ? "John is thinking…" : "Speak naturally or type your response…"} className="min-h-[3.25rem] flex-1 resize-none rounded-2xl border border-[#d7c9b6] bg-white px-4 py-3 text-sm disabled:bg-[#f3eee6]" /><button type="button" onClick={listening ? stopListening : startListening} disabled={paused || speaking || thinking} className={`h-12 rounded-full px-4 text-sm font-semibold text-white disabled:opacity-45 ${listening ? "bg-[#a14336]" : "bg-[#8a6335]"}`}>{listening ? "Finish" : "Speak"}</button><button type="submit" disabled={!draft.trim() || paused || listening || thinking} className="h-12 rounded-full bg-[#2b2823] px-5 text-sm font-semibold text-white disabled:opacity-45">Send</button></form><p className="mt-3 text-xs text-[#6d6356]">{status}</p>{messages.filter((message) => message.speaker !== "system").length >= 3 || searchParams.has("checkout") ? <AutopsyCheckoutPanel conversationId={conversationId} /> : null}</div></footer>
          </>
        )}
      </section>
    </main>
  );
};

export default FirstConversation;

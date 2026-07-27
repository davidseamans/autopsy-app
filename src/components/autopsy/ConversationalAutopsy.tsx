import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  createAutopsyRun,
  extractRunId,
  finalizeAutopsyRun,
  GatewayQuestion,
  getGatewayPayload,
  recordAutopsyAnswer,
} from "./rpc";

type Interpretation = {
  selected_option_id: string | null;
  confidence: number;
  plain_summary: string;
  clarifying_question: string | null;
};

type RecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

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

const SUBJECT_PROMPTS = [
  "How long could you and your household manage if the cleaning work produced little or delayed income?",
  "What money, tools, supplies, time and other essentials do you believe are genuinely required before taking the first job?",
  "How would you separate money received from money already committed to tax, costs or future obligations?",
  "Which easily missed costs could quietly consume the money left from a cleaning job?",
  "What real customer behaviour—not encouragement or optimism—suggests people will buy from you?",
  "Which customer do you expect to serve first, what do they need solved, and why would they choose you?",
  "What could prevent you from delivering the promised cleaning result reliably when work becomes busy or inconvenient?",
  "Is your essential way of doing the work clear enough to repeat without guesswork?",
  "What practical action have you already taken that taught you something planning could not?",
  "What time have you genuinely protected during the next thirty days to keep moving?",
  "How do you usually respond when results are slow, uncertain or disappointing?",
  "What shows you can continue important, repetitive work after the initial enthusiasm fades?",
];

const normaliseOption = (option: any, index: number) => ({
  id: option?.id ?? option?.option_id ?? option?.value ?? index,
  label: typeof option === "string" ? option : option?.label ?? String(option?.value ?? index),
  score_value: Number(option?.score_value ?? option?.score ?? option?.value),
});

export function ConversationalAutopsy() {
  const { session, user } = useAuth();
  const navigate = useNavigate();
  const [runId, setRunId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<GatewayQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [combinedAnswer, setCombinedAnswer] = useState("");
  const [interpretation, setInterpretation] = useState<Interpretation | null>(null);
  const [status, setStatus] = useState("Preparing your Autopsy…");
  const [busy, setBusy] = useState(true);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef("");

  const recognitionConstructor = useMemo(() => {
    const w = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
  }, []);

  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-AU";
    utterance.rate = 0.98;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      if (!user?.email) return;
      try {
        const created = await createAutopsyRun({
          industry: "Cleaning",
          scenario: "startup",
          run_name: `Conversation ${new Date().toLocaleString("en-AU")}`,
          tester_email: user.email,
          operator_class: "unproven",
        });
        const id = extractRunId(created);
        if (!id) throw new Error("No run was created.");
        const payload = await getGatewayPayload(id);
        const ordered = [...(payload.questions ?? [])].sort(
          (a, b) => Number(a.position ?? 0) - Number(b.position ?? 0),
        );
        if (ordered.length !== 12) throw new Error("The governed twelve subjects were not available.");
        if (cancelled) return;
        setRunId(id);
        setQuestions(ordered);
        setBusy(false);
        setStatus("Take your time and answer in your own words.");
        speak(`We can continue straight into Autopsy. Take your time and answer in your own words. ${SUBJECT_PROMPTS[0]}`);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Autopsy could not start.");
          setBusy(false);
        }
      }
    };
    void start();
    return () => {
      cancelled = true;
      recognitionRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, [speak, user?.email]);

  const currentQuestion = questions[index];
  const currentPrompt = SUBJECT_PROMPTS[index] ?? currentQuestion?.prompt ?? "";

  const interpret = async (rawAnswer: string) => {
    const text = rawAnswer.trim();
    if (!text || !currentQuestion || busy) return;
    setBusy(true);
    setError("");
    const candidateAnswer = combinedAnswer ? `${combinedAnswer}\nClarification: ${text}` : text;
    try {
      const options = (currentQuestion.options ?? []).map(normaliseOption);
      const response = await fetch("/api/autopsy-assessment-turn", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          prompt: currentQuestion.prompt,
          answer: candidateAnswer,
          options,
          clarification: interpretation?.clarifying_question ?? null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "John could not interpret that answer.");
      const next = payload as Interpretation;
      setCombinedAnswer(candidateAnswer);
      setAnswer("");
      setInterpretation(next);
      if (next.selected_option_id && !next.clarifying_question) {
        const words = `${next.plain_summary} Have I understood you correctly?`;
        setStatus("Please confirm or correct what John understood.");
        speak(words);
      } else {
        const words = next.clarifying_question || "Could you tell me a little more about that?";
        setStatus("John needs one point clarified before anything is saved.");
        speak(words);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That answer could not be interpreted.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!runId || !currentQuestion || !interpretation?.selected_option_id || busy) return;
    setBusy(true);
    setError("");
    try {
      await recordAutopsyAnswer({
        run_id: runId,
        question_id: currentQuestion.question_id,
        selected_option: interpretation.selected_option_id,
      });
      if (index === 11) {
        setStatus("Your answers are saved. John is preparing your Verdict…");
        await finalizeAutopsyRun(runId);
        speak("That completes Autopsy. Your answers have been saved and your Verdict is ready.");
        window.setTimeout(() => navigate(`/autopsy/run/${runId}`), 1400);
        return;
      }
      const nextIndex = index + 1;
      setIndex(nextIndex);
      setCombinedAnswer("");
      setInterpretation(null);
      setStatus("Answer in your own words.");
      speak(SUBJECT_PROMPTS[nextIndex]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That answer could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const correct = () => {
    setInterpretation(null);
    setCombinedAnswer("");
    setAnswer("");
    setStatus("No problem. Say it again in your own words.");
    speak("No problem. Say it again in your own words.");
  };

  const startListening = () => {
    if (!recognitionConstructor || listening || speaking || busy) return;
    const recognition = new recognitionConstructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-AU";
    transcriptRef.current = "";
    recognition.onstart = () => setListening(true);
    recognition.onresult = (event) => {
      let stable = transcriptRef.current;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) stable = `${stable} ${event.results[i][0].transcript}`.trim();
      }
      transcriptRef.current = stable;
      if (stable) setAnswer(stable);
    };
    recognition.onerror = () => {
      setListening(false);
      setError("I did not catch that. You can try the microphone again or type.");
    };
    recognition.onend = () => {
      setListening(false);
      const captured = transcriptRef.current.trim();
      if (captured) void interpret(captured);
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void interpret(answer);
  };

  if (error && !questions.length) {
    return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Autopsy could not start</h1><p className="mt-3 text-muted-foreground">{error}</p></main>;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <section className="overflow-hidden rounded-[2rem] border bg-card shadow-sm">
        <header className="border-b bg-[#0b2f4d] px-6 py-5 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">Autopsy · conversation</p>
          <div className="mt-2 flex items-end justify-between gap-4">
            <h1 className="text-2xl font-semibold">Talk it through with John</h1>
            <span className="text-sm text-slate-300">{questions.length ? `${index + 1} of 12` : "Preparing"}</span>
          </div>
        </header>
        <div className="space-y-6 p-6 sm:p-8">
          {busy && !questions.length ? <p>{status}</p> : null}
          {currentPrompt ? (
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">John</p>
              <h2 className="mt-3 text-2xl font-semibold leading-snug">{currentPrompt}</h2>
            </div>
          ) : null}

          {interpretation ? (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
              {interpretation.selected_option_id && !interpretation.clarifying_question ? (
                <>
                  <p className="text-lg leading-8">{interpretation.plain_summary}</p>
                  <p className="mt-3 font-semibold">Have I understood you correctly?</p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button type="button" onClick={confirm} disabled={busy} className="rounded-full bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50">Yes, that is right</button>
                    <button type="button" onClick={correct} disabled={busy} className="rounded-full border px-5 py-3 font-semibold disabled:opacity-50">No, let me correct it</button>
                  </div>
                </>
              ) : (
                <p className="text-lg leading-8">{interpretation.clarifying_question}</p>
              )}
            </div>
          ) : null}

          {(!interpretation || interpretation.clarifying_question) ? (
            <form onSubmit={submit} className="space-y-3">
              <textarea
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                rows={4}
                disabled={busy || listening}
                placeholder="Speak naturally, or type your answer here."
                className="w-full resize-none rounded-2xl border bg-background px-4 py-3"
              />
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={listening ? () => recognitionRef.current?.stop() : startListening} disabled={busy || speaking || !recognitionConstructor} className="rounded-full bg-sky-700 px-5 py-3 font-semibold text-white disabled:opacity-50">
                  {listening ? "Finish answer" : "Use microphone"}
                </button>
                <button type="submit" disabled={busy || listening || !answer.trim()} className="rounded-full bg-[#0b2f4d] px-5 py-3 font-semibold text-white disabled:opacity-50">Continue</button>
              </div>
            </form>
          ) : null}

          <p className="text-sm text-muted-foreground">{busy ? "John is working…" : status}</p>
          {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
          <p className="border-t pt-4 text-xs text-muted-foreground">Nothing is saved as an Autopsy answer until you confirm John’s understanding.</p>
        </div>
      </section>
    </main>
  );
}

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

const AUTOPSY_ORIENTATION = [
  "Your test payment is acknowledged, so we are now beginning Autopsy.",
  "I will take you through twelve practical areas, one at a time, as a conversation.",
  "Answer honestly in your own words. There is no answer you are expected to perform, and I may pause to check that I have understood you before anything is saved.",
  "At the end, you will receive a Verdict. It may open First 5 Jobs, identify something to deal with first, or say that stopping for now is the sensible result.",
  "You will also be able to open a fuller explanation and print it or save it as a PDF.",
  "Let us begin.",
].join(" ");

const SUBJECT_TRANSITIONS = [
  "",
  "All right. Now let us look at what you believe it will take to start properly.",
  "Thank you. Next, let us look at how you would treat money coming in.",
  "All right. Staying with the numbers for a moment, let us look at the costs that are easy to miss.",
  "Thank you. Now let us move from preparation to what the market has actually shown you.",
  "All right. Let us make that customer picture more specific.",
  "Thank you. Now let us look at whether the work can be delivered reliably.",
  "All right. Staying with delivery, let us look at how repeatable the work would be.",
  "Thank you. Now let us look at what you have already learned by doing.",
  "All right. Let us turn to the time you have actually made available.",
  "Thank you. Now let us look at how you respond when progress becomes difficult.",
  "All right. One final area: what happens after the early excitement wears off.",
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
  const startListeningRef = useRef<(() => void) | null>(null);
  const handleSpokenTurnRef = useRef<((text: string) => void) | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSpokenTextRef = useRef("");

  const recognitionConstructor = useMemo(() => {
    const w = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
  }, []);

  const speak = useCallback(async (text: string, listenAfter = true) => {
    lastSpokenTextRef.current = text;
    audioRef.current?.pause();
    setSpeaking(true);
    setStatus("John is speaking…");
    try {
      const response = await fetch("/api/autopsy-speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error("voice");
      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      await new Promise<void>((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(url);
          setSpeaking(false);
          if (listenAfter) window.setTimeout(() => startListeningRef.current?.(), 180);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          setSpeaking(false);
          setStatus("John's words are on screen. Use Hear John to try the voice again.");
          resolve();
        };
        void audio.play().catch(() => {
          URL.revokeObjectURL(url);
          setSpeaking(false);
          setStatus("John's words are on screen. Use Hear John to try the voice again.");
          resolve();
        });
      });
    } catch {
      setSpeaking(false);
      setStatus("John's words are on screen. Use Hear John to try the voice again.");
    }
  }, [session?.access_token]);

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
        setStatus("John is explaining how Autopsy will work.");
        void speak(`${AUTOPSY_ORIENTATION} ${SUBJECT_PROMPTS[0]}`);
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
      audioRef.current?.pause();
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
        const words = `${next.plain_summary} Is that a fair reading?`;
        setStatus("Please confirm or correct what John understood.");
        void speak(words);
      } else {
        const words = next.clarifying_question || "Could you tell me a little more about that?";
        setStatus("John needs one point clarified before anything is saved.");
        void speak(words);
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
        sessionStorage.setItem(`autopsy.verdict_voice.${runId}`, "pending");
        navigate(`/autopsy/run/${runId}`);
        return;
      }
      const nextIndex = index + 1;
      setIndex(nextIndex);
      setCombinedAnswer("");
      setInterpretation(null);
      setStatus("Answer in your own words.");
      void speak(`${SUBJECT_TRANSITIONS[nextIndex]} ${SUBJECT_PROMPTS[nextIndex]}`);
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
    void speak("No problem. Say it again in your own words.");
  };

  const startListening = () => {
    if (!recognitionConstructor || listening || speaking || busy) return;
    const recognition = new recognitionConstructor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-AU";
    transcriptRef.current = "";
    recognition.onstart = () => {
      setListening(true);
      setStatus("Listening…");
    };
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
      if (captured) {
        setStatus("John is thinking…");
        handleSpokenTurnRef.current?.(captured);
      } else {
        setStatus("I did not catch that. Use the microphone or type your answer.");
      }
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleSpokenTurn = useCallback((text: string) => {
    const normalised = text
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const awaitingConfirmation =
      Boolean(interpretation?.selected_option_id) &&
      !interpretation?.clarifying_question;

    if (!awaitingConfirmation) {
      void interpret(text);
      return;
    }
    if (/^(yes|yeah|yep|correct|exactly|right|thats right|that is right)\b/.test(normalised)) {
      void confirm();
      return;
    }
    if (/^(no|nope|not quite|thats not right|that is not right)\b/.test(normalised)) {
      correct();
      return;
    }
    setStatus("Please say yes, or tell John you would like to correct it.");
    void speak("Please say yes if that is a fair reading, or say no and we will correct it.");
  }, [confirm, correct, interpretation, speak]);

  useEffect(() => {
    startListeningRef.current = startListening;
    handleSpokenTurnRef.current = handleSpokenTurn;
  }, [handleSpokenTurn]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void interpret(answer);
  };

  if (error && !questions.length) {
    return <main className="min-h-screen bg-[#06111c] p-8 text-[#edf8fb]"><div className="mx-auto max-w-xl border border-[#1c3547] bg-[#091925] p-8"><h1 className="text-2xl font-semibold">Autopsy could not start</h1><p className="mt-3 text-[#9aafbd]">{error}</p></div></main>;
  }

  return (
    <main
      className="relative min-h-screen overflow-hidden bg-[#06111c] px-4 pb-10 pt-20 text-[#edf8fb] sm:px-8"
      style={{
        backgroundImage:
          "linear-gradient(rgba(56,170,250,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(56,170,250,.05) 1px,transparent 1px)",
        backgroundSize: "70px 70px",
      }}
    >
      <div className="absolute inset-x-0 top-14 h-px bg-gradient-to-r from-transparent via-[#38aafa] to-transparent shadow-[0_0_20px_#38aafa]" />
      <nav className="relative mx-auto flex max-w-7xl items-center gap-4 font-mono text-[10px] tracking-[0.16em] text-[#556c7c]">
        <span className="text-[#b78525]">LANDING</span><i className="h-px w-14 bg-[#1c3547]" />
        <span className="text-[#38aafa]">AUTOPSY</span><i className="h-px w-14 bg-[#1c3547]" />
        <span>5JD</span><i className="h-px w-14 bg-[#1c3547]" /><span>CORE</span>
      </nav>

      <section className="relative mx-auto mt-10 grid min-h-[690px] max-w-7xl border border-[#1c3547] bg-[#091925]/95 lg:grid-cols-[34%_66%]">
        <aside className="flex min-h-[270px] flex-col border-b border-[#1c3547] p-8 lg:border-b-0 lg:border-r lg:p-14">
          <p className="text-[10px] font-bold tracking-[0.2em] text-[#b78525]">AUTOPSY · TEST CONVERSATION</p>
          <blockquote className="my-auto font-serif text-3xl leading-snug text-[#dce8ec]">
            “Speak naturally. John will listen, clarify and keep the twelve subjects in the background.”
          </blockquote>
          <small className="text-sm leading-6 text-[#718796]">
            Nothing becomes an Autopsy answer until you confirm that John has understood you correctly.
          </small>
        </aside>

        <article className="flex min-h-[600px] flex-col p-8 lg:p-14">
          <header className="flex items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <i className="grid h-12 w-12 place-items-center rounded-full border border-[#38aafa] not-italic text-[#38aafa] shadow-[0_0_28px_rgba(56,170,250,.18)]">J</i>
              <p className="text-[11px] font-bold tracking-[0.18em]">JOHN<small className="mt-1 block font-normal text-[#7f95a7]">Autopsy · listening and guiding</small></p>
            </div>
            <span className="font-mono text-xs text-[#7f95a7]">{questions.length ? `${index + 1} OF 12` : "PREPARING"}</span>
          </header>

          <div className="mt-12">
            <p className="text-[10px] font-bold tracking-[0.2em] text-[#54c5ff]">CURRENT SUBJECT</p>
            <h1 className="mt-5 max-w-4xl font-serif text-4xl font-normal leading-[1.12] tracking-[-0.035em] text-[#edf8fb] sm:text-5xl">
              {currentPrompt || status}
            </h1>
          </div>

          {interpretation ? (
            <div className="mt-8 border border-[#24475e] bg-[#0d2637] p-5">
              {interpretation.selected_option_id && !interpretation.clarifying_question ? (
                <>
                  <p className="text-lg leading-8 text-[#dce8ec]">{interpretation.plain_summary}</p>
                  <p className="mt-3 font-semibold text-[#54c5ff]">Is that a fair reading?</p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button type="button" onClick={confirm} disabled={busy} className="bg-[#2f8b5a] px-5 py-3 text-sm font-bold text-white disabled:opacity-40">YES, THAT'S RIGHT</button>
                    <button type="button" onClick={correct} disabled={busy} className="border border-[#547083] px-5 py-3 text-sm font-bold text-[#dce8ec] disabled:opacity-40">NO, LET ME CORRECT IT</button>
                    <button type="button" onClick={listening ? () => recognitionRef.current?.stop() : startListening} disabled={busy || speaking || !recognitionConstructor} className="bg-[#145ee7] px-5 py-3 text-sm font-bold text-white disabled:opacity-40">
                      {listening ? "FINISH SPEAKING" : "ANSWER BY VOICE"}
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-lg leading-8 text-[#dce8ec]">{interpretation.clarifying_question}</p>
              )}
            </div>
          ) : null}

          {(!interpretation || interpretation.clarifying_question) ? (
            <form onSubmit={submit} className="mt-auto pt-9">
              <label htmlFor="autopsy-conversation-answer" className="text-[10px] font-bold tracking-[0.2em] text-[#54c5ff]">YOUR RESPONSE</label>
              <textarea
                id="autopsy-conversation-answer"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                rows={3}
                disabled={busy || listening}
                placeholder="Speak naturally, or type here."
                className="mt-3 w-full resize-none border-0 border-t border-[#244052] bg-transparent px-0 py-4 text-lg text-white outline-none placeholder:text-[#6d8393]"
              />
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={listening ? () => recognitionRef.current?.stop() : startListening} disabled={busy || speaking || !recognitionConstructor} className="bg-[#145ee7] px-6 py-3 text-sm font-bold text-white disabled:opacity-40">
                  {listening ? "FINISH ANSWER" : "USE MICROPHONE"}
                </button>
                <button type="submit" disabled={busy || listening || !answer.trim()} className="border border-[#38aafa] px-6 py-3 text-sm font-bold text-[#edf8fb] disabled:opacity-30">CONTINUE</button>
                <button type="button" onClick={() => void speak(lastSpokenTextRef.current || currentPrompt)} disabled={busy || speaking || !lastSpokenTextRef.current} className="ml-auto border-0 bg-transparent text-xs font-bold tracking-[0.12em] text-[#7f95a7] disabled:opacity-30">HEAR JOHN AGAIN</button>
              </div>
            </form>
          ) : null}

          <p className="mt-5 text-sm text-[#8ea5b4]">{busy ? "John is considering what you said…" : status}</p>
          {error ? <p className="mt-3 border border-[#7b3434] bg-[#2b171b] p-3 text-sm text-[#ffb7b7]">{error}</p> : null}
        </article>
      </section>
    </main>
  );
}

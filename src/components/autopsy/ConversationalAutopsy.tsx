import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  isFlightDeckEmbedded,
  isFlightDeckInput,
  postToFlightDeck,
} from "@/lib/flightDeckBridge";
import {
  createAutopsyRun,
  extractRunId,
  finalizeAutopsyRun,
  GatewayQuestion,
  getGatewayPayload,
  recordAutopsyAnswer,
} from "./rpc";
import { cn } from "@/lib/utils";

type Interpretation = {
  question_id: string;
  subject_token: string;
  turn_type:
    | "answer"
    | "question"
    | "repeat_request"
    | "correction"
    | "control_request"
    | "digression";
  selected_option_id: string | null;
  confidence: number;
  plain_summary: string;
  spoken_acknowledgement: string;
  clarifying_question: string | null;
  conversation_reply: string | null;
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
type InputMode = "voice" | "text";

const SUBJECT_PRESENTATION: Record<string, { prompt: string; boundary: string }> = {
  CR_01: {
    prompt: "If the cleaning work produced little or delayed income, how long could your household keep going safely?",
    boundary: "Household survival runway while cleaning income is uncertain. A stated duration supported by reviewed household expenses, available household income, or a contingency allowance is an inspectable runway. A partner's income is a legitimate household resource and must not cause a downgrade. Exclude business setup purchases and job costs.",
  },
  CR_02: {
    prompt: "Before taking the first cleaning job, what must you have paid for, organised or kept available?",
    boundary: "The minimum one-off setup and working resources required before the first job. Exclude household living costs and recurring per-job economics.",
  },
  EL_01: {
    prompt: "When a customer pays you, how would you work out what is genuinely left after that job?",
    boundary: "Understanding one job's revenue, direct costs, tax and money left. Exclude one-off startup purchases and household runway.",
  },
  EL_02: {
    prompt: "As you complete more cleaning jobs, which repeating costs could quietly consume the money you expect to keep?",
    boundary: "Recurring cost drivers that grow with or repeatedly support jobs, including labour time, travel, supplies, rework, insurance allocation and administration. Exclude one-off startup purchases.",
  },
  MR_01: {
    prompt: "What has a real potential customer actually done—not merely said—that suggests they may buy from you?",
    boundary: "Observed customer behaviour rather than encouragement, market size or the operator's enthusiasm. A genuine booking for specific work on an agreed date is a real customer commitment; do not require a deposit, completed work, signed purchase order or prior payment.",
  },
  MR_02: {
    prompt: "Who would you expect to clean for first, what problem would you remove, and why might they choose you?",
    boundary: "Clarity about the first likely customer and their problem, not broad market attractiveness.",
  },
  OP_01: {
    prompt: "What might stop you delivering the promised cleaning result when the work becomes busy or inconvenient?",
    boundary: "Practical ability to deliver reliably under ordinary operating pressure, not written process repeatability.",
  },
  OP_02: {
    prompt: "Could another person follow your cleaning method and produce the same result without guessing?",
    boundary: "A repeatable method, sequence, tools and quality check, not general willingness or practical effort.",
  },
  EX_01: {
    prompt: "What have you already done in the real world that taught you something planning could not?",
    boundary: "Completed practical action and learning, not intentions, reading or encouragement. Sustained work alongside an experienced cleaning operator counts as strong practical action and learning even when it was not the person's own operation.",
  },
  EX_02: {
    prompt: "During the next thirty days, what time have you genuinely protected to keep moving?",
    boundary: "Specific protected execution time and a credible rhythm, not enthusiasm or a vague intention.",
  },
  PR_01: {
    prompt: "When results are slow or disappointing, how do you usually decide whether to persist, learn or change direction?",
    boundary: "Response to uncertainty and setbacks, not repetitive follow-through after enthusiasm fades.",
  },
  PR_02: {
    prompt: "What shows you can keep doing important repetitive work after the initial enthusiasm has faded?",
    boundary: "Sustained follow-through on repetitive work, not general resilience to uncertainty.",
  },
};

const SUBJECT_ORDER = [
  "CR_01",
  "CR_02",
  "EL_01",
  "EL_02",
  "MR_01",
  "MR_02",
  "OP_01",
  "OP_02",
  "EX_01",
  "EX_02",
  "PR_01",
  "PR_02",
];

const presentationFor = (question: GatewayQuestion | undefined, subjectIndex: number) =>
  SUBJECT_PRESENTATION[question?.q_id ?? ""] ??
  SUBJECT_PRESENTATION[SUBJECT_ORDER[subjectIndex]] ?? {
    prompt: question?.prompt ?? "",
    boundary: "The single governed subject shown on screen.",
  };

const FALLBACK_SUBJECT_PROMPTS = SUBJECT_ORDER.map(
  (key) => SUBJECT_PRESENTATION[key].prompt,
);

const AUTOPSY_ORIENTATION = [
  "Your test payment is acknowledged, so we are now beginning Autopsy.",
  "I will take you through twelve practical areas, one at a time, as a conversation.",
  "Answer honestly in your own words. There is no answer you are expected to perform, and I may pause to check that I have understood you before anything is saved.",
  "At the end, you will receive a Verdict. It may open First 5 Jobs, identify something to deal with first, or say that stopping for now is the sensible result.",
  "You will also be able to open a fuller explanation and print it or save it as a PDF.",
  "Let us begin.",
].join(" ");

const transitionFor = (nextIndex: number) =>
  nextIndex === 11
    ? "All right. One final practical area."
    : nextIndex % 2 === 0
      ? "Thank you. Let us look at the next practical area."
      : "All right. Let us move to the next practical area.";

const conversationalTransition = (acknowledgement: string | undefined, nextIndex: number) =>
  `${acknowledgement?.trim() ? `${acknowledgement.trim()} ` : ""}${transitionFor(nextIndex)}`;

const normaliseOption = (rawOption: unknown, index: number) => {
  if (typeof rawOption === "string") {
    return { id: index, label: rawOption, score_value: Number.NaN };
  }
  const option = (rawOption ?? {}) as Record<string, unknown>;
  return {
    id: option.id ?? option.option_id ?? option.value ?? index,
    label: typeof option.label === "string"
      ? option.label
      : String(option.value ?? index),
    score_value: Number(option.score_value ?? option.score ?? option.value),
  };
};

export function ConversationalAutopsy() {
  const { session, user } = useAuth();
  const navigate = useNavigate();
  const [runId, setRunId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<GatewayQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [combinedAnswer, setCombinedAnswer] = useState("");
  const [clarificationCount, setClarificationCount] = useState(0);
  const [interpretation, setInterpretation] = useState<Interpretation | null>(null);
  const [conversationReply, setConversationReply] = useState("");
  const [status, setStatus] = useState("Preparing your Autopsy…");
  const [busy, setBusy] = useState(true);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const [lastInputMode, setLastInputMode] = useState<InputMode>("voice");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef("");
  const startListeningRef = useRef<(() => void) | null>(null);
  const handleSpokenTurnRef = useRef<((text: string) => void) | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSpokenTextRef = useRef("");
  const activeSubjectRef = useRef({ id: "", token: "", prompt: "", boundary: "" });
  const interpretationRef = useRef<Interpretation | null>(null);
  const confirmationSavingRef = useRef(false);
  const initializationRef = useRef<{
    email: string;
    promise: Promise<{ id: string; ordered: GatewayQuestion[] }>;
    presented: boolean;
  } | null>(null);
  const embeddedFlightDeck = isFlightDeckEmbedded();

  const storeInterpretation = (next: Interpretation | null) => {
    interpretationRef.current = next;
    setInterpretation(next);
  };

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
        if (!initializationRef.current || initializationRef.current.email !== user.email) {
          const email = user.email;
          const promise = (async () => {
            const created = await createAutopsyRun({
              industry: "Cleaning",
              scenario: "startup",
              run_name: `Conversation ${new Date().toLocaleString("en-AU")}`,
              tester_email: email,
              operator_class: "unproven",
            });
            const id = extractRunId(created);
            if (!id) throw new Error("No run was created.");
            const payload = await getGatewayPayload(id);
            const ordered = [...(payload.questions ?? [])].sort(
              (a, b) => Number(a.position ?? 0) - Number(b.position ?? 0),
            );
            if (ordered.length !== 12) {
              throw new Error("The governed twelve subjects were not available.");
            }
            return { id, ordered };
          })();
          initializationRef.current = { email, promise, presented: false };
        }
        const { id, ordered } = await initializationRef.current.promise;
        if (cancelled) return;
        if (initializationRef.current.presented) return;
        initializationRef.current.presented = true;
        setRunId(id);
        setQuestions(ordered);
        const first = ordered[0];
        const firstPresentation = presentationFor(first, 0);
        activeSubjectRef.current = {
          id: String(first.question_id),
          token: `${id}:0:${String(first.question_id)}`,
          prompt: firstPresentation.prompt,
          boundary: firstPresentation.boundary,
        };
        setBusy(false);
        setStatus("John is explaining how Autopsy will work.");
        const opening = `${AUTOPSY_ORIENTATION} ${firstPresentation.prompt}`;
        if (embeddedFlightDeck) {
          postToFlightDeck({
            type: "BUILDOS_AUTOPSY_EVENT",
            event: "ready",
            text: opening,
            subjectId: String(first.question_id),
            subjectToken: activeSubjectRef.current.token,
          });
        } else {
          void speak(opening);
        }
      } catch (cause) {
        if (initializationRef.current?.email === user.email) {
          initializationRef.current = null;
        }
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
  }, [embeddedFlightDeck, speak, user?.email]);

  const currentQuestion = questions[index];
  const presentation = currentQuestion
    ? presentationFor(currentQuestion, index)
    : { prompt: FALLBACK_SUBJECT_PROMPTS[index] ?? "", boundary: "" };
  const currentPrompt = presentation.prompt;
  if (currentQuestion) {
    const id = String(currentQuestion.question_id);
    const token = `${runId ?? "preparing"}:${index}:${id}`;
    activeSubjectRef.current = { id, token, prompt: currentPrompt, boundary: presentation.boundary };
  }

  const saveSelectionAndAdvance = async (chosen: Interpretation) => {
    if (
      !runId ||
      !currentQuestion ||
      !chosen.selected_option_id ||
      chosen.question_id !== String(currentQuestion.question_id)
    ) {
      throw new Error("John lost the current subject before it could be saved.");
    }
    await recordAutopsyAnswer({
      run_id: runId,
      question_id: currentQuestion.question_id,
      selected_option: chosen.selected_option_id,
    });
    if (index === 11) {
      setStatus("Your answers are saved. John is preparing your Verdict…");
      await finalizeAutopsyRun(runId);
      if (!embeddedFlightDeck) {
        sessionStorage.setItem(`autopsy.verdict_voice.${runId}`, "pending");
      }
      navigate(`/autopsy/run/${runId}${embeddedFlightDeck ? "?embedded=flight-deck" : ""}`);
      return;
    }
    const nextIndex = index + 1;
    const nextQuestion = questions[nextIndex];
    const nextPresentation = presentationFor(nextQuestion, nextIndex);
    const nextId = String(nextQuestion.question_id);
    const nextToken = `${runId}:${nextIndex}:${nextId}`;
    activeSubjectRef.current = {
      id: nextId,
      token: nextToken,
      prompt: nextPresentation.prompt,
      boundary: nextPresentation.boundary,
    };
    setIndex(nextIndex);
    setCombinedAnswer("");
    setClarificationCount(0);
    storeInterpretation(null);
    setConversationReply("");
    setStatus("Answer in your own words.");
    const nextWords = `${conversationalTransition(undefined, nextIndex)} ${nextPresentation.prompt}`;
    if (embeddedFlightDeck) {
      postToFlightDeck({
        type: "BUILDOS_AUTOPSY_EVENT",
        event: "speak",
        text: nextWords,
        subjectId: nextId,
        subjectToken: nextToken,
      });
    } else {
      void speak(nextWords);
    }
  };

  const interpret = async (rawAnswer: string) => {
    const text = rawAnswer.trim();
    const lockedSubject = activeSubjectRef.current;
    if (!text || !currentQuestion || !lockedSubject.id || busy) return;
    setBusy(true);
    setError("");
    const candidateAnswer = combinedAnswer ? `${combinedAnswer}\nClarification: ${text}` : text;
    const questionId = lockedSubject.id;
    const subjectToken = lockedSubject.token;
    try {
      const options = (currentQuestion.options ?? []).map(normaliseOption);
      const response = await fetch("/api/autopsy-assessment-turn", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          question_id: questionId,
          subject_code: currentQuestion.q_id,
          subject_token: subjectToken,
          prompt: lockedSubject.prompt,
          subject_boundary: lockedSubject.boundary,
          answer: text,
          accumulated_answer: candidateAnswer,
          options,
          clarification: interpretation?.clarifying_question ?? null,
          clarification_count: clarificationCount,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "John could not interpret that answer.");
      const next = payload as Interpretation;
      if (
        String(next.question_id ?? "") !== questionId ||
        next.subject_token !== subjectToken ||
        activeSubjectRef.current.token !== subjectToken
      ) {
        storeInterpretation(null);
        setConversationReply("");
        setCombinedAnswer("");
        const recovery = `I lost our place. Let me return to the subject we were discussing. ${activeSubjectRef.current.prompt}`;
        if (embeddedFlightDeck) {
          postToFlightDeck({
            type: "BUILDOS_AUTOPSY_EVENT",
            event: "speak",
            text: recovery,
            subjectId: activeSubjectRef.current.id,
            subjectToken: activeSubjectRef.current.token,
          });
        } else {
          void speak(recovery);
        }
        throw new Error("The conversation returned to the current subject before saving anything.");
      }
      setAnswer("");
      if (!["answer", "correction"].includes(next.turn_type)) {
        const reply = next.conversation_reply?.trim() ||
          (next.turn_type === "repeat_request"
            ? `Of course. ${lockedSubject.prompt}`
            : `Let us return to this subject. ${lockedSubject.prompt}`);
        setConversationReply(reply);
        storeInterpretation(null);
        setStatus("The current subject is still open.");
        if (embeddedFlightDeck) {
          postToFlightDeck({
            type: "BUILDOS_AUTOPSY_EVENT",
            event: "speak",
            text: reply,
            subjectId: lockedSubject.id,
            subjectToken,
          });
        } else {
          void speak(reply);
        }
        return;
      }
      setConversationReply("");
      setCombinedAnswer(candidateAnswer);
      if (next.selected_option_id && !next.clarifying_question) {
        storeInterpretation(null);
        setStatus("John has understood. Moving to the next subject…");
        await saveSelectionAndAdvance(next);
      } else {
        storeInterpretation(next);
        setClarificationCount((count) => Math.min(2, count + 1));
        const words = next.clarifying_question || "Could you tell me a little more about that?";
        setStatus("John needs one point clarified before anything is saved.");
        if (embeddedFlightDeck) {
          postToFlightDeck({
            type: "BUILDOS_AUTOPSY_EVENT",
            event: "speak",
            text: words,
            subjectId: questionId,
            subjectToken,
          });
        } else {
          void speak(words);
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That answer could not be interpreted.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    const confirmedInterpretation = interpretationRef.current ?? interpretation;
    if (
      !runId ||
      !currentQuestion ||
      !confirmedInterpretation?.selected_option_id ||
      confirmedInterpretation.question_id !== String(currentQuestion.question_id) ||
      busy ||
      confirmationSavingRef.current
    ) return;
    confirmationSavingRef.current = true;
    setBusy(true);
    setError("");
    try {
      await saveSelectionAndAdvance(confirmedInterpretation);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That answer could not be saved.");
    } finally {
      confirmationSavingRef.current = false;
      setBusy(false);
    }
  };

  const correct = () => {
    storeInterpretation(null);
    setConversationReply("");
    setCombinedAnswer("");
    setClarificationCount(0);
    setAnswer("");
    setStatus("No problem. Say it again in your own words.");
    if (embeddedFlightDeck) {
      postToFlightDeck({
        type: "BUILDOS_AUTOPSY_EVENT",
        event: "speak",
        text: "No problem. Say it again in your own words.",
      });
    } else {
      void speak("No problem. Say it again in your own words.");
    }
  };

  const startListening = () => {
    if (!recognitionConstructor || listening || speaking || busy) return;
    const recognition = new recognitionConstructor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-AU";
    transcriptRef.current = "";
    recognition.onstart = () => {
      setLastInputMode("voice");
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

  const handleSpokenTurn = (text: string) => {
    const normalised = text
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const awaitingConfirmation =
      Boolean(interpretationRef.current?.selected_option_id) &&
      !interpretationRef.current?.clarifying_question;

    if (!awaitingConfirmation) {
      void interpret(text);
      return;
    }
    if (/^(yes|yeah|yep|correct|exactly|right|definitely|absolutely|certainly|affirmative|spot on|one hundred percent|100 percent|thats right|that is right|thats cool|that is cool|sounds right|sounds good|thats fine|that is fine|all good|you got it)\b/.test(normalised)) {
      void confirm();
      return;
    }
    if (/^(no|nope|not quite|thats not right|that is not right)\b/.test(normalised)) {
      correct();
      return;
    }
    void interpret(text);
  };

  startListeningRef.current = startListening;
  handleSpokenTurnRef.current = handleSpokenTurn;

  useEffect(() => {
    if (!embeddedFlightDeck) return;
    const receiveFlightDeckAnswer = (event: MessageEvent<unknown>) => {
      if (!isFlightDeckInput(event)) return;
      if (busy) return;
      const text = event.data.text.trim();
      if (!text) return;
      if (
        (event.data.subjectId && event.data.subjectId !== activeSubjectRef.current.id) ||
        (event.data.subjectToken && event.data.subjectToken !== activeSubjectRef.current.token)
      ) {
        const recovery = `I lost our place. Let me return to the subject we were discussing. ${activeSubjectRef.current.prompt}`;
        postToFlightDeck({
          type: "BUILDOS_AUTOPSY_EVENT",
          event: "speak",
          text: recovery,
          subjectId: activeSubjectRef.current.id,
          subjectToken: activeSubjectRef.current.token,
        });
        return;
      }
      setAnswer(text);
      const inputMode = event.data.inputMode === "text" ? "text" : "voice";
      setLastInputMode(inputMode);
      setStatus("John is considering what you said…");
      handleSpokenTurnRef.current?.(text);
    };
    window.addEventListener("message", receiveFlightDeckAnswer);
    return () => window.removeEventListener("message", receiveFlightDeckAnswer);
  }, [busy, embeddedFlightDeck]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setLastInputMode("text");
    void interpret(answer);
  };

  if (error && !questions.length) {
    return <main className="min-h-screen bg-[#06111c] p-8 text-[#edf8fb]"><div className="mx-auto max-w-xl border border-[#1c3547] bg-[#091925] p-8"><h1 className="text-2xl font-semibold">Autopsy could not start</h1><p className="mt-3 text-[#9aafbd]">{error}</p></div></main>;
  }

  return (
    <main
      className={cn(
        "relative overflow-x-hidden bg-[#06111c] text-[#edf8fb]",
        embeddedFlightDeck
          ? "min-h-0 p-0"
          : "min-h-screen px-4 pb-10 pt-20 sm:px-8",
      )}
      style={{
        backgroundImage:
          "linear-gradient(rgba(56,170,250,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(56,170,250,.05) 1px,transparent 1px)",
        backgroundSize: "70px 70px",
      }}
    >
      {!embeddedFlightDeck ? (
        <>
          <div className="absolute inset-x-0 top-14 h-px bg-gradient-to-r from-transparent via-[#38aafa] to-transparent shadow-[0_0_20px_#38aafa]" />
          <nav className="relative mx-auto flex max-w-7xl items-center gap-4 font-mono text-[10px] tracking-[0.16em] text-[#556c7c]">
            <span className="text-[#b78525]">LANDING</span><i className="h-px w-14 bg-[#1c3547]" />
            <span className="text-[#38aafa]">AUTOPSY</span><i className="h-px w-14 bg-[#1c3547]" />
            <span>5JD</span><i className="h-px w-14 bg-[#1c3547]" /><span>CORE</span>
          </nav>
        </>
      ) : null}

      <section
        className={cn(
          "relative mx-auto grid max-w-7xl border border-[#1c3547] bg-[#091925]/95 lg:grid-cols-[34%_66%]",
          embeddedFlightDeck ? "min-h-[610px]" : "mt-10 min-h-[690px]",
        )}
      >
        <aside className={cn(
          "flex min-h-[240px] flex-col border-b border-[#1c3547] p-8 lg:border-b-0 lg:border-r",
          embeddedFlightDeck ? "lg:p-9" : "lg:p-14",
        )}>
          <p className="text-[10px] font-bold tracking-[0.2em] text-[#b78525]">AUTOPSY · TEST CONVERSATION</p>
          <blockquote className="my-auto font-serif text-2xl leading-snug text-[#dce8ec] xl:text-3xl">
            “Speak naturally. John will listen, clarify and keep the twelve subjects in the background.”
          </blockquote>
          <small className="text-sm leading-6 text-[#718796]">
            John keeps the twelve subjects in order. The analysis stays quietly in the background.
          </small>
        </aside>

        <article className={cn(
          "flex min-h-[560px] flex-col overflow-y-auto p-8",
          embeddedFlightDeck ? "max-h-[610px] lg:p-9" : "lg:min-h-[650px] lg:p-14",
        )}>
          <header className="flex items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <i className="grid h-12 w-12 place-items-center rounded-full border border-[#38aafa] not-italic text-[#38aafa] shadow-[0_0_28px_rgba(56,170,250,.18)]">J</i>
              <p className="text-[11px] font-bold tracking-[0.18em]">JOHN<small className="mt-1 block font-normal text-[#7f95a7]">Autopsy · listening and guiding</small></p>
            </div>
            <span className="font-mono text-xs text-[#7f95a7]">{questions.length ? `${index + 1} OF 12` : "PREPARING"}</span>
          </header>

          <div className="mt-8">
            <p className="text-[10px] font-bold tracking-[0.2em] text-[#54c5ff]">CURRENT SUBJECT</p>
            <h1 className="mt-4 max-w-4xl font-serif text-3xl font-normal leading-[1.12] tracking-[-0.03em] text-[#edf8fb] sm:text-4xl xl:text-[2.75rem]">
              {currentPrompt || status}
            </h1>
          </div>

          {interpretation?.clarifying_question && lastInputMode === "text" ? (
            <div className="mt-6 border border-[#24475e] bg-[#0d2637] p-5">
              <p className="text-lg leading-8 text-[#dce8ec]">{interpretation.clarifying_question}</p>
            </div>
          ) : null}

          {conversationReply && !interpretation ? (
            <div className="mt-6 border-l-2 border-[#38aafa] bg-[#0d2637] px-5 py-4">
              <p className="text-base leading-7 text-[#dce8ec]">{conversationReply}</p>
            </div>
          ) : null}

          {!embeddedFlightDeck && (!interpretation || interpretation.clarifying_question) ? (
            <form onSubmit={submit} className="mt-auto pt-6">
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
                {!embeddedFlightDeck ? (
                  <button type="button" onClick={listening ? () => recognitionRef.current?.stop() : startListening} disabled={busy || speaking || !recognitionConstructor} className="bg-[#145ee7] px-6 py-3 text-sm font-bold text-white disabled:opacity-40">
                    {listening ? "FINISH ANSWER" : "USE MICROPHONE"}
                  </button>
                ) : null}
                <button type="submit" disabled={busy || listening || !answer.trim()} className="border border-[#38aafa] px-6 py-3 text-sm font-bold text-[#edf8fb] disabled:opacity-30">CONTINUE</button>
                {!embeddedFlightDeck ? (
                  <button type="button" onClick={() => void speak(lastSpokenTextRef.current || currentPrompt)} disabled={busy || speaking || !lastSpokenTextRef.current} className="ml-auto border-0 bg-transparent text-xs font-bold tracking-[0.12em] text-[#7f95a7] disabled:opacity-30">HEAR JOHN AGAIN</button>
                ) : null}
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

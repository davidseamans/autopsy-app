import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type StageOption = { value: string; label: string; helper: string };
type ExperienceOption = { value: string; label: string };
type DbQuestion = { id: string; q_id: string; prompt: string | null; sequence: number | null };
type DbVariant = {
  question_id: string;
  stage_code: string;
  conversational_prompt: string;
  follow_up_text: string | null;
};
type ConversationQuestion = {
  id: string;
  qid: string;
  prompt: string;
  clarification: string;
  reflection: string;
  transition: string;
};
type Message = {
  id: string;
  speaker: "john" | "candidate" | "system";
  text: string;
};

type Phase = "context" | "conversation" | "complete";
type ResponseState = "primary" | "clarifying" | "reflecting";

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

const behaviourByQid: Record<string, Pick<ConversationQuestion, "clarification" | "reflection" | "transition">> = {
  CR_01: {
    clarification: "Let me make that more concrete. If the business paid you nothing for longer than expected, what would keep your household and the business afloat?",
    reflection: "So the real issue is not optimism. It is how much pressure you can absorb before your decisions start being driven by fear. Does that fairly describe it?",
    transition: "That gives me a clearer view of the pressure around you. Let us look at what the business would actually need to begin safely.",
  },
  CR_02: {
    clarification: "Strip away the wishlist. What are the few things you must have before you can operate without creating an avoidable mess?",
    reflection: "You appear to distinguish between what would be useful and what is genuinely necessary. Is that how you see it?",
    transition: "Good. Now I want to understand how you think about money once it starts moving through the business.",
  },
  EL_01: {
    clarification: "Suppose a customer pays you $1,000 today. What parts of that money are already committed before you can treat any of it as yours?",
    reflection: "What I hear is that cash in the account and money available to spend are not the same thing. Is that your view?",
    transition: "That distinction matters. The next question is about the costs that can quietly destroy it.",
  },
  EL_02: {
    clarification: "Which expenses are easiest to overlook because they arrive later, vary from job to job, or do not feel urgent today?",
    reflection: "You are identifying the costs that do not announce themselves until the margin has already disappeared. Have I understood you correctly?",
    transition: "Now let us leave the spreadsheet and look at the customer.",
  },
  MR_02: {
    clarification: "Describe one real person or business. What are they trying to get rid of, fix, avoid, or achieve by paying you?",
    reflection: "So the value is not the service itself. It is the problem the customer no longer has to carry. Is that accurate?",
    transition: "That tells me who you believe the customer is. Now I want to know what reality has confirmed.",
  },
  MR_01: {
    clarification: "What has a real customer actually done—paid, booked, returned, referred, signed, or changed behaviour—that you can point to?",
    reflection: "You are separating encouragement from evidence. The useful part is what people did, not what they said. Fair?",
    transition: "Good. Demand is only half the question. The other half is whether you can deliver what you promise.",
  },
  OP_01: {
    clarification: "Think about an ordinary week, not your best day. What makes you confident the required standard can be delivered repeatedly?",
    reflection: "Your answer depends less on personal effort at the last minute and more on a reliable way of working. Is that true?",
    transition: "Let us test how much of that reliability exists outside your head.",
  },
  OP_02: {
    clarification: "Could another capable person follow the work from your instructions and produce roughly the same result? What would still be missing?",
    reflection: "It sounds as though some of the method is repeatable, while some still depends on memory or judgement that has not been captured. Is that fair?",
    transition: "That tells me about the operating method. Now I want to look at what you have actually done.",
  },
  EX_01: {
    clarification: "What action put your idea in contact with reality and produced information you did not have before?",
    reflection: "The important distinction is between thinking about the work and doing something that could prove you wrong. Is that what happened?",
    transition: "One action can produce evidence. The next question is whether there is a rhythm behind it.",
  },
  EX_02: {
    clarification: "Look at your real calendar. What time can you protect during the next month without relying on motivation or spare time appearing?",
    reflection: "You are naming time that already has a place, rather than making a promise that competes with everything else. Correct?",
    transition: "That gives me the structure. The last part is how that structure behaves when the work becomes uncomfortable.",
  },
  PR_01: {
    clarification: "Tell me about a time when progress slowed or the evidence disappointed you. What did you do next?",
    reflection: "The pattern I am listening for is whether uncertainty makes you investigate and adjust, or abandon the direction before you learn from it. Does that distinction fit?",
    transition: "That helps. One final question: not what you intend to do, but what tends to happen when energy and confidence are low.",
  },
  PR_02: {
    clarification: "When you are tired, unsure, or seeing slow results, what important work do you still complete—and what usually slips?",
    reflection: "So consistency is not absolute. The useful evidence is which commitments survive discomfort and which do not. Is that a fair reading?",
    transition: "Thank you. I understand more than I did when we began, and I also know where the evidence is still incomplete.",
  },
};

const makeMessage = (speaker: Message["speaker"], text: string): Message => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  speaker,
  text,
});

const FirstConversation = () => {
  const [stageOptions, setStageOptions] = useState<StageOption[]>(fallbackStages);
  const [experienceOptions, setExperienceOptions] = useState<ExperienceOption[]>(fallbackExperiences);
  const [stage, setStage] = useState("startup");
  const [experience, setExperience] = useState("never");
  const [industry, setIndustry] = useState("");
  const [questions, setQuestions] = useState<DbQuestion[]>([]);
  const [variants, setVariants] = useState<DbVariant[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("context");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [responseState, setResponseState] = useState<ResponseState>("primary");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [paused, setPaused] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [stagesResult, experienceResult, questionsResult, variantsResult] = await Promise.all([
        supabase.from("autopsy_context_stage_options").select("code,label,description,display_order").eq("is_active", true).order("display_order"),
        supabase.from("autopsy_context_experience_options").select("code,label,display_order").eq("is_active", true).order("display_order"),
        supabase.from("questions").select("id,q_id,prompt,sequence").eq("is_active", true).order("sequence"),
        supabase
          .from("autopsy_dimension_conversation_variants")
          .select("question_id,stage_code,conversational_prompt,follow_up_text")
          .eq("is_active", true)
          .eq("variant_role", "candidate_conversation")
          .eq("version", "stage0_v1"),
      ]);

      const error = stagesResult.error ?? experienceResult.error ?? questionsResult.error ?? variantsResult.error;
      if (cancelled) return;
      if (error) {
        setLoadError(error.message);
        return;
      }

      const liveStages = (stagesResult.data ?? []).map((item) => ({ value: item.code, label: item.label, helper: item.description }));
      const liveExperiences = (experienceResult.data ?? []).map((item) => ({ value: item.code, label: item.label }));
      if (liveStages.length) setStageOptions(liveStages);
      if (liveExperiences.length) setExperienceOptions(liveExperiences);
      setQuestions((questionsResult.data ?? []) as DbQuestion[]);
      setVariants((variantsResult.data ?? []) as DbVariant[]);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const conversationQuestions = useMemo<ConversationQuestion[]>(() => {
    const variantMap = new Map(
      variants.filter((variant) => variant.stage_code === stage).map((variant) => [variant.question_id, variant]),
    );
    return questions.map((question) => {
      const behaviour = behaviourByQid[question.q_id] ?? {
        clarification: "Could you make that more concrete with an example from your own situation?",
        reflection: "Let me check that I have understood you fairly. Is that an accurate description?",
        transition: "Thank you. Let us look at the next part.",
      };
      const variant = variantMap.get(question.id);
      return {
        id: question.id,
        qid: question.q_id,
        prompt: variant?.conversational_prompt ?? question.prompt ?? "Tell me what is true in your situation today.",
        clarification: behaviour.clarification,
        reflection: behaviour.reflection,
        transition: behaviour.transition,
      };
    });
  }, [questions, stage, variants]);

  const currentQuestion = conversationQuestions[questionIndex];

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const startConversation = () => {
    if (!conversationQuestions.length) return;
    const stageLabel = stageOptions.find((item) => item.value === stage)?.label ?? "your business";
    const experienceLabel = experienceOptions.find((item) => item.value === experience)?.label ?? "your experience";
    setMessages([
      makeMessage("john", "Let us keep this simple. This is a conversation, not an examination. You may pause, decline, correct me, or ask me to put a question differently."),
      makeMessage("john", `I understand that we are talking about ${stageLabel.toLowerCase()}${industry.trim() ? ` in ${industry.trim()}` : ""}, and that ${experienceLabel.toLowerCase()}`),
      makeMessage("john", conversationQuestions[0].prompt),
    ]);
    setPhase("conversation");
    setResponseState("primary");
  };

  const advance = () => {
    if (!currentQuestion) return;
    const isLast = questionIndex >= conversationQuestions.length - 1;
    setMessages((current) => [...current, makeMessage("john", currentQuestion.transition)]);
    if (isLast) {
      setMessages((current) => [
        ...current,
        makeMessage("john", "I am not going to manufacture certainty from a first conversation. I understand a little more about where you are trying to go. Some things are clear; others would need more evidence before any responsible conclusion."),
        makeMessage("john", "For now, tell me this: did the conversation help you notice anything you had not stated clearly before?"),
      ]);
      setPhase("complete");
      return;
    }
    const nextIndex = questionIndex + 1;
    setQuestionIndex(nextIndex);
    setResponseState("primary");
    setMessages((current) => [...current, makeMessage("john", conversationQuestions[nextIndex].prompt)]);
  };

  const submitResponse = (event: FormEvent) => {
    event.preventDefault();
    const response = draft.trim();
    if (!response || paused || !currentQuestion) return;
    setDraft("");
    setMessages((current) => [...current, makeMessage("candidate", response)]);

    if (responseState === "primary") {
      if (response.length < 24 || /^(yes|no|maybe|not sure|i don't know|dont know)$/i.test(response)) {
        setResponseState("clarifying");
        setMessages((current) => [...current, makeMessage("john", currentQuestion.clarification)]);
      } else {
        setResponseState("reflecting");
        setMessages((current) => [...current, makeMessage("john", currentQuestion.reflection)]);
      }
      return;
    }

    advance();
  };

  const rephrase = () => {
    if (!currentQuestion) return;
    setResponseState("clarifying");
    setMessages((current) => [...current, makeMessage("candidate", "Could you put that another way?"), makeMessage("john", currentQuestion.clarification)]);
  };

  const decline = () => {
    if (!currentQuestion) return;
    setMessages((current) => [
      ...current,
      makeMessage("candidate", "I would rather not answer that now."),
      makeMessage("john", "That is your decision. I will not force an answer or treat the pause as a personal failure."),
    ]);
    advance();
  };

  const restart = () => {
    setPhase("context");
    setQuestionIndex(0);
    setResponseState("primary");
    setMessages([]);
    setDraft("");
    setPaused(false);
  };

  return (
    <main className="min-h-screen bg-[#f4efe6] px-4 py-6 text-[#211f1b] sm:px-6 sm:py-10">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] border border-[#d9cbb8] bg-[#fffdf8] shadow-2xl shadow-[#4e3f2d]/10">
        <header className="flex items-center justify-between gap-4 border-b border-[#e5dbcc] px-5 py-4 sm:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8a6335]">Autopsy</p>
            <h1 className="mt-1 text-lg font-semibold sm:text-xl">A conversation with John Galt</h1>
          </div>
          {phase !== "context" ? (
            <button
              type="button"
              onClick={() => setPaused((value) => !value)}
              className="rounded-full border border-[#cdbb9f] px-4 py-2 text-sm font-semibold transition hover:bg-[#f5ede1]"
            >
              {paused ? "Resume" : "Pause"}
            </button>
          ) : null}
        </header>

        {phase === "context" ? (
          <section className="flex flex-1 items-center px-5 py-8 sm:px-10 sm:py-12">
            <div className="mx-auto w-full max-w-2xl">
              <p className="text-sm font-semibold text-[#8a6335]">Before we begin</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Give me enough context to ask the questions properly.</h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-[#685f52]">This is a role-play prototype. Nothing here changes the scoring engine, creates a verdict, or adds assessment questions.</p>

              <div className="mt-8 space-y-7">
                <div>
                  <p className="text-sm font-semibold">What situation are we discussing?</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {stageOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setStage(option.value)}
                        className={`rounded-2xl border p-4 text-left transition ${stage === option.value ? "border-[#8a6335] bg-[#f2e6d4]" : "border-[#ddd0bf] bg-white hover:bg-[#faf5ed]"}`}
                      >
                        <span className="block font-semibold">{option.label}</span>
                        <span className="mt-1 block text-sm leading-5 text-[#756b5d]">{option.helper}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block">
                  <span className="text-sm font-semibold">What kind of business?</span>
                  <input
                    value={industry}
                    onChange={(event) => setIndustry(event.target.value)}
                    placeholder="Cleaning, bookkeeping, café, consulting..."
                    className="mt-3 w-full rounded-2xl border border-[#ddd0bf] bg-white px-4 py-3 outline-none transition focus:border-[#8a6335]"
                  />
                </label>

                <div>
                  <p className="text-sm font-semibold">What experience are you bringing?</p>
                  <div className="mt-3 space-y-2">
                    {experienceOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setExperience(option.value)}
                        className={`w-full rounded-2xl border p-4 text-left text-sm transition ${experience === option.value ? "border-[#8a6335] bg-[#f2e6d4]" : "border-[#ddd0bf] bg-white hover:bg-[#faf5ed]"}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {loadError ? <p className="mt-5 rounded-2xl bg-[#fff0ed] p-4 text-sm text-[#8f2f24]">The production questions could not be loaded: {loadError}</p> : null}

              <button
                type="button"
                onClick={startConversation}
                disabled={!conversationQuestions.length}
                className="mt-8 rounded-full bg-[#2b2823] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#403b34] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {conversationQuestions.length ? "Begin the conversation" : "Loading the conversation…"}
              </button>
            </div>
          </section>
        ) : (
          <>
            <section className="flex-1 overflow-y-auto px-5 py-6 sm:px-10 sm:py-8">
              <div className="mx-auto max-w-2xl space-y-5">
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.speaker === "candidate" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[88%] rounded-3xl px-5 py-4 text-[15px] leading-7 sm:text-base ${
                        message.speaker === "candidate"
                          ? "rounded-br-md bg-[#2b2823] text-white"
                          : message.speaker === "system"
                            ? "bg-[#f3eee6] text-[#6d6356]"
                            : "rounded-bl-md border border-[#e1d5c5] bg-white text-[#302c26] shadow-sm"
                      }`}
                    >
                      {message.speaker === "john" ? <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#9a7041]">John</p> : null}
                      <p>{message.text}</p>
                    </div>
                  </div>
                ))}
                {paused ? <div className="rounded-2xl bg-[#f3eee6] p-4 text-center text-sm text-[#6d6356]">Conversation paused. Nothing advances until you resume.</div> : null}
                <div ref={transcriptEndRef} />
              </div>
            </section>

            <footer className="border-t border-[#e5dbcc] bg-[#fffaf3] px-5 py-4 sm:px-8 sm:py-5">
              <div className="mx-auto max-w-2xl">
                {phase === "complete" ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-[#6d6356]">Prototype conversation complete. No score or verdict has been created.</p>
                    <button type="button" onClick={restart} className="rounded-full border border-[#bfa985] px-4 py-2 text-sm font-semibold hover:bg-white">Start again</button>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 flex flex-wrap gap-2">
                      <button type="button" onClick={rephrase} disabled={paused} className="rounded-full border border-[#d5c6b1] bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-45">Put that another way</button>
                      <button type="button" onClick={() => setDraft("I am not sure yet.")} disabled={paused} className="rounded-full border border-[#d5c6b1] bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-45">I’m not sure</button>
                      <button type="button" onClick={decline} disabled={paused} className="rounded-full border border-[#d5c6b1] bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-45">Rather not answer now</button>
                    </div>
                    <form onSubmit={submitResponse} className="flex items-end gap-3">
                      <textarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        disabled={paused}
                        rows={2}
                        placeholder="Answer in your own words…"
                        className="min-h-[58px] flex-1 resize-none rounded-2xl border border-[#d5c6b1] bg-white px-4 py-3 text-base outline-none transition focus:border-[#8a6335] disabled:opacity-55"
                      />
                      <button type="submit" disabled={paused || !draft.trim()} className="rounded-full bg-[#2b2823] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#403b34] disabled:cursor-not-allowed disabled:opacity-40">Send</button>
                    </form>
                  </>
                )}
              </div>
            </footer>
          </>
        )}
      </section>
    </main>
  );
};

export default FirstConversation;

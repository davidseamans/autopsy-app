import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import {
  createAutopsyRun,
  extractRunId,
  finalizeAutopsyRun,
  recordAutopsyAnswer,
} from "@/components/autopsy/rpc";

type BusinessStage = string;
type ExperienceLevel = string;

type StageOption = {
  value: BusinessStage;
  label: string;
  helper: string;
};

type ExperienceOption = {
  value: ExperienceLevel;
  label: string;
};

type AnswerOption = {
  id?: string | number;
  score: 0 | 1 | 2 | 3;
  label: string;
};

type ConversationDimension = {
  id?: string;
  qid: string;
  canonicalDimension: string;
  canonicalPrompt: string;
  prompt: string;
  followUp: string;
  guardrail?: string | null;
  options: AnswerOption[];
};

type ConversationGroup = {
  id: string;
  title: string;
  bridge: string;
  dimensions: ConversationDimension[];
};

type Answers = Record<string, number>;
type SelectedOptions = Record<string, string | number>;
type LoadState = "loading" | "live" | "fallback";
type RunState = "not_started" | "creating" | "live" | "saving" | "finalising" | "finalised" | "local_only" | "error";

type DbQuestion = {
  id: string;
  q_id: string;
  prompt: string | null;
  dimension_code: string | null;
  sequence: number | null;
};

type DbAnswerOption = {
  id: string | number;
  question_id: string;
  score_value: number;
  label: string;
};

type DbVariant = {
  question_id: string;
  stage_code: string;
  conversational_prompt: string;
  follow_up_text: string | null;
  guardrail_text: string | null;
};

const fallbackStages: StageOption[] = [
  { value: "startup", label: "Startup", helper: "Starting from scratch." },
  { value: "acquisition", label: "Acquisition", helper: "Buying an existing business." },
  { value: "franchise", label: "Franchise", helper: "Buying into a franchise system." },
  { value: "existing", label: "Existing business", helper: "Already operating and looking at maturity." },
];

const fallbackExperienceLevels: ExperienceOption[] = [
  { value: "never", label: "I have never owned or run a business before." },
  { value: "some", label: "I have some business or management experience." },
  { value: "experienced", label: "I have owned, run, or led businesses before." },
];

const dimensionNames: Record<string, string> = {
  CR_01: "Cash runway",
  CR_02: "Minimum resources",
  EL_01: "Economic literacy",
  EL_02: "Cost driver awareness",
  MR_01: "Evidence before commitment",
  MR_02: "Customer clarity",
  OP_01: "Consistent delivery capability",
  OP_02: "Repeatable process",
  EX_01: "Concrete action",
  EX_02: "Execution rhythm",
  PR_01: "Persistence under uncertainty",
  PR_02: "Consistency under discomfort",
};

const groupDefinitions: Omit<ConversationGroup, "dimensions">[] = [
  {
    id: "money",
    title: "Money reality",
    bridge: "Let’s start with the part that usually exposes maturity first: cash pressure and economic literacy.",
  },
  {
    id: "market",
    title: "Customer reality",
    bridge: "Now we test whether the candidate can separate evidence from optimism.",
  },
  {
    id: "delivery",
    title: "Delivery reality",
    bridge: "Now test whether the candidate can deliver consistently, not just once on a good day.",
  },
  {
    id: "execution",
    title: "Execution reality",
    bridge: "Now stop listening to the story and look at behaviour. What has the candidate actually done?",
  },
  {
    id: "resilience",
    title: "Founder reality",
    bridge: "Last pass: the human operator. This is not motivation theatre. It is whether the work survives pressure.",
  },
];

const fallbackDimensions: ConversationDimension[] = [
  {
    qid: "CR_01",
    canonicalDimension: "Cash runway",
    canonicalPrompt: "Have you estimated how long you can operate without income?",
    prompt: "If this takes longer than you hope to start paying you, how long can you personally carry it?",
    followUp: "This tests whether you understand cash pressure.",
    guardrail: "Do not assess whether the business idea is good.",
    options: [
      { score: 0, label: "I do not know how long I can last without income." },
      { score: 1, label: "I have a rough idea, but no written cash runway." },
      { score: 2, label: "I have estimated my runway, but some costs are still uncertain." },
      { score: 3, label: "I know my cash runway and can show the numbers." },
    ],
  },
  {
    qid: "CR_02",
    canonicalDimension: "Minimum resources",
    canonicalPrompt: "Do you know the minimum resources required to start?",
    prompt: "What is the bare minimum you need to start safely — cash, tools, supplies, labour, and time?",
    followUp: "No wishlist. Minimum viable reality only.",
    guardrail: "Do not assess whether the business idea is good.",
    options: [
      { score: 0, label: "I do not know what I need to start safely." },
      { score: 1, label: "I know the obvious items, but I have not costed them properly." },
      { score: 2, label: "I have listed the main startup costs, but there may be gaps." },
      { score: 3, label: "I know the minimum tools, supplies, setup costs, and cash needed to start." },
    ],
  },
  {
    qid: "EL_01",
    canonicalDimension: "Economic literacy",
    canonicalPrompt: "Can you clearly explain how this business makes money?",
    prompt: "When money comes in, do you know what part is actually yours to spend?",
    followUp: "Money received today is not automatically money you can spend today.",
    guardrail: "Do not ask whether the idea is good.",
    options: [
      { score: 0, label: "If I get paid today, I can spend it today." },
      { score: 1, label: "I know some money must be kept aside, but I have not worked it out." },
      { score: 2, label: "I usually set money aside, but future payments still catch me." },
      { score: 3, label: "I know what must be kept aside before anything is mine to spend." },
    ],
  },
  {
    qid: "EL_02",
    canonicalDimension: "Cost driver awareness",
    canonicalPrompt: "Have you identified your main cost drivers?",
    prompt: "What costs will quietly eat the money if you forget them?",
    followUp: "This tests whether you can see margin pressure before it bites.",
    guardrail: "Do not assess whether the business idea is good.",
    options: [
      { score: 0, label: "I have not identified the main costs." },
      { score: 1, label: "I know some costs, but I am probably missing important ones." },
      { score: 2, label: "I have listed the main costs, but I have not tested them properly." },
      { score: 3, label: "I know the main costs and how they affect what I keep." },
    ],
  },
  {
    qid: "MR_02",
    canonicalDimension: "Customer clarity",
    canonicalPrompt: "Have you clearly defined your target customer?",
    prompt: "Who is the customer, what problem are they trying to remove, and why would this offer matter to them?",
    followUp: "This is not a market-size test. It is a clarity test.",
    guardrail: "Do not assess industry attractiveness.",
    options: [
      { score: 0, label: "I do not know exactly who the customer is." },
      { score: 1, label: "I have a broad customer type, but it is still vague." },
      { score: 2, label: "I know the likely customer, but I have not tested it properly." },
      { score: 3, label: "I can clearly name the customer, problem, offer, and buying reason." },
    ],
  },
  {
    qid: "MR_01",
    canonicalDimension: "Evidence before commitment",
    canonicalPrompt: "What evidence do you have that customers will pay for this?",
    prompt: "What has a real customer already done that counts as evidence, not encouragement?",
    followUp: "Compliments are not proof. Behaviour is proof.",
    guardrail: "Do not assess whether the business idea is good.",
    options: [
      { score: 0, label: "I have no evidence that anyone will pay." },
      { score: 1, label: "People have said it sounds good, but no one has paid or committed." },
      { score: 2, label: "I have some signs of demand, but not enough paid proof yet." },
      { score: 3, label: "I have real payment, commitment, or strong proof customers will pay." },
    ],
  },
  {
    qid: "OP_01",
    canonicalDimension: "Consistent delivery capability",
    canonicalPrompt: "Do you have the operational ability to deliver your product or service consistently?",
    prompt: "Can you actually deliver this consistently to the required standard?",
    followUp: "Repeatability is the maturity test.",
    guardrail: "Do not assess whether the business idea is good.",
    options: [
      { score: 0, label: "I cannot reliably deliver the service yet." },
      { score: 1, label: "I can probably do the work myself, but delivery would be inconsistent." },
      { score: 2, label: "I can deliver the work, but quality or timing still depends too much on me." },
      { score: 3, label: "I can deliver the service consistently to the required standard." },
    ],
  },
  {
    qid: "OP_02",
    canonicalDimension: "Repeatable process",
    canonicalPrompt: "Can you write down the steps, tools, and supplies needed to do the job the same way each time?",
    prompt: "Could the work be written down well enough to repeat the job the same way next time?",
    followUp: "This is where a bought job starts becoming a business system.",
    guardrail: "Do not assess whether the business idea is good.",
    options: [
      { score: 0, label: "No - I work it out as I go." },
      { score: 1, label: "Partly - I know the main steps, but it is not written down." },
      { score: 2, label: "Mostly - I have the steps and supplies listed, but it still needs testing." },
      { score: 3, label: "Yes - the steps, tools, and supplies are written down and repeatable." },
    ],
  },
  {
    qid: "EX_01",
    canonicalDimension: "Concrete action",
    canonicalPrompt: "Have you taken any concrete action toward this business?",
    prompt: "What concrete action have you already taken that produced evidence?",
    followUp: "Thinking and research may help, but they are not the same as contact with reality.",
    guardrail: "Do not assess whether the business idea is good.",
    options: [
      { score: 0, label: "I have not taken any real action yet." },
      { score: 1, label: "I have done thinking or research, but little real-world action." },
      { score: 2, label: "I have taken some action, but it has not produced clear evidence yet." },
      { score: 3, label: "I have taken concrete action that produced evidence I can review." },
    ],
  },
  {
    qid: "EX_02",
    canonicalDimension: "Execution rhythm",
    canonicalPrompt: "Can you commit consistent time to this for the next 30 days?",
    prompt: "For the next 30 days, what time can you protect for this without pretending?",
    followUp: "A vague intention does not count as an execution rhythm.",
    guardrail: "Do not assess whether the business idea is good.",
    options: [
      { score: 0, label: "I cannot commit regular time for the next 30 days." },
      { score: 1, label: "I might find time, but I do not have a reliable schedule." },
      { score: 2, label: "I have time set aside, but I have not proven I will protect it." },
      { score: 3, label: "I have a realistic 30-day work rhythm I can protect and follow." },
    ],
  },
  {
    qid: "PR_01",
    canonicalDimension: "Persistence under uncertainty",
    canonicalPrompt: "Are you prepared to persist through uncertainty and repeated failure without changing direction prematurely?",
    prompt: "When it gets uncertain or disappointing, are you likely to learn and persist, or keep changing direction?",
    followUp: "The point is not toughness. The point is whether the work survives discomfort.",
    guardrail: "Do not assess whether the business idea is good.",
    options: [
      { score: 0, label: "I am likely to stop or change direction when things get hard." },
      { score: 1, label: "I can handle some uncertainty, but setbacks may knock me off course." },
      { score: 2, label: "I can usually stay with the plan, but I still react strongly to setbacks." },
      { score: 3, label: "I can stay with the plan, learn from setbacks, and keep moving." },
    ],
  },
  {
    qid: "PR_02",
    canonicalDimension: "Consistency under discomfort",
    canonicalPrompt: "Can you keep doing the important work even when you are tired, unsure, or not getting quick results?",
    prompt: "Can you keep doing the important work when you are tired, unsure, or not getting quick results?",
    followUp: "This is where the verdict often becomes obvious.",
    guardrail: "Do not assess whether the business idea is good.",
    options: [
      { score: 0, label: "No - I stop when I feel tired, unsure, or discouraged." },
      { score: 1, label: "Sometimes - I can keep going for short periods, but I am inconsistent." },
      { score: 2, label: "Mostly - I keep doing the work, but I still lose rhythm under pressure." },
      { score: 3, label: "Yes - I keep doing the important work even when it is uncomfortable." },
    ],
  },
];

const groupForQid = (qid: string) => {
  if (qid.startsWith("CR") || qid.startsWith("EL")) return "money";
  if (qid.startsWith("MR")) return "market";
  if (qid.startsWith("OP")) return "delivery";
  if (qid.startsWith("EX")) return "execution";
  return "resilience";
};

const buildGroups = (dimensions: ConversationDimension[]): ConversationGroup[] =>
  groupDefinitions.map((group) => ({
    ...group,
    dimensions: dimensions.filter((dimension) => groupForQid(dimension.qid) === group.id),
  }));

const getVerdict = (score: number, totalDimensions: number, answered: number) => {
  if (answered < totalDimensions) return "Verdict not ready";
  if (score <= 11) return "High risk / likely fail";
  if (score <= 20) return "Caution";
  if (score <= 29) return "Viable but exposed";
  return "Strong readiness";
};

const normaliseAnswerScore = (score: number): 0 | 1 | 2 | 3 => {
  if (score <= 0) return 0;
  if (score === 1) return 1;
  if (score === 2) return 2;
  return 3;
};

const scenarioForRun = (stage: BusinessStage) => {
  if (stage === "existing") return "existing_business";
  if (stage === "acquisition") return "existing_business";
  return stage;
};

const operatorClassForExperience = (experience: ExperienceLevel) => {
  if (experience === "experienced") return "experienced";
  if (experience === "some") return "developing";
  return "unproven";
};

const displayExperience = (experience: ExperienceLevel, fallback: string) => {
  if (experience === "never") return "First business";
  if (experience === "some") return "Some experience";
  if (experience === "experienced") return "Experienced operator";
  return fallback;
};

const buildDimensionsFromSupabase = (
  questions: DbQuestion[],
  answerOptions: DbAnswerOption[],
  variants: DbVariant[],
  stage: BusinessStage,
): ConversationDimension[] => {
  const variantByQuestionId = new Map(
    variants
      .filter((variant) => variant.stage_code === stage)
      .map((variant) => [variant.question_id, variant]),
  );

  const answersByQuestionId = answerOptions.reduce<Record<string, AnswerOption[]>>((acc, option) => {
    const list = acc[option.question_id] ?? [];
    list.push({ id: option.id, score: normaliseAnswerScore(option.score_value), label: option.label });
    acc[option.question_id] = list;
    return acc;
  }, {});

  return questions.map((question) => {
    const variant = variantByQuestionId.get(question.id);
    const options = (answersByQuestionId[question.id] ?? []).sort((a, b) => a.score - b.score);
    const fallback = fallbackDimensions.find((dimension) => dimension.qid === question.q_id);

    return {
      id: question.id,
      qid: question.q_id,
      canonicalDimension: dimensionNames[question.q_id] ?? question.dimension_code ?? question.q_id,
      canonicalPrompt: question.prompt ?? fallback?.canonicalPrompt ?? question.q_id,
      prompt: variant?.conversational_prompt ?? fallback?.prompt ?? question.prompt ?? question.q_id,
      followUp: variant?.follow_up_text ?? fallback?.followUp ?? "Select the answer that can be honestly defended today.",
      guardrail: variant?.guardrail_text ?? fallback?.guardrail ?? "Do not assess business viability.",
      options: options.length > 0 ? options : fallback?.options ?? [],
    };
  });
};

const FirstConversation = () => {
  const { user } = useAuth();
  const [stageOptions, setStageOptions] = useState<StageOption[]>(fallbackStages);
  const [experienceOptions, setExperienceOptions] = useState<ExperienceOption[]>(fallbackExperienceLevels);
  const [stage, setStage] = useState<BusinessStage>(fallbackStages[0].value);
  const [industry, setIndustry] = useState("");
  const [experience, setExperience] = useState<ExperienceLevel>(fallbackExperienceLevels[0].value);
  const [activeGroupId, setActiveGroupId] = useState(groupDefinitions[0].id);
  const [answers, setAnswers] = useState<Answers>({});
  const [selectedOptions, setSelectedOptions] = useState<SelectedOptions>({});
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadMessage, setLoadMessage] = useState("Loading Stage 0 overlays from Supabase…");
  const [runState, setRunState] = useState<RunState>("not_started");
  const [runMessage, setRunMessage] = useState("No live run yet. Your first saved answer will create one.");
  const [runId, setRunId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<DbQuestion[]>([]);
  const [answerOptions, setAnswerOptions] = useState<DbAnswerOption[]>([]);
  const [variants, setVariants] = useState<DbVariant[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadConversation = async () => {
      try {
        const [stagesResult, experienceResult, questionsResult, answerOptionsResult, variantsResult] = await Promise.all([
          supabase
            .from("autopsy_context_stage_options")
            .select("code,label,description,display_order")
            .eq("is_active", true)
            .order("display_order"),
          supabase
            .from("autopsy_context_experience_options")
            .select("code,label,display_order")
            .eq("is_active", true)
            .order("display_order"),
          supabase
            .from("questions")
            .select("id,q_id,prompt,dimension_code,sequence")
            .eq("is_active", true)
            .order("sequence"),
          supabase
            .from("answer_options")
            .select("id,question_id,score_value,label")
            .eq("is_active", true)
            .order("score_value"),
          supabase
            .from("autopsy_dimension_conversation_variants")
            .select("question_id,stage_code,conversational_prompt,follow_up_text,guardrail_text")
            .eq("is_active", true)
            .eq("variant_role", "candidate_conversation")
            .eq("version", "stage0_v1"),
        ]);

        const firstError =
          stagesResult.error ??
          experienceResult.error ??
          questionsResult.error ??
          answerOptionsResult.error ??
          variantsResult.error;

        if (firstError) throw firstError;
        if (cancelled) return;

        const liveStages =
          stagesResult.data?.map((item) => ({
            value: item.code,
            label: item.label,
            helper: item.description,
          })) ?? fallbackStages;

        const liveExperiences =
          experienceResult.data?.map((item) => ({
            value: item.code,
            label: item.label,
          })) ?? fallbackExperienceLevels;

        setStageOptions(liveStages.length > 0 ? liveStages : fallbackStages);
        setExperienceOptions(liveExperiences.length > 0 ? liveExperiences : fallbackExperienceLevels);
        setStage((current) => (liveStages.some((item) => item.value === current) ? current : liveStages[0]?.value ?? "startup"));
        setExperience((current) =>
          liveExperiences.some((item) => item.value === current) ? current : liveExperiences[0]?.value ?? "never",
        );
        setQuestions((questionsResult.data ?? []) as DbQuestion[]);
        setAnswerOptions((answerOptionsResult.data ?? []) as DbAnswerOption[]);
        setVariants((variantsResult.data ?? []) as DbVariant[]);
        setLoadState("live");
        setLoadMessage("Live from Supabase: stages, experience options, dimensions, answer options, and overlays.");
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load First Conversation overlays", error);
        setLoadState("fallback");
        setRunState("local_only");
        setLoadMessage("Supabase overlay load failed. Using local fallback so the prototype remains usable.");
        setRunMessage("Local-only mode. Answers are not being written to Supabase.");
      }
    };

    void loadConversation();

    return () => {
      cancelled = true;
    };
  }, []);

  const dimensions = useMemo(() => {
    if (loadState === "live" && questions.length > 0) {
      return buildDimensionsFromSupabase(questions, answerOptions, variants, stage);
    }
    return fallbackDimensions;
  }, [answerOptions, loadState, questions, stage, variants]);

  const conversationGroups = useMemo(() => buildGroups(dimensions), [dimensions]);
  const totalDimensions = dimensions.length;
  const activeGroup = conversationGroups.find((group) => group.id === activeGroupId) ?? conversationGroups[0];
  const stageOption = stageOptions.find((item) => item.value === stage);
  const stageLabel = stageOption?.label ?? "Startup";
  const stageDisplay = stageOption?.helper ?? stageLabel;
  const rawExperienceLabel = experienceOptions.find((item) => item.value === experience)?.label ?? experienceOptions[0]?.label ?? "Not captured";
  const experienceDisplay = displayExperience(experience, rawExperienceLabel);
  const answeredCount = Object.keys(answers).length;
  const score = Object.values(answers).reduce((sum, value) => sum + value, 0);
  const verdict = getVerdict(score, totalDimensions, answeredCount);
  const canPersist = loadState === "live" && runState !== "local_only";

  const ensureRun = async () => {
    if (!canPersist) return null;
    if (runId) return runId;

    setRunState("creating");
    setRunMessage("Creating Autopsy run…");

    const industryValue = industry.trim() || "Unspecified";
    const created = await createAutopsyRun({
      industry: industryValue,
      scenario: scenarioForRun(stage),
      run_name: `${stageLabel} · ${industryValue} · Stage 0 Conversation`,
      tester_email: user?.email ?? "conversation@autopsy.local",
      operator_class: operatorClassForExperience(experience),
    });

    const createdRunId = extractRunId(created);
    if (!createdRunId) throw new Error("The Autopsy run was created but no run id was returned.");

    await supabase
      .from("autopsy_runs")
      .update({
        business_stage: stage,
        industry_context: industry.trim() || null,
        ownership_experience: experience,
        conversation_variant_version: "stage0_v1",
      })
      .eq("id", createdRunId);

    setRunId(createdRunId);
    setRunState("live");
    setRunMessage(`Live run created. Answers are saving to Supabase. Run: ${createdRunId.slice(0, 8)}…`);
    return createdRunId;
  };

  const saveAnswer = async (dimension: ConversationDimension, option: AnswerOption) => {
    setAnswers((current) => ({ ...current, [dimension.qid]: option.score }));
    if (option.id != null) setSelectedOptions((current) => ({ ...current, [dimension.qid]: option.id as string | number }));

    if (!canPersist || !dimension.id || option.id == null) {
      if (loadState === "live") {
        setRunState("local_only");
        setRunMessage("This answer is local only because it is missing a canonical question or option id.");
      }
      return;
    }

    try {
      const activeRunId = await ensureRun();
      if (!activeRunId) return;
      setRunState("saving");
      setRunMessage(`Saving ${dimension.qid}…`);
      await recordAutopsyAnswer({
        run_id: activeRunId,
        question_id: dimension.id,
        selected_option: option.id,
      });
      setRunState("live");
      setRunMessage(`Saved ${dimension.qid}. Run: ${activeRunId.slice(0, 8)}…`);
    } catch (error) {
      console.error("Failed to save conversational answer", error);
      setRunState("error");
      setRunMessage(error instanceof Error ? error.message : "Failed to save answer to Supabase.");
    }
  };

  const finaliseRun = async () => {
    if (!runId) {
      setRunState("error");
      setRunMessage("No live run exists yet. Answer at least one dimension first.");
      return;
    }
    try {
      setRunState("finalising");
      setRunMessage("Finalising Autopsy run…");
      await finalizeAutopsyRun(runId);
      setRunState("finalised");
      setRunMessage(`Run finalised. Verdict is now database-derived for run ${runId.slice(0, 8)}…`);
    } catch (error) {
      console.error("Failed to finalise conversational run", error);
      setRunState("error");
      setRunMessage(error instanceof Error ? error.message : "Failed to finalise run.");
    }
  };

  const contextSummary = useMemo(() => {
    const industryText = industry.trim() || "Not selected yet";
    return { stage: stageDisplay, industry: industryText, experience: experienceDisplay };
  }, [stageDisplay, industry, experienceDisplay]);

  const groupScore = (group: ConversationGroup) =>
    group.dimensions.reduce((sum, dimension) => sum + (answers[dimension.qid] ?? 0), 0);

  const groupAnswered = (group: ConversationGroup) =>
    group.dimensions.filter((dimension) => answers[dimension.qid] !== undefined).length;

  return (
    <main className="min-h-screen bg-[#f7f3ea] px-4 py-8 text-[#221f1a] sm:px-6 lg:px-8">
      <section className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-4 rounded-[2rem] border border-[#dfd1bb] bg-[#fffaf0] p-5 shadow-xl shadow-[#7b5a2c]/10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#8a5f2e]">Autopsy</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">Stage 0 Maturity Spine</h1>
            <p className="mt-3 text-sm leading-6 text-[#625744]">
              Context first. Maturity second. No business viability judgement.
            </p>
          </div>

          <div className="rounded-2xl border border-[#dfd1bb] bg-white p-4 text-sm leading-6">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#8a5f2e]">Data source</p>
            <p className="mt-2 font-semibold text-[#2f2a21]">{loadState === "live" ? "Supabase live" : loadState === "loading" ? "Loading" : "Local fallback"}</p>
            <p className="mt-1 text-[#625744]">{loadMessage}</p>
          </div>

          <div className="rounded-2xl border border-[#dfd1bb] bg-white p-4 text-sm leading-6">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#8a5f2e]">Run status</p>
            <p className="mt-2 font-semibold text-[#2f2a21]">
              {runState === "finalised" ? "Finalised" : runId ? "Live run" : runState === "local_only" ? "Local only" : "Not started"}
            </p>
            <p className="mt-1 text-[#625744]">{runMessage}</p>
          </div>

          <div className="rounded-2xl border border-[#dfd1bb] bg-white p-4 text-sm leading-6">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#8a5f2e]">Context</p>
            <div className="mt-2 space-y-1 text-[#625744]">
              <p><span className="font-semibold text-[#2f2a21]">Stage:</span> {contextSummary.stage}</p>
              <p><span className="font-semibold text-[#2f2a21]">Industry:</span> {contextSummary.industry}</p>
              <p><span className="font-semibold text-[#2f2a21]">Experience:</span> {contextSummary.experience}</p>
            </div>
          </div>

          <div className="space-y-2">
            {conversationGroups.map((group) => {
              const active = group.id === activeGroup.id;
              const answered = groupAnswered(group);
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setActiveGroupId(group.id)}
                  className={`w-full rounded-2xl border p-3 text-left transition ${
                    active ? "border-[#8a5f2e] bg-[#efe2cb]" : "border-[#dfd1bb] bg-white hover:bg-[#fff7e8]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">{group.title}</span>
                    <span className="rounded-full border border-[#dfd1bb] px-2 py-0.5 text-xs text-[#625744]">
                      {answered}/{group.dimensions.length}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#8c806b]">Score {groupScore(group)} / {group.dimensions.length * 3}</p>
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl bg-[#2f2a21] p-4 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/55">Running read</p>
            <p className="mt-3 text-2xl font-semibold">{score} / {totalDimensions * 3}</p>
            <p className="mt-1 text-sm text-white/70">{answeredCount} of {totalDimensions} dimensions answered</p>
            <p className="mt-4 text-base font-semibold">{verdict}</p>
          </div>
        </aside>

        <section className="space-y-6">
          <div className="rounded-[2rem] border border-[#dfd1bb] bg-[#fffaf0] p-5 shadow-xl shadow-[#7b5a2c]/10 sm:p-8">
            <div className="mb-6 max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#8a5f2e]">Context capture</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">So you’re thinking about building or operating a business?</h2>
              <p className="mt-4 text-base leading-7 text-[#625744]">
                This first part is not scored. It only sets the conversation so it sounds relevant without corrupting the maturity assessment.
              </p>
            </div>

            <div className="grid gap-5">
              <div>
                <p className="mb-3 text-sm font-semibold">What stage are we talking about?</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {stageOptions.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => {
                        if (runId) return;
                        setStage(item.value);
                        setAnswers({});
                        setSelectedOptions({});
                      }}
                      className={`rounded-2xl border p-4 text-left transition ${
                        stage === item.value ? "border-[#8a5f2e] bg-[#efe2cb]" : "border-[#dfd1bb] bg-white hover:bg-[#fff7e8]"
                      } ${runId ? "cursor-not-allowed opacity-70" : ""}`}
                    >
                      <span className="font-semibold">{item.label}</span>
                      <span className="mt-1 block text-sm text-[#625744]">{item.helper}</span>
                    </button>
                  ))}
                </div>
                {runId ? <p className="mt-2 text-xs text-[#8c806b]">Stage is locked after the run starts.</p> : null}
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold">What specific industry?</span>
                  <input
                    value={industry}
                    onChange={(event) => setIndustry(event.target.value)}
                    disabled={!!runId}
                    className="mt-3 w-full rounded-2xl border border-[#dfd1bb] bg-white px-4 py-3 text-base outline-none focus:border-[#8a5f2e] disabled:cursor-not-allowed disabled:opacity-70"
                    placeholder="Cleaning, bookkeeping, consulting, café, trades..."
                  />
                  <span className="mt-2 block text-xs leading-5 text-[#8c806b]">
                    Context only. It does not change the Stage 0 maturity score.
                  </span>
                </label>

                <div>
                  <p className="text-sm font-semibold">Have you owned or run a business before?</p>
                  <div className="mt-3 space-y-2">
                    {experienceOptions.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => {
                          if (!runId) setExperience(item.value);
                        }}
                        className={`w-full rounded-2xl border p-3 text-left text-sm transition ${
                          experience === item.value ? "border-[#8a5f2e] bg-[#efe2cb]" : "border-[#dfd1bb] bg-white hover:bg-[#fff7e8]"
                        } ${runId ? "cursor-not-allowed opacity-70" : ""}`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  {runId ? <p className="mt-2 text-xs text-[#8c806b]">Experience is locked after the run starts.</p> : null}
                </div>
              </div>

              <div className="rounded-3xl bg-[#2f2a21] p-5 text-white">
                <p className="text-lg leading-8">Good. The business itself is not what we are assessing today.</p>
                <p className="mt-3 text-lg leading-8">
                  Today we are looking at whether the candidate is ready to build or operate one.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-[#dfd1bb] bg-[#fffaf0] p-5 shadow-xl shadow-[#7b5a2c]/10 sm:p-8">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#8a5f2e]">{activeGroup.title}</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">{activeGroup.bridge}</h2>
              <p className="mt-3 text-sm leading-6 text-[#625744]">
                Stage overlay active: <span className="font-semibold">{stageLabel}</span>. Canonical scoring remains bound to the same Stage 0 maturity dimensions.
              </p>
            </div>

            <div className="space-y-6">
              {activeGroup.dimensions.map((dimension) => (
                <article key={dimension.qid} className="rounded-3xl border border-[#dfd1bb] bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#8a5f2e]">
                        {dimension.qid} · {dimension.canonicalDimension}
                      </p>
                      <h3 className="mt-2 text-xl font-semibold leading-8">{dimension.prompt}</h3>
                      <p className="mt-2 text-sm leading-6 text-[#625744]">{dimension.followUp}</p>
                    </div>
                    <span className="rounded-full border border-[#dfd1bb] px-3 py-1 text-xs text-[#625744]">
                      Score {answers[dimension.qid] ?? "—"}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-3">
                    {dimension.options.map((option) => {
                      const active = answers[dimension.qid] === option.score && selectedOptions[dimension.qid] === option.id;
                      return (
                        <button
                          type="button"
                          key={`${dimension.qid}-${option.id ?? option.score}`}
                          onClick={() => void saveAnswer(dimension, option)}
                          className={`rounded-2xl border p-4 text-left text-base leading-7 transition ${
                            active
                              ? "border-[#8a5f2e] bg-[#efe2cb] shadow-sm"
                              : "border-[#dfd1bb] bg-[#fffaf0] hover:border-[#b58b57] hover:bg-[#fff7e8]"
                          }`}
                        >
                          <span className="mr-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#dfd1bb] text-sm font-semibold">
                            {option.score}
                          </span>
                          {option.label}
                        </button>
                      );
                    })}
                  </div>

                  <details className="mt-4 rounded-2xl bg-[#f7f3ea] p-4 text-sm leading-6 text-[#625744]">
                    <summary className="cursor-pointer font-semibold text-[#2f2a21]">Canonical binding</summary>
                    <p className="mt-2"><span className="font-semibold">Canonical prompt:</span> {dimension.canonicalPrompt}</p>
                    <p className="mt-2"><span className="font-semibold">Guardrail:</span> {dimension.guardrail}</p>
                    <p className="mt-2"><span className="font-semibold">Rule:</span> Wording may change by stage. Score and dimension do not.</p>
                  </details>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-[#dfd1bb] bg-[#fffaf0] p-5 shadow-xl shadow-[#7b5a2c]/10 sm:p-8">
            <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#8a5f2e]">Conversation readout</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight">The verdict should fall out of the maturity evidence.</h2>
                <p className="mt-4 text-base leading-7 text-[#625744]">
                  This screen now reads Stage 0 overlays from Supabase and writes selected answers into a live Autopsy run when possible.
                </p>
                <div className="mt-5 rounded-3xl border border-[#dfd1bb] bg-white p-4 text-sm leading-6 text-[#625744]">
                  <p><span className="font-semibold text-[#2f2a21]">Current run:</span> {runId ?? "Not created yet"}</p>
                  <p className="mt-2"><span className="font-semibold text-[#2f2a21]">Save status:</span> {runMessage}</p>
                </div>
              </div>
              <div className="rounded-3xl bg-[#2f2a21] p-5 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/55">Provisional verdict</p>
                <p className="mt-3 text-xl font-semibold">{verdict}</p>
                <p className="mt-3 text-sm leading-6 text-white/70">
                  {answeredCount < totalDimensions
                    ? `${totalDimensions - answeredCount} maturity dimensions remain.`
                    : "All Stage 0 maturity dimensions answered."}
                </p>
                <button
                  type="button"
                  disabled={answeredCount < totalDimensions || !runId || runState === "finalising" || runState === "finalised"}
                  onClick={() => void finaliseRun()}
                  className="mt-5 w-full rounded-full bg-white px-4 py-3 text-sm font-semibold text-[#2f2a21] transition hover:bg-[#fff7e8] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {runState === "finalised" ? "Finalised" : "Finalise run"}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setStage(stageOptions[0]?.value ?? "startup");
                setIndustry("");
                setExperience(experienceOptions[0]?.value ?? "never");
                setAnswers({});
                setSelectedOptions({});
                setRunId(null);
                setRunState(loadState === "live" ? "not_started" : "local_only");
                setRunMessage(loadState === "live" ? "No live run yet. Your first saved answer will create one." : "Local-only mode. Answers are not being written to Supabase.");
                setActiveGroupId(groupDefinitions[0].id);
              }}
              className="mt-6 rounded-full border border-[#8a5f2e] px-5 py-3 text-sm font-semibold text-[#8a5f2e] transition hover:bg-[#fff7e8]"
            >
              Start again
            </button>
          </div>

          <p className="text-center text-xs leading-6 text-[#8c806b]">
            Legacy Autopsy remains available at /autopsy. This route is the conversation-first Stage 0 engine.
          </p>
        </section>
      </section>
    </main>
  );
};

export default FirstConversation;

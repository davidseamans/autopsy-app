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
type LoadState = "loading" | "live" | "error";
type RunState = "not_started" | "creating" | "live" | "saving" | "finalising" | "finalised" | "error";

type StageOption = { value: BusinessStage; label: string; helper: string };
type ExperienceOption = { value: ExperienceLevel; label: string };
type AnswerOption = { id: string | number; score: 0 | 1 | 2 | 3; label: string };
type Answers = Record<string, number>;
type SelectedOptions = Record<string, string | number>;

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

type ConversationDimension = {
  id: string;
  qid: string;
  canonicalDimension: string;
  canonicalPrompt: string;
  prompt: string;
  followUp: string;
  guardrail: string;
  options: AnswerOption[];
};

type ConversationGroup = {
  id: string;
  title: string;
  bridge: string;
  dimensions: ConversationDimension[];
};

type FinalVerdict = {
  id: string;
  score_total: number | null;
  verdict_name: string | null;
  final_verdict: string | null;
  verdict_body: string | null;
  primary_risk: string | null;
  permission_level: string | null;
  progression_state: string | null;
  next_step_customer_wording: string | null;
  completed_at: string | null;
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

const normaliseAnswerScore = (score: number): 0 | 1 | 2 | 3 => {
  if (score <= 0) return 0;
  if (score === 1) return 1;
  if (score === 2) return 2;
  return 3;
};

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

const scenarioForRun = (stage: BusinessStage) => {
  if (stage === "existing" || stage === "acquisition") return "existing_business";
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

const getLocalVerdict = (score: number, totalDimensions: number, answered: number) => {
  if (answered < totalDimensions) return "Verdict not ready";
  if (score <= 11) return "High risk / likely fail";
  if (score <= 20) return "Caution";
  if (score <= 29) return "Viable but exposed";
  return "Strong readiness";
};

const buildDimensions = (
  questions: DbQuestion[],
  answerOptions: DbAnswerOption[],
  variants: DbVariant[],
  stage: BusinessStage,
): ConversationDimension[] => {
  const variantByQuestionId = new Map(
    variants.filter((variant) => variant.stage_code === stage).map((variant) => [variant.question_id, variant]),
  );

  const answersByQuestionId = answerOptions.reduce<Record<string, AnswerOption[]>>((acc, option) => {
    const list = acc[option.question_id] ?? [];
    list.push({ id: option.id, score: normaliseAnswerScore(option.score_value), label: option.label });
    acc[option.question_id] = list;
    return acc;
  }, {});

  return questions.map((question) => {
    const variant = variantByQuestionId.get(question.id);
    const qid = question.q_id;
    return {
      id: question.id,
      qid,
      canonicalDimension: dimensionNames[qid] ?? question.dimension_code ?? qid,
      canonicalPrompt: question.prompt ?? qid,
      prompt: variant?.conversational_prompt ?? question.prompt ?? qid,
      followUp: variant?.follow_up_text ?? "Select the answer that can be honestly defended today.",
      guardrail: variant?.guardrail_text ?? "Do not assess business viability.",
      options: (answersByQuestionId[question.id] ?? []).sort((a, b) => a.score - b.score),
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
  const [finalVerdict, setFinalVerdict] = useState<FinalVerdict | null>(null);
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
          experienceResult.data?.map((item) => ({ value: item.code, label: item.label })) ?? fallbackExperienceLevels;

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
        setLoadState("error");
        setLoadMessage(error instanceof Error ? error.message : "Supabase overlay load failed.");
        setRunState("error");
        setRunMessage("Stage 0 overlays could not be loaded, so run creation is blocked.");
      }
    };

    void loadConversation();
    return () => {
      cancelled = true;
    };
  }, []);

  const dimensions = useMemo(
    () => (loadState === "live" ? buildDimensions(questions, answerOptions, variants, stage) : []),
    [answerOptions, loadState, questions, stage, variants],
  );
  const conversationGroups = useMemo(() => buildGroups(dimensions), [dimensions]);
  const totalDimensions = dimensions.length;
  const activeGroup = conversationGroups.find((group) => group.id === activeGroupId) ?? conversationGroups[0] ?? groupDefinitions[0];
  const stageOption = stageOptions.find((item) => item.value === stage);
  const stageLabel = stageOption?.label ?? "Startup";
  const stageDisplay = stageOption?.helper ?? stageLabel;
  const rawExperienceLabel = experienceOptions.find((item) => item.value === experience)?.label ?? experienceOptions[0]?.label ?? "Not captured";
  const experienceDisplay = displayExperience(experience, rawExperienceLabel);
  const answeredCount = Object.keys(answers).length;
  const score = Object.values(answers).reduce((sum, value) => sum + value, 0);
  const localVerdict = getLocalVerdict(score, totalDimensions, answeredCount);
  const displayVerdict = finalVerdict?.verdict_name ?? finalVerdict?.final_verdict ?? localVerdict;
  const displayScore = finalVerdict?.score_total ?? score;
  const maxScore = totalDimensions * 3;
  const canPersist = loadState === "live" && runState !== "error";

  const fetchFinalVerdict = async (activeRunId: string) => {
    const { data, error } = await supabase
      .from("autopsy_runs")
      .select(
        "id,score_total,verdict_name,final_verdict,verdict_body,primary_risk,permission_level,progression_state,next_step_customer_wording,completed_at",
      )
      .eq("id", activeRunId)
      .single();
    if (error) throw error;
    return data as FinalVerdict;
  };

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

    const updateResult = await supabase
      .from("autopsy_runs")
      .update({
        business_stage: stage,
        industry_context: industry.trim() || null,
        ownership_experience: experience,
        conversation_variant_version: "stage0_v1",
      })
      .eq("id", createdRunId);
    if (updateResult.error) throw updateResult.error;

    setRunId(createdRunId);
    setRunState("live");
    setRunMessage(`Live run created. Answers are saving to Supabase. Run: ${createdRunId.slice(0, 8)}…`);
    return createdRunId;
  };

  const saveAnswer = async (dimension: ConversationDimension, option: AnswerOption) => {
    if (runState === "finalised") return;
    setAnswers((current) => ({ ...current, [dimension.qid]: option.score }));
    setSelectedOptions((current) => ({ ...current, [dimension.qid]: option.id }));
    setFinalVerdict(null);

    try {
      const activeRunId = await ensureRun();
      if (!activeRunId) return;
      setRunState("saving");
      setRunMessage(`Saving ${dimension.qid}…`);
      await recordAutopsyAnswer({ run_id: activeRunId, question_id: dimension.id, selected_option: option.id });
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
      const dbVerdict = await fetchFinalVerdict(runId);
      setFinalVerdict(dbVerdict);
      setRunState("finalised");
      setRunMessage(`Run finalised. Database verdict loaded for run ${runId.slice(0, 8)}…`);
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
            <p className="mt-3 text-sm leading-6 text-[#625744]">Context first. Maturity second. No business viability judgement.</p>
          </div>

          <div className="rounded-2xl border border-[#dfd1bb] bg-white p-4 text-sm leading-6">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#8a5f2e]">Data source</p>
            <p className="mt-2 font-semibold text-[#2f2a21]">{loadState === "live" ? "Supabase live" : loadState === "loading" ? "Loading" : "Load error"}</p>
            <p className="mt-1 text-[#625744]">{loadMessage}</p>
          </div>

          <div className="rounded-2xl border border-[#dfd1bb] bg-white p-4 text-sm leading-6">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#8a5f2e]">Run status</p>
            <p className="mt-2 font-semibold text-[#2f2a21]">
              {runState === "finalised" ? "Finalised" : runId ? "Live run" : runState === "error" ? "Error" : "Not started"}
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
                    <span className="rounded-full border border-[#dfd1bb] px-2 py-0.5 text-xs text-[#625744]">{answered}/{group.dimensions.length}</span>
                  </div>
                  <p className="mt-1 text-xs text-[#8c806b]">Score {groupScore(group)} / {group.dimensions.length * 3}</p>
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl bg-[#2f2a21] p-4 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/55">
              {finalVerdict ? "Database verdict" : "Running read"}
            </p>
            <p className="mt-3 text-2xl font-semibold">{displayScore} / {maxScore}</p>
            <p className="mt-1 text-sm text-white/70">{answeredCount} of {totalDimensions} dimensions answered</p>
            <p className="mt-4 text-base font-semibold">{displayVerdict}</p>
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
                  <span className="mt-2 block text-xs leading-5 text-[#8c806b]">Context only. It does not change the Stage 0 maturity score.</span>
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
                <p className="mt-3 text-lg leading-8">Today we are looking at whether the candidate is ready to build or operate one.</p>
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
                      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#8a5f2e]">{dimension.qid} · {dimension.canonicalDimension}</p>
                      <h3 className="mt-2 text-xl font-semibold leading-8">{dimension.prompt}</h3>
                      <p className="mt-2 text-sm leading-6 text-[#625744]">{dimension.followUp}</p>
                    </div>
                    <span className="rounded-full border border-[#dfd1bb] px-3 py-1 text-xs text-[#625744]">Score {answers[dimension.qid] ?? "—"}</span>
                  </div>

                  <div className="mt-5 grid gap-3">
                    {dimension.options.map((option) => {
                      const active = answers[dimension.qid] === option.score && selectedOptions[dimension.qid] === option.id;
                      return (
                        <button
                          type="button"
                          key={`${dimension.qid}-${option.id}`}
                          onClick={() => void saveAnswer(dimension, option)}
                          disabled={runState === "finalised"}
                          className={`rounded-2xl border p-4 text-left text-base leading-7 transition disabled:cursor-not-allowed disabled:opacity-70 ${
                            active
                              ? "border-[#8a5f2e] bg-[#efe2cb] shadow-sm"
                              : "border-[#dfd1bb] bg-[#fffaf0] hover:border-[#b58b57] hover:bg-[#fff7e8]"
                          }`}
                        >
                          <span className="mr-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#dfd1bb] text-sm font-semibold">{option.score}</span>
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
            <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#8a5f2e]">Conversation readout</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight">The verdict should fall out of the maturity evidence.</h2>
                <p className="mt-4 text-base leading-7 text-[#625744]">
                  This screen reads Stage 0 overlays from Supabase, writes answers into a live Autopsy run, and loads the database verdict after finalisation.
                </p>
                <div className="mt-5 rounded-3xl border border-[#dfd1bb] bg-white p-4 text-sm leading-6 text-[#625744]">
                  <p><span className="font-semibold text-[#2f2a21]">Current run:</span> {runId ?? "Not created yet"}</p>
                  <p className="mt-2"><span className="font-semibold text-[#2f2a21]">Save status:</span> {runMessage}</p>
                  {finalVerdict?.verdict_body ? (
                    <p className="mt-3"><span className="font-semibold text-[#2f2a21]">Verdict body:</span> {finalVerdict.verdict_body}</p>
                  ) : null}
                  {finalVerdict?.next_step_customer_wording ? (
                    <p className="mt-3"><span className="font-semibold text-[#2f2a21]">Next step:</span> {finalVerdict.next_step_customer_wording}</p>
                  ) : null}
                </div>
              </div>
              <div className="rounded-3xl bg-[#2f2a21] p-5 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/55">{finalVerdict ? "Database verdict" : "Provisional verdict"}</p>
                <p className="mt-3 text-xl font-semibold">{displayVerdict}</p>
                <p className="mt-3 text-sm leading-6 text-white/70">
                  {finalVerdict
                    ? `Final score: ${displayScore} / ${maxScore}`
                    : answeredCount < totalDimensions
                      ? `${totalDimensions - answeredCount} maturity dimensions remain.`
                      : "All Stage 0 maturity dimensions answered."}
                </p>
                {finalVerdict?.permission_level ? <p className="mt-3 text-sm text-white/70">Permission: {finalVerdict.permission_level}</p> : null}
                {finalVerdict?.primary_risk ? <p className="mt-3 text-sm text-white/70">Primary risk: {finalVerdict.primary_risk}</p> : null}
                <button
                  type="button"
                  disabled={answeredCount < totalDimensions || !runId || runState === "finalising" || runState === "finalised"}
                  onClick={() => void finaliseRun()}
                  className="mt-5 w-full rounded-full bg-white px-4 py-3 text-sm font-semibold text-[#2f2a21] transition hover:bg-[#fff7e8] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {runState === "finalised" ? "Finalised" : runState === "finalising" ? "Finalising…" : "Finalise run"}
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
                setFinalVerdict(null);
                setRunState(loadState === "live" ? "not_started" : "error");
                setRunMessage(loadState === "live" ? "No live run yet. Your first saved answer will create one." : "Stage 0 overlays could not be loaded.");
                setActiveGroupId(groupDefinitions[0].id);
              }}
              className="mt-6 rounded-full border border-[#8a5f2e] px-5 py-3 text-sm font-semibold text-[#8a5f2e] transition hover:bg-[#fff7e8]"
            >
              Start again
            </button>
          </div>

          <p className="text-center text-xs leading-6 text-[#8c806b]">Legacy Autopsy remains available at /autopsy. This route is the conversation-first Stage 0 engine.</p>
        </section>
      </section>
    </main>
  );
};

export default FirstConversation;

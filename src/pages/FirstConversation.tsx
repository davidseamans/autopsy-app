import { useMemo, useState } from "react";

type BusinessStage = "startup" | "acquisition" | "franchise" | "existing";
type ExperienceLevel = "never" | "some" | "experienced";

type AnswerOption = {
  score: 0 | 1 | 2 | 3;
  label: string;
};

type StagePrompts = Partial<Record<BusinessStage, string>>;

type ConversationDimension = {
  qid: string;
  canonicalDimension: string;
  canonicalPrompt: string;
  basePrompt: string;
  stagePrompts?: StagePrompts;
  followUp: string;
  options: AnswerOption[];
};

type ConversationGroup = {
  id: string;
  title: string;
  bridge: string;
  dimensions: ConversationDimension[];
};

type Answers = Record<string, number>;

const stages: { value: BusinessStage; label: string; helper: string }[] = [
  { value: "startup", label: "Startup", helper: "Starting from scratch." },
  { value: "acquisition", label: "Acquisition", helper: "Buying an existing business." },
  { value: "franchise", label: "Franchise", helper: "Buying into a franchise system." },
  { value: "existing", label: "Existing business", helper: "Already operating and looking at maturity." },
];

const experienceLevels: { value: ExperienceLevel; label: string }[] = [
  { value: "never", label: "I have never owned or run a business before." },
  { value: "some", label: "I have some business or management experience." },
  { value: "experienced", label: "I have owned, run, or led businesses before." },
];

const conversationGroups: ConversationGroup[] = [
  {
    id: "money",
    title: "Money reality",
    bridge: "Let’s start with the part that usually exposes maturity first: cash pressure and economic literacy.",
    dimensions: [
      {
        qid: "CR_01",
        canonicalDimension: "Cash runway",
        canonicalPrompt: "Have you estimated how long you can operate without income?",
        basePrompt: "How long can you personally carry this before the lack of income becomes a problem?",
        stagePrompts: {
          startup: "If the business takes longer than you hope to start paying you, how long can you personally carry it?",
          acquisition: "If the business earns less than expected after settlement, how long can you personally carry the pressure?",
          franchise: "After franchise fees and setup costs, how long can you carry the business before it must support you?",
          existing: "If revenue dropped for several months, how long could you continue operating without panic decisions?",
        },
        followUp: "This does not test whether the business is good. It tests whether the candidate understands cash pressure.",
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
        basePrompt: "What are the minimum resources required to proceed safely — cash, tools, supplies, people, time, and setup?",
        stagePrompts: {
          startup: "What is the bare minimum you need to start safely — cash, tools, supplies, labour, and time?",
          acquisition: "What resources do you need at settlement and in the first 90 days to avoid buying yourself a mess?",
          franchise: "Beyond the franchise fee, what setup resources do you need before the business can operate safely?",
          existing: "What resources are currently missing or fragile enough to put the business under pressure?",
        },
        followUp: "No wishlist. Minimum viable reality only.",
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
        basePrompt: "Can you explain the money model clearly — revenue, costs, margin, and repeat work?",
        followUp: "We are not asking if the idea is attractive. We are testing whether the candidate understands the economics.",
        options: [
          { score: 0, label: "I cannot clearly explain how the business makes money." },
          { score: 1, label: "I can explain the idea, but not the numbers behind it." },
          { score: 2, label: "I can explain revenue and costs, but the margin is not fully tested." },
          { score: 3, label: "I can show how revenue, costs, margin, and repeat sales create profit." },
        ],
      },
      {
        qid: "EL_02",
        canonicalDimension: "Cost driver awareness",
        canonicalPrompt: "Have you identified your main cost drivers?",
        basePrompt: "Which costs will quietly damage margin if you get them wrong?",
        followUp: "This is maturity, not viability: can the candidate see margin pressure before it bites?",
        options: [
          { score: 0, label: "I have not identified the main costs." },
          { score: 1, label: "I know some costs, but I am probably missing important ones." },
          { score: 2, label: "I have listed the main costs, but I have not tested them against real jobs." },
          { score: 3, label: "I know the main cost drivers and how they affect profit on each job." },
        ],
      },
    ],
  },
  {
    id: "market",
    title: "Customer reality",
    bridge: "Now we test whether the candidate can separate evidence from optimism.",
    dimensions: [
      {
        qid: "MR_02",
        canonicalDimension: "Customer clarity",
        canonicalPrompt: "Have you clearly defined your target customer?",
        basePrompt: "Who is the customer, what problem are they trying to remove, and why would this offer matter to them?",
        followUp: "This is not a market-size test. It is a clarity test.",
        options: [
          { score: 0, label: "I do not know exactly who the customer is." },
          { score: 1, label: "I have a broad customer type, but it is still vague." },
          { score: 2, label: "I know the likely customer, but I have not tested the offer with them properly." },
          { score: 3, label: "I can clearly name the customer type, problem, offer, and buying reason." },
        ],
      },
      {
        qid: "MR_01",
        canonicalDimension: "Evidence before commitment",
        canonicalPrompt: "What evidence do you have that customers will pay for this?",
        basePrompt: "What has a real customer already done that counts as evidence, not encouragement?",
        stagePrompts: {
          acquisition: "What evidence do you have that customers, revenue, and demand are real rather than seller-story or wishful thinking?",
          franchise: "What evidence do you have that customers in your territory or market will actually buy, not just that the franchise system looks good?",
          existing: "What recent evidence shows customers still value and pay for the offer?",
        },
        followUp: "Compliments are not proof. Behaviour is proof.",
        options: [
          { score: 0, label: "I have no evidence that anyone will pay." },
          { score: 1, label: "People have said it sounds good, but no one has paid or committed." },
          { score: 2, label: "I have some signs of demand, but not enough paid proof yet." },
          { score: 3, label: "I have real payment, signed commitment, or strong proof customers will pay." },
        ],
      },
    ],
  },
  {
    id: "delivery",
    title: "Delivery reality",
    bridge: "Now test whether the candidate can deliver consistently, not just once on a good day.",
    dimensions: [
      {
        qid: "OP_01",
        canonicalDimension: "Consistent delivery capability",
        canonicalPrompt: "Do you have the operational ability to deliver your product or service consistently?",
        basePrompt: "Can you actually deliver this consistently to the required standard?",
        stagePrompts: {
          acquisition: "Can you operate or improve the business after settlement without relying on the seller holding it together?",
          franchise: "Can you follow the franchise operating model consistently enough for the system to work?",
          existing: "Can the business deliver consistently without relying on last-minute heroics?",
        },
        followUp: "Repeatability is the maturity test.",
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
        basePrompt: "Could the work be written down well enough to repeat the job the same way next time?",
        followUp: "This is where a bought job starts becoming a business system.",
        options: [
          { score: 0, label: "No - I work it out as I go." },
          { score: 1, label: "Partly - I know the main steps, but it is not written down." },
          { score: 2, label: "Mostly - I have the steps and supplies listed, but it still needs testing." },
          { score: 3, label: "Yes - the steps, tools, and supplies are written down and repeatable." },
        ],
      },
    ],
  },
  {
    id: "execution",
    title: "Execution reality",
    bridge: "Now stop listening to the story and look at behaviour. What has the candidate actually done?",
    dimensions: [
      {
        qid: "EX_01",
        canonicalDimension: "Concrete action",
        canonicalPrompt: "Have you taken any concrete action toward this business?",
        basePrompt: "What concrete action have you already taken that produced evidence?",
        followUp: "Thinking and research may help, but they are not the same as contact with reality.",
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
        basePrompt: "For the next 30 days, what time can you protect for this without pretending?",
        stagePrompts: {
          existing: "For the next 30 days, what operating rhythm can you protect to improve the business rather than just react to it?",
        },
        followUp: "A vague intention does not count as an execution rhythm.",
        options: [
          { score: 0, label: "I cannot commit regular time for the next 30 days." },
          { score: 1, label: "I might find time, but I do not have a reliable schedule." },
          { score: 2, label: "I have time set aside, but I have not proven I will protect it." },
          { score: 3, label: "I have a realistic 30-day work rhythm I can protect and follow." },
        ],
      },
    ],
  },
  {
    id: "resilience",
    title: "Founder reality",
    bridge: "Last pass: the human operator. This is not motivation theatre. It is whether the work survives pressure.",
    dimensions: [
      {
        qid: "PR_01",
        canonicalDimension: "Persistence under uncertainty",
        canonicalPrompt: "Are you prepared to persist through uncertainty and repeated failure without changing direction prematurely?",
        basePrompt: "When it gets uncertain or disappointing, are you likely to learn and persist, or keep changing direction?",
        followUp: "The point is not toughness. The point is whether the work survives discomfort.",
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
        basePrompt: "Can you keep doing the important work when you are tired, unsure, or not getting quick results?",
        followUp: "This is where the verdict often becomes obvious.",
        options: [
          { score: 0, label: "No - I stop when I feel tired, unsure, or discouraged." },
          { score: 1, label: "Sometimes - I can keep going for short periods, but I am inconsistent." },
          { score: 2, label: "Mostly - I keep doing the work, but I still lose rhythm under pressure." },
          { score: 3, label: "Yes - I keep doing the important work even when it is uncomfortable." },
        ],
      },
    ],
  },
];

const totalDimensions = conversationGroups.reduce((count, group) => count + group.dimensions.length, 0);

const getVerdict = (score: number, answered: number) => {
  if (answered < totalDimensions) return "Verdict not ready";
  if (score <= 11) return "High risk / likely fail";
  if (score <= 20) return "Caution";
  if (score <= 29) return "Viable but exposed";
  return "Strong readiness";
};

const promptForStage = (dimension: ConversationDimension, stage: BusinessStage) =>
  dimension.stagePrompts?.[stage] ?? dimension.basePrompt;

const FirstConversation = () => {
  const [stage, setStage] = useState<BusinessStage>("startup");
  const [industry, setIndustry] = useState("");
  const [experience, setExperience] = useState<ExperienceLevel>("never");
  const [activeGroupId, setActiveGroupId] = useState(conversationGroups[0].id);
  const [answers, setAnswers] = useState<Answers>({});

  const activeGroup = conversationGroups.find((group) => group.id === activeGroupId) ?? conversationGroups[0];
  const stageLabel = stages.find((item) => item.value === stage)?.label ?? "Startup";
  const experienceLabel = experienceLevels.find((item) => item.value === experience)?.label ?? experienceLevels[0].label;
  const answeredCount = Object.keys(answers).length;
  const score = Object.values(answers).reduce((sum, value) => sum + value, 0);
  const verdict = getVerdict(score, answeredCount);

  const contextSummary = useMemo(() => {
    const industryText = industry.trim() || "Industry not captured yet";
    return `${stageLabel} · ${industryText} · ${experienceLabel}`;
  }, [stageLabel, industry, experienceLabel]);

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
              Context capture first. Maturity assessment second. No business viability judgement.
            </p>
          </div>

          <div className="rounded-2xl border border-[#dfd1bb] bg-white p-4 text-sm leading-6">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#8a5f2e]">Context</p>
            <p className="mt-2 text-[#625744]">{contextSummary}</p>
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
                This first part is not scored. It only sets the overlay so the conversation sounds relevant without corrupting the maturity assessment.
              </p>
            </div>

            <div className="grid gap-5">
              <div>
                <p className="mb-3 text-sm font-semibold">What stage are we talking about?</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {stages.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setStage(item.value)}
                      className={`rounded-2xl border p-4 text-left transition ${
                        stage === item.value ? "border-[#8a5f2e] bg-[#efe2cb]" : "border-[#dfd1bb] bg-white hover:bg-[#fff7e8]"
                      }`}
                    >
                      <span className="font-semibold">{item.label}</span>
                      <span className="mt-1 block text-sm text-[#625744]">{item.helper}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold">What specific industry?</span>
                  <input
                    value={industry}
                    onChange={(event) => setIndustry(event.target.value)}
                    className="mt-3 w-full rounded-2xl border border-[#dfd1bb] bg-white px-4 py-3 text-base outline-none focus:border-[#8a5f2e]"
                    placeholder="Cleaning, bookkeeping, consulting, café, trades..."
                  />
                  <span className="mt-2 block text-xs leading-5 text-[#8c806b]">
                    Stored as context only. It does not change the Stage 0 maturity score.
                  </span>
                </label>

                <div>
                  <p className="text-sm font-semibold">Have you owned or run a business before?</p>
                  <div className="mt-3 space-y-2">
                    {experienceLevels.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setExperience(item.value)}
                        className={`w-full rounded-2xl border p-3 text-left text-sm transition ${
                          experience === item.value ? "border-[#8a5f2e] bg-[#efe2cb]" : "border-[#dfd1bb] bg-white hover:bg-[#fff7e8]"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl bg-[#2f2a21] p-5 text-white">
                <p className="text-lg leading-8">
                  Good. The business itself is not what we are assessing today.
                </p>
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
                Stage overlay active: <span className="font-semibold">{stageLabel}</span>. Canonical scoring remains bound to the same 12 Stage 0 maturity dimensions.
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
                      <h3 className="mt-2 text-xl font-semibold leading-8">{promptForStage(dimension, stage)}</h3>
                      <p className="mt-2 text-sm leading-6 text-[#625744]">{dimension.followUp}</p>
                    </div>
                    <span className="rounded-full border border-[#dfd1bb] px-3 py-1 text-xs text-[#625744]">
                      Score {answers[dimension.qid] ?? "—"}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-3">
                    {dimension.options.map((option) => {
                      const active = answers[dimension.qid] === option.score;
                      return (
                        <button
                          type="button"
                          key={`${dimension.qid}-${option.score}`}
                          onClick={() => setAnswers((current) => ({ ...current, [dimension.qid]: option.score }))}
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
                  This prototype still does not write to Supabase. It proves the correct product structure: context capture, stage overlay, immutable Stage 0 maturity spine, and explicit avoidance of business viability judgement.
                </p>
                <div className="mt-5 rounded-3xl border border-[#dfd1bb] bg-white p-4 text-sm leading-6 text-[#625744]">
                  <p><span className="font-semibold text-[#2f2a21]">Next clean step:</span> once this flow feels right, persist context fields and move these stage prompts into Supabase as conversation variants.</p>
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
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setStage("startup");
                setIndustry("");
                setExperience("never");
                setAnswers({});
                setActiveGroupId(conversationGroups[0].id);
              }}
              className="mt-6 rounded-full border border-[#8a5f2e] px-5 py-3 text-sm font-semibold text-[#8a5f2e] transition hover:bg-[#fff7e8]"
            >
              Start again
            </button>
          </div>

          <p className="text-center text-xs leading-6 text-[#8c806b]">
            Legacy Autopsy remains available at /autopsy. This route is the conversation-first Stage 0 prototype.
          </p>
        </section>
      </section>
    </main>
  );
};

export default FirstConversation;

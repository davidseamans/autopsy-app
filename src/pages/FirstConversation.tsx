import { useMemo, useState } from "react";

type AnswerOption = {
  score: 0 | 1 | 2 | 3;
  label: string;
};

type ConversationQuestion = {
  qid: string;
  canonicalPrompt: string;
  conversationPrompt: string;
  followUp: string;
  options: AnswerOption[];
};

type ConversationGroup = {
  id: string;
  title: string;
  bridge: string;
  questions: ConversationQuestion[];
};

type Answers = Record<string, number>;

const conversationGroups: ConversationGroup[] = [
  {
    id: "money",
    title: "Money reality",
    bridge: "Let’s start with the part that usually kills the fantasy first: cash and the basic money model.",
    questions: [
      {
        qid: "CR_01",
        canonicalPrompt: "Have you estimated how long you can operate without income?",
        conversationPrompt: "If this takes longer than you hope, how long can you personally carry it before the lack of income becomes a problem?",
        followUp: "Pick the answer you and your partner can honestly defend today.",
        options: [
          { score: 0, label: "I do not know how long I can last without income." },
          { score: 1, label: "I have a rough idea, but no written cash runway." },
          { score: 2, label: "I have estimated my runway, but some costs are still uncertain." },
          { score: 3, label: "I know my cash runway and can show the numbers." },
        ],
      },
      {
        qid: "CR_02",
        canonicalPrompt: "Do you know the minimum resources required to start?",
        conversationPrompt: "What is the bare minimum you actually need to start safely — cash, tools, supplies, labour, and time?",
        followUp: "Do not include wishlist items. This is minimum viable reality.",
        options: [
          { score: 0, label: "I do not know what I need to start safely." },
          { score: 1, label: "I know the obvious items, but I have not costed them properly." },
          { score: 2, label: "I have listed the main startup costs, but there may be gaps." },
          { score: 3, label: "I know the minimum tools, supplies, setup costs, and cash needed to start." },
        ],
      },
      {
        qid: "EL_01",
        canonicalPrompt: "Can you clearly explain how this business makes money?",
        conversationPrompt: "Explain how this business makes money without using hope, enthusiasm, or vague market size claims.",
        followUp: "Revenue, costs, margin, repeat work. That is the spine.",
        options: [
          { score: 0, label: "I cannot clearly explain how the business makes money." },
          { score: 1, label: "I can explain the idea, but not the numbers behind it." },
          { score: 2, label: "I can explain revenue and costs, but the margin is not fully tested." },
          { score: 3, label: "I can show how revenue, costs, margin, and repeat sales create profit." },
        ],
      },
      {
        qid: "EL_02",
        canonicalPrompt: "Have you identified your main cost drivers?",
        conversationPrompt: "What costs will quietly eat the profit if you get them wrong?",
        followUp: "The right answer should expose the margin pressure points.",
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
    bridge: "Now move from the idea to the customer. Not who might like it — who will actually pay.",
    questions: [
      {
        qid: "MR_02",
        canonicalPrompt: "Have you clearly defined your target customer?",
        conversationPrompt: "Who exactly is the customer, what problem are they paying to remove, and why would they choose this offer?",
        followUp: "If the answer is everybody, it is not yet an answer.",
        options: [
          { score: 0, label: "I do not know exactly who the customer is." },
          { score: 1, label: "I have a broad customer type, but it is still vague." },
          { score: 2, label: "I know the likely customer, but I have not tested the offer with them properly." },
          { score: 3, label: "I can clearly name the customer type, problem, offer, and buying reason." },
        ],
      },
      {
        qid: "MR_01",
        canonicalPrompt: "What evidence do you have that customers will pay for this?",
        conversationPrompt: "What has a real customer already done that proves they will pay?",
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
    bridge: "Now test whether this is deliverable more than once, not just possible once on a good day.",
    questions: [
      {
        qid: "OP_01",
        canonicalPrompt: "Do you have the operational ability to deliver your product or service consistently?",
        conversationPrompt: "Can you actually deliver this consistently to the required standard?",
        followUp: "Skill once is not enough. Repeatable delivery is the test.",
        options: [
          { score: 0, label: "I cannot reliably deliver the service yet." },
          { score: 1, label: "I can probably do the work myself, but delivery would be inconsistent." },
          { score: 2, label: "I can deliver the work, but quality or timing still depends too much on me." },
          { score: 3, label: "I can deliver the service consistently to the required standard." },
        ],
      },
      {
        qid: "OP_02",
        canonicalPrompt: "Can you write down the steps, tools, and supplies needed to do the job the same way each time?",
        conversationPrompt: "Could someone write down the steps, tools, and supplies well enough to repeat the job the same way next time?",
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
    bridge: "Now we stop talking about the idea and look at behaviour. What have you actually done?",
    questions: [
      {
        qid: "EX_01",
        canonicalPrompt: "Have you taken any concrete action toward this business?",
        conversationPrompt: "What concrete action have you already taken that produced evidence?",
        followUp: "Thinking and research can help, but they are not the same as contact with reality.",
        options: [
          { score: 0, label: "I have not taken any real action yet." },
          { score: 1, label: "I have done thinking or research, but little real-world action." },
          { score: 2, label: "I have taken some action, but it has not produced clear evidence yet." },
          { score: 3, label: "I have taken concrete action that produced evidence I can review." },
        ],
      },
      {
        qid: "EX_02",
        canonicalPrompt: "Can you commit consistent time to this for the next 30 days?",
        conversationPrompt: "For the next 30 days, what time can you protect for this without pretending?",
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
    bridge: "Last pass: the human operator. This is not motivation theatre. It is whether the candidate can keep moving under pressure.",
    questions: [
      {
        qid: "PR_01",
        canonicalPrompt: "Are you prepared to persist through uncertainty and repeated failure without changing direction prematurely?",
        conversationPrompt: "When it gets uncertain or disappointing, are you likely to learn and persist, or keep changing direction?",
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
        canonicalPrompt: "Can you keep doing the important work even when you are tired, unsure, or not getting quick results?",
        conversationPrompt: "Can you keep doing the important work when you are tired, unsure, or not getting quick results?",
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

const totalQuestions = conversationGroups.reduce((count, group) => count + group.questions.length, 0);

const getVerdict = (score: number, answered: number) => {
  if (answered < totalQuestions) return "Verdict not ready";
  if (score <= 11) return "High risk / likely fail";
  if (score <= 20) return "Caution";
  if (score <= 29) return "Viable but exposed";
  return "Strong readiness";
};

const FirstConversation = () => {
  const [idea, setIdea] = useState("");
  const [activeGroupId, setActiveGroupId] = useState(conversationGroups[0].id);
  const [answers, setAnswers] = useState<Answers>({});

  const activeGroup = conversationGroups.find((group) => group.id === activeGroupId) ?? conversationGroups[0];
  const answeredCount = Object.keys(answers).length;
  const score = Object.values(answers).reduce((sum, value) => sum + value, 0);
  const verdict = getVerdict(score, answeredCount);

  const ideaSnippet = useMemo(() => {
    const trimmed = idea.trim();
    if (!trimmed) return "No idea captured yet.";
    return trimmed.length > 140 ? `${trimmed.slice(0, 140)}…` : trimmed;
  }, [idea]);

  const groupScore = (group: ConversationGroup) =>
    group.questions.reduce((sum, question) => sum + (answers[question.qid] ?? 0), 0);

  const groupAnswered = (group: ConversationGroup) =>
    group.questions.filter((question) => answers[question.qid] !== undefined).length;

  return (
    <main className="min-h-screen bg-[#f7f3ea] px-4 py-8 text-[#221f1a] sm:px-6 lg:px-8">
      <section className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-4 rounded-[2rem] border border-[#dfd1bb] bg-[#fffaf0] p-5 shadow-xl shadow-[#7b5a2c]/10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#8a5f2e]">Autopsy</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">First Conversation</h1>
            <p className="mt-3 text-sm leading-6 text-[#625744]">
              Casual conversation on top. Canonical 12-question scoring underneath.
            </p>
          </div>

          <div className="rounded-2xl border border-[#dfd1bb] bg-white p-4 text-sm leading-6">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#8a5f2e]">Idea</p>
            <p className="mt-2 text-[#625744]">{ideaSnippet}</p>
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
                      {answered}/{group.questions.length}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#8c806b]">Score {groupScore(group)} / {group.questions.length * 3}</p>
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl bg-[#2f2a21] p-4 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/55">Running read</p>
            <p className="mt-3 text-2xl font-semibold">{score} / {totalQuestions * 3}</p>
            <p className="mt-1 text-sm text-white/70">{answeredCount} of {totalQuestions} answered</p>
            <p className="mt-4 text-base font-semibold">{verdict}</p>
          </div>
        </aside>

        <section className="space-y-6">
          <div className="rounded-[2rem] border border-[#dfd1bb] bg-[#fffaf0] p-5 shadow-xl shadow-[#7b5a2c]/10 sm:p-8">
            <div className="mb-6 max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#8a5f2e]">Opening</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">One Conversation with Reality</h2>
              <p className="mt-4 text-base leading-7 text-[#625744]">
                No school-style questionnaire. The candidate and partner talk it through, then select the answer they can both defend.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
              <div className="max-w-[92%] rounded-3xl rounded-tl-md bg-white p-5 shadow-sm">
                <p className="text-lg leading-8">So... what’s the idea?</p>
                <p className="mt-3 text-sm leading-6 text-[#625744]">
                  Keep it plain. A couple of sentences is enough. The point is to start the conversation, not pitch.
                </p>
              </div>

              <div className="rounded-3xl rounded-tr-md bg-[#2f2a21] p-4 text-white shadow-sm">
                <textarea
                  value={idea}
                  onChange={(event) => setIdea(event.target.value)}
                  className="min-h-36 w-full resize-none bg-transparent text-base leading-7 outline-none placeholder:text-white/45"
                  placeholder="Say it the way you would over coffee."
                />
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-[#dfd1bb] bg-[#fffaf0] p-5 shadow-xl shadow-[#7b5a2c]/10 sm:p-8">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#8a5f2e]">{activeGroup.title}</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">{activeGroup.bridge}</h2>
            </div>

            <div className="space-y-6">
              {activeGroup.questions.map((question) => (
                <article key={question.qid} className="rounded-3xl border border-[#dfd1bb] bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#8a5f2e]">{question.qid}</p>
                      <h3 className="mt-2 text-xl font-semibold leading-8">{question.conversationPrompt}</h3>
                      <p className="mt-2 text-sm leading-6 text-[#625744]">{question.followUp}</p>
                    </div>
                    <span className="rounded-full border border-[#dfd1bb] px-3 py-1 text-xs text-[#625744]">
                      Canonical score {answers[question.qid] ?? "—"}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-3">
                    {question.options.map((option) => {
                      const active = answers[question.qid] === option.score;
                      return (
                        <button
                          type="button"
                          key={`${question.qid}-${option.score}`}
                          onClick={() => setAnswers((current) => ({ ...current, [question.qid]: option.score }))}
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
                    <summary className="cursor-pointer font-semibold text-[#2f2a21]">Canonical question</summary>
                    <p className="mt-2">{question.canonicalPrompt}</p>
                  </details>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-[#dfd1bb] bg-[#fffaf0] p-5 shadow-xl shadow-[#7b5a2c]/10 sm:p-8">
            <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#8a5f2e]">Conversation readout</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight">The verdict should almost fall out here.</h2>
                <p className="mt-4 text-base leading-7 text-[#625744]">
                  This prototype does not write to Supabase yet. It proves the screen behaviour: natural conversation, subject order, complete canonical coverage, and visible answer binding.
                </p>
              </div>
              <div className="rounded-3xl bg-[#2f2a21] p-5 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/55">Provisional verdict</p>
                <p className="mt-3 text-xl font-semibold">{verdict}</p>
                <p className="mt-3 text-sm leading-6 text-white/70">
                  {answeredCount < totalQuestions
                    ? `${totalQuestions - answeredCount} unanswered items remain.`
                    : "All canonical items answered."}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setIdea("");
                setAnswers({});
                setActiveGroupId(conversationGroups[0].id);
              }}
              className="mt-6 rounded-full border border-[#8a5f2e] px-5 py-3 text-sm font-semibold text-[#8a5f2e] transition hover:bg-[#fff7e8]"
            >
              Start again
            </button>
          </div>

          <p className="text-center text-xs leading-6 text-[#8c806b]">
            Legacy Autopsy remains available at /autopsy. This route is the conversation-first prototype.
          </p>
        </section>
      </section>
    </main>
  );
};

export default FirstConversation;

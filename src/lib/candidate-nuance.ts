export type CandidateAnswerEvidence = {
  questionNumber: number | null;
  dimensionCode: string | null;
  prompt: string | null;
  selectedAnswer: string | null;
  score: number | null;
};

export type CandidateNuance = {
  title: string;
  fieldTitle?: string;
  finding: string;
  consequence: string;
  work: string;
  evidence: string;
  caution: string;
  carryQuestion?: string;
};

type SubjectNuance = Omit<CandidateNuance, "finding"> & {
  findings: [string, string, string, string];
};

const SUBJECT_NUANCE: Record<string, SubjectNuance> = {
  "have you estimated how long you can operate without income?": {
    title: "Your personal cash runway needs proof",
    findings: [
      "Your answer does not yet show how long your household could cope if customers and income arrive slowly.",
      "You have a rough sense of your runway, but not enough written evidence to know where the limit really is.",
      "You have estimated your runway, although uncertain costs could still shorten it when pressure arrives.",
      "You showed a defined cash runway supported by numbers you can inspect.",
    ],
    consequence: "Without a known runway, a quiet month can turn an ordinary start-up delay into personal borrowing, rushed pricing or pressure to accept unsuitable work.",
    work: "Write a household survival budget for a slow-income period and calculate the date at which continuing would begin to endanger essential commitments.",
    evidence: "A dated runway calculation covering essential household costs, available cash, expected delays and a firm stop-loss point.",
    caution: "Do not count hoped-for sales, unused credit or money committed to essential living costs as available runway.",
  },
  "do you know the minimum resources required to start?": {
    title: "Your minimum start-up requirement needs proof",
    findings: [
      "Your answer does not yet show what is actually required to begin safely and deliver the first job.",
      "You know the obvious items, but uncosted gaps could still appear after money has been committed.",
      "You have identified the main requirements, although the list still needs checking against a real cleaning job.",
      "You showed a defined minimum start-up requirement covering tools, supplies, setup costs and working cash.",
    ],
    consequence: "An incomplete start-up list creates surprise purchases, delays and false confidence about how much money can safely remain available for the household.",
    work: "Build the smallest complete start-up list for one real cleaning job, including tools, chemicals, safety items, transport, insurance, registration and working cash.",
    evidence: "A priced minimum-start list checked against an actual job sequence, with optional purchases clearly separated from essentials.",
    caution: "Do not buy a full professional setup before proving which items the first jobs genuinely require.",
  },
  "can you clearly explain how this business makes money?": {
    title: "The profit mechanism needs proof",
    findings: [
      "Your answer does not yet show a clear connection between work performed, money received, direct costs and money left over.",
      "You can describe the service, but the commercial mechanism behind it remains too vague to rely on.",
      "You understand revenue and costs in principle, although the margin has not yet been tested against realistic work.",
      "You showed how revenue, direct costs, margin and repeat work combine to produce profit.",
    ],
    consequence: "A person can stay busy, collect cash and still lose money if the mechanism producing profit is not understood before quoting.",
    work: "Explain one realistic job from lead to payment: price, labour time, direct costs, gross margin and what would make the job worth repeating.",
    evidence: "A plain-English job example whose arithmetic shows where the money is made and which Five Ways multiplier would improve it.",
    caution: "Do not treat turnover, bank balance or being busy as evidence that the work is profitable.",
  },
  "have you identified your main cost drivers?": {
    title: "The costs that control each job need proof",
    findings: [
      "Your answer does not yet identify the costs most likely to consume the quoted price.",
      "You recognise some costs, but important items may still be missing from the job calculation.",
      "You have listed the main costs, although they have not yet been checked against completed work.",
      "You showed the main cost drivers and how they affect the money left from each job.",
    ],
    consequence: "Labour time, travel, chemicals, rework and small omissions can quietly erase the margin even when the customer pays the quoted price.",
    work: "Cost several realistic cleaning jobs line by line, including labour time, travel, supplies, parking, rework and the effect of a job running over.",
    evidence: "Completed job-cost examples showing quoted price, each direct cost and the resulting gross margin percentage.",
    caution: "Do not copy a competitor's price or add a casual markup without knowing the costs underneath it.",
  },
  "what evidence do you have that customers will pay for this?": {
    title: "Willingness to pay needs real evidence",
    findings: [
      "Your answer does not yet provide evidence that a customer will exchange money for the proposed service.",
      "Positive comments exist, but polite encouragement is not yet a buying decision.",
      "There are useful signs of demand, although paid or committed evidence remains limited.",
      "You showed payment, commitment or strong buying evidence from real prospective customers.",
    ],
    consequence: "Interest that never becomes a quote request or payment can encourage spending on a service that has not earned a market.",
    work: "Put a specific cleaning offer and realistic price in front of prospective customers who are free to decline.",
    evidence: "A small record of genuine enquiries, quote requests, accepted quotes, deposits or paid work from outside the immediate circle.",
    caution: "Do not count compliments, social-media reactions or promises from friends as proof of demand.",
  },
  "have you clearly defined your target customer?": {
    title: "The first customer needs a sharper definition",
    findings: [
      "Your answer does not yet identify who the first suitable customer is or why that person would choose the service.",
      "You have a broad customer type, but it is still too vague to guide the offer, message or price.",
      "You know the likely customer, although the offer has not yet been properly tested with that group.",
      "You showed a clear customer, problem, offer and reason to buy.",
    ],
    consequence: "Trying to serve everyone makes the offer generic, wastes lead effort and makes genuine demand harder to recognise.",
    work: "Define one first customer group, the cleaning problem they already recognise, the result offered and the reason they would choose it now.",
    evidence: "A specific customer-and-offer statement confirmed through conversations or quote requests from people matching that description.",
    caution: "Do not broaden the target merely to make the apparent market feel larger.",
  },
  "do you have the operational ability to deliver your product or service consistently?": {
    title: "Practical delivery capability needs proof",
    findings: [
      "Your answer does not yet show that the promised cleaning service can be delivered reliably.",
      "You may be able to perform the work, but quality or timing would currently be inconsistent.",
      "You can deliver the work, although the result still depends too heavily on personal effort or favourable conditions.",
      "You showed that the service can be delivered consistently to the required standard.",
    ],
    consequence: "A sale creates an obligation. Inconsistent quality, lateness or a job taking far longer than quoted can damage trust before the operation has room to recover.",
    work: "Complete realistic or supervised cleaning work to a defined standard while timing the job and checking the result.",
    evidence: "Repeated examples completed within a credible time, to a consistent standard, with defects identified and corrected.",
    caution: "Do not sell a standard or timetable that has only been achieved once or under ideal conditions.",
  },
  "can you write down the steps, tools, and supplies needed to do the job the same way each time?": {
    title: "A repeatable cleaning method needs proof",
    findings: [
      "Your answer shows that the job is still being worked out as you go rather than delivered through a repeatable method.",
      "You know the main steps, but the method is not yet clear enough to reproduce consistently.",
      "The steps and supplies are mostly identified, although the method still needs testing and correction.",
      "You showed a written, repeatable sequence covering the steps, tools and supplies required.",
    ],
    consequence: "Working from memory causes missed tasks, variable quality, forgotten supplies and job times that cannot be quoted or improved reliably.",
    work: "Write and test a simple job sequence covering arrival, assessment, cleaning order, tools, chemicals, quality check and customer handover.",
    evidence: "A checklist used on repeated trials and revised when a missed step, supply or timing problem is discovered.",
    caution: "Do not mistake a document written from imagination for a method proven through use.",
  },
  "have you taken any concrete action toward this business?": {
    title: "Intention needs to become observable action",
    findings: [
      "Your answer does not yet show action outside thinking, planning or imagining the business.",
      "Research has begun, but little has happened that could produce real-world evidence.",
      "Some concrete action has occurred, although it has not yet produced enough evidence to guide the next decision.",
      "You showed concrete action that produced evidence capable of being reviewed.",
    ],
    consequence: "Planning can create the feeling of progress while postponing the customer contact, job testing and decisions that reveal whether readiness is real.",
    work: "Complete one small, reversible action that exposes an assumption to reality, such as testing a job process or presenting an offer to a genuine prospect.",
    evidence: "A dated record of what was done, what happened, what was learned and what decision changed as a result.",
    caution: "Do not count more research, branding or equipment shopping as action unless it tests a material assumption.",
  },
  "can you commit consistent time to this for the next 30 days?": {
    title: "A dependable work rhythm needs proof",
    findings: [
      "Your answer does not yet show regular time available for the work required over the next month.",
      "Time may be available, but there is no reliable schedule protecting it from ordinary interruptions.",
      "You have allocated time, although the rhythm has not yet been sustained under normal life pressure.",
      "You showed a realistic 30-day work rhythm that can be protected and followed.",
    ],
    consequence: "Irregular effort leaves calls unanswered, quotes unfinished and records behind—the small failures that make customers experience the operator as unreliable.",
    work: "Protect a modest daily or weekly operating rhythm for 30 days and close each promised task before adding another.",
    evidence: "A four-week record of planned sessions, completed commitments and honest explanations for any missed work.",
    caution: "Do not design a heroic schedule that cannot survive tiredness, existing work or household obligations.",
  },
  "are you prepared to persist through uncertainty and repeated failure without changing direction prematurely?": {
    title: "Your response to setbacks needs proof",
    findings: [
      "Your answer suggests that difficulty or early failure may cause you to stop or change direction before useful evidence has accumulated.",
      "You can tolerate some uncertainty, but setbacks may still knock decisions off course.",
      "You generally stay with the plan, although strong reactions to setbacks could still produce premature changes.",
      "You showed an ability to learn from setbacks and continue without changing direction impulsively.",
    ],
    consequence: "Early cleaning work will contain rejection, mistakes and uneven demand. Reacting to each setback can destroy the learning sequence before a pattern becomes visible.",
    work: "Use a simple review rule for setbacks: record what happened, separate one event from a pattern, and decide only after the agreed evidence period.",
    evidence: "Examples where disappointment was handled calmly, learning was recorded and the next action followed evidence rather than emotion.",
    caution: "Do not make a large commitment merely to trap yourself into persisting.",
  },
  "can you keep doing the important work even when you are tired, unsure, or not getting quick results?": {
    title: "Dependability under discomfort needs proof",
    findings: [
      "Your answer does not yet show that important work continues when energy, confidence or quick rewards disappear.",
      "You can continue for short periods, but effort becomes inconsistent when the work is uncomfortable.",
      "You usually keep working, although pressure can still break the rhythm.",
      "You showed that important work continues even when it is repetitive, uncertain or uncomfortable.",
    ],
    consequence: "Customers experience missed calls, late quotes and incomplete promises—not the operator's private reasons for losing momentum.",
    work: "Practise completing a small set of important commitments on low-motivation days before taking on additional work.",
    evidence: "A sustained record showing that calls, quotes, records and promised tasks were completed during ordinary tired or uncertain periods.",
    caution: "Do not rely on enthusiasm, urgency or fear to supply the discipline that a routine must carry.",
  },
};

const SUBJECT_CARRY_QUESTION: Record<string, string> = {
  "have you estimated how long you can operate without income?":
    "How many weeks could your household manage if cleaning income starts slowly?",
  "do you know the minimum resources required to start?":
    "What do you actually need before the first job—and what can safely wait?",
  "can you clearly explain how this business makes money?":
    "After paying the direct costs of one job, how much money is really left?",
  "have you identified your main cost drivers?":
    "Which costs could turn a good-looking cleaning job into a poor one?",
  "what evidence do you have that customers will pay for this?":
    "Will a real customer accept your price—not merely say the idea sounds good?",
  "have you clearly defined your target customer?":
    "Which type of customer is most likely to say yes to your offer first?",
  "do you have the operational ability to deliver your product or service consistently?":
    "Can you complete the promised job on time, to standard and without expensive surprises?",
  "can you write down the steps, tools, and supplies needed to do the job the same way each time?":
    "Can you use the same simple checklist and achieve the same result again?",
  "have you taken any concrete action toward this business?":
    "What real step will you take next that can teach you something useful?",
  "can you commit consistent time to this for the next 30 days?":
    "What small work routine can you genuinely keep for the next 30 days?",
  "are you prepared to persist through uncertainty and repeated failure without changing direction prematurely?":
    "When something goes wrong, can you pause, learn and continue without reacting too quickly?",
  "can you keep doing the important work even when you are tired, unsure, or not getting quick results?":
    "Will the calls, quotes and records still get done on an ordinary difficult day?",
};

const SUBJECT_FIELD_TITLE: Record<string, string> = {
  "have you estimated how long you can operate without income?": "Know how long your household money will last",
  "do you know the minimum resources required to start?": "Know what you need before your first job",
  "can you clearly explain how this business makes money?": "Know what each job actually leaves behind",
  "have you identified your main cost drivers?": "Know which costs can swallow a cleaning job",
  "what evidence do you have that customers will pay for this?": "Find out whether a real customer will pay",
  "have you clearly defined your target customer?": "Know who your first likely customer is",
  "do you have the operational ability to deliver your product or service consistently?": "Make sure you can deliver what you promise",
  "can you write down the steps, tools, and supplies needed to do the job the same way each time?": "Make the cleaning work repeatable",
  "have you taken any concrete action toward this business?": "Turn intention into one real step",
  "can you commit consistent time to this for the next 30 days?": "Build a work routine you can genuinely keep",
  "are you prepared to persist through uncertainty and repeated failure without changing direction prematurely?": "Do not let one setback change your direction",
  "can you keep doing the important work even when you are tired, unsure, or not getting quick results?": "Keep the important promises on difficult days",
};

const COMPOUND_NUANCE: Record<string, CandidateNuance> = {
  cash_reality: {
    title: "Both start-up preparation and cash runway need proof",
    fieldTitle: "Do not let starting costs consume your household safety money",
    finding: "Your answers leave both the cost of beginning and the household's ability to survive slow income insufficiently proven.",
    consequence: "These weaknesses compound: underestimated setup costs consume the same cash buffer needed to withstand a slow start.",
    work: "Price the smallest complete start-up requirement, then place that amount inside a household runway calculation with a firm stop-loss point.",
    evidence: "One joined plan showing essential start-up costs, protected household money, available working cash and the date at which continuing would become unsafe.",
    caution: "Do not buy equipment, resign or borrow until the start-up requirement and survival runway can be seen together.",
    carryQuestion: "Can the start-up list fit safely inside your household runway without putting essential commitments at risk?",
  },
  economic_literacy: {
    title: "Both the profit mechanism and job costs need proof",
    fieldTitle: "Make sure a busy cleaning job still leaves money behind",
    finding: "Your answers do not yet connect how the service makes money with the costs most likely to consume that money.",
    consequence: "These weaknesses compound: an unclear profit model cannot expose a missing cost, and missing costs make an apparently profitable model unreliable.",
    work: "Build several complete job examples showing price, labour, every direct cost, gross margin and the effect of a job running over.",
    evidence: "Job-cost records whose arithmetic explains both how profit is created and which costs can destroy it.",
    caution: "Do not use turnover, a competitor's price or cash received as a substitute for job-level economics.",
    carryQuestion: "After every direct job cost is counted, is there still enough money left to make the work worthwhile?",
  },
  market_reality: {
    title: "Both the target customer and willingness to pay need proof",
    fieldTitle: "Put one clear offer in front of one likely customer",
    finding: "Your answers do not yet identify a precise first customer or demonstrate that such customers will pay for the offer.",
    consequence: "These weaknesses compound: vague targeting produces weak demand tests, and weak demand tests provide no reason to sharpen the target.",
    work: "Define one first customer and one priced cleaning offer, then present it to genuine prospects who can freely decline.",
    evidence: "A record linking a clearly defined customer group to enquiries, quote requests, accepted quotes or payments.",
    caution: "Do not expand the audience or count friendly encouragement when the specific offer fails to produce buying behaviour.",
    carryQuestion: "Will the particular customer you are targeting accept the particular offer and price you put forward?",
  },
  operational_capacity: {
    title: "Both delivery capability and repeatability need proof",
    fieldTitle: "Make sure your cleaning method works more than once",
    finding: "Your answers do not yet show either dependable practical delivery or a method capable of producing the same result repeatedly.",
    consequence: "These weaknesses compound: an unproven method hides delivery problems, while inconsistent delivery prevents the method from being improved.",
    work: "Write the cleaning sequence, then use it on repeated timed trials with a defined quality check and correction record.",
    evidence: "A tested checklist plus repeated work completed to a consistent standard within a credible time.",
    caution: "Do not sell work based on a method that has not survived repeated use.",
    carryQuestion: "Can your cleaning method produce the promised result repeatedly, within the time allowed?",
  },
  execution_discipline: {
    title: "Both concrete action and sustained follow-through need proof",
    fieldTitle: "Turn one real action into a routine you can keep",
    finding: "Your answers do not yet show enough real-world action or a dependable rhythm capable of carrying that action for a month.",
    consequence: "These weaknesses compound: occasional action produces little evidence, while an unproven routine cannot convert lessons into consistent progress.",
    work: "Choose a small weekly set of customer, job and record commitments and complete them through a protected 30-day rhythm.",
    evidence: "A dated four-week record of actions completed, evidence produced and promises closed out.",
    caution: "Do not replace execution with more planning, branding, research or an unsustainable burst of effort.",
    carryQuestion: "Can you turn a small real action into a routine you keep for a full month?",
  },
  psychological_resilience: {
    title: "Both setback response and everyday persistence need proof",
    fieldTitle: "Stay steady when the work becomes difficult",
    finding: "Your answers do not yet show that you can remain deliberate after setbacks or dependable when the work becomes tiring and unrewarding.",
    consequence: "These weaknesses compound: setbacks disturb judgement, then broken routine prevents the steady action needed to learn and recover.",
    work: "Use a modest operating routine alongside a written setback-review rule during a low-risk period of real or representative work.",
    evidence: "Examples showing calm review after problems and continued completion of important commitments during uncomfortable periods.",
    caution: "Do not create financial pressure in an attempt to manufacture commitment or resilience.",
    carryQuestion: "Can you respond calmly to setbacks and still complete the ordinary work that customers are relying on?",
  },
};

function normalizePrompt(prompt: string | null): string {
  return String(prompt ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function scoreIndex(score: number | null): 0 | 1 | 2 | 3 {
  const numeric = Number(score);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  if (numeric >= 3) return 3;
  return numeric === 1 ? 1 : 2;
}

export function buildCandidateNuance(
  dimensionCode: string,
  answers: CandidateAnswerEvidence[],
): CandidateNuance | null {
  const recognised = answers
    .map((answer) => ({
      answer,
      subject: SUBJECT_NUANCE[normalizePrompt(answer.prompt)],
    }))
    .filter((entry): entry is { answer: CandidateAnswerEvidence; subject: SubjectNuance } => Boolean(entry.subject))
    .sort(
      (a, b) =>
        Number(a.answer.score ?? 99) - Number(b.answer.score ?? 99) ||
        Number(a.answer.questionNumber ?? 99) - Number(b.answer.questionNumber ?? 99),
    );

  const weak = recognised.filter(({ answer }) => Number(answer.score) < 3);
  if (weak.length >= 2 && COMPOUND_NUANCE[dimensionCode]) {
    return COMPOUND_NUANCE[dimensionCode];
  }

  const focus = weak[0] ?? recognised[0];
  if (!focus) return null;

  return {
    title: focus.subject.title,
    fieldTitle: SUBJECT_FIELD_TITLE[normalizePrompt(focus.answer.prompt)],
    finding: focus.subject.findings[scoreIndex(focus.answer.score)],
    consequence: focus.subject.consequence,
    work: focus.subject.work,
    evidence: focus.subject.evidence,
    caution: focus.subject.caution,
    carryQuestion: SUBJECT_CARRY_QUESTION[normalizePrompt(focus.answer.prompt)],
  };
}

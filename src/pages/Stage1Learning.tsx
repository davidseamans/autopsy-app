import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Circle,
  Loader2,
  LockKeyhole,
  MessageSquareText,
  RotateCcw,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import {
  fetchStage1LearningProgress,
  saveStage1LessonCompletion,
  type Stage1LessonProgress,
} from "@/lib/stage1Learning";
import {
  calculateChargeOutRate,
  calculatePriceCutConsequence,
  type ChargeOutRateInputs,
} from "@/lib/stage1ChargeOutRate";

type QuizQuestion = {
  prompt: string;
  options: { key: string; label: string }[];
  correct: string;
  explanation: string;
};

type Lesson = {
  key: string;
  version: number;
  number: number;
  title: string;
  promise: string;
  duration: string;
  available: boolean;
  sections?: { title: string; body: string; script?: string; points?: string[] }[];
  quiz?: QuizQuestion[];
  interactive?: "charge_out_rate";
};

const lessons: Lesson[] = [
  {
    key: "first_leads",
    version: 1,
    number: 1,
    title: "Where your first leads are",
    promise: "Recognise nearby opportunities and record where each approach came from.",
    duration: "6 minutes",
    available: true,
    sections: [
      {
        title: "Start close to the front door",
        body: "You do not need a large advertising campaign to find your first five jobs. Homes, apartments and workplaces all need cleaning. Begin with people and places that can already see whether you are reliable.",
        points: ["People who already know you", "Past customers and work contacts", "Neighbours and local community contacts", "Nearby businesses and property contacts", "Introductions and referrals"],
      },
      {
        title: "A referral is a lead source",
        body: "Record whether the introduction came from a customer or from someone in your personal network. That lets you learn what is producing genuine opportunities without building a complicated CRM.",
      },
      {
        title: "Do not buy attention before using what you have",
        body: "Work the warm opportunities first. A small number of thoughtful conversations is more useful than paying for advertising before you know how to present the service, inspect the work and quote it properly.",
      },
    ],
    quiz: [
      {
        prompt: "Which is the best first action for a new operator?",
        options: [{ key: "a", label: "Buy a large online advertising campaign" }, { key: "b", label: "List nearby people and places where a genuine cleaning need may exist" }, { key: "c", label: "Buy equipment for every possible type of job" }],
        correct: "b",
        explanation: "Start with visible opportunities and booked needs before committing money.",
      },
      {
        prompt: "A past customer introduces you to a neighbour. How should the lead source be recorded?",
        options: [{ key: "a", label: "Customer referral" }, { key: "b", label: "Walk-in" }, { key: "c", label: "Other" }],
        correct: "a",
        explanation: "The source is the customer who made the introduction.",
      },
      {
        prompt: "Why record lead methods in First 5 Jobs?",
        options: [{ key: "a", label: "To create a full customer database" }, { key: "b", label: "To judge people who do not buy" }, { key: "c", label: "To learn which activities produce genuine enquiries" }],
        correct: "c",
        explanation: "The record is deliberately simple: activity, source and result.",
      },
    ],
  },
  {
    key: "what_to_say",
    version: 1,
    number: 2,
    title: "What to say",
    promise: "Use short, natural scripts that open a conversation without sounding rehearsed.",
    duration: "7 minutes",
    available: true,
    sections: [
      {
        title: "Personal contact",
        body: "Tell people clearly what you are doing and make the next step easy.",
        script: "I’ve started a cleaning business and I’m taking on my first customers. If you—or someone you know—needs dependable cleaning, I’d be happy to have a look and prepare a proper quote.",
      },
      {
        title: "Ask for a referral",
        body: "Do not pressure the person to buy. Ask for an introduction to someone who may genuinely need the service.",
        script: "You may not need a cleaner yourself, but do you know one person who might? An introduction would help me start the conversation properly.",
      },
      {
        title: "Approach a local business or property contact",
        body: "Lead with a useful question. Do not make claims about a site you have not inspected.",
        script: "Hi, I’m working locally and taking on a small number of cleaning customers. Who looks after your cleaning arrangements, and would it be useful for me to introduce myself and arrange a site visit?",
      },
      {
        title: "The objective",
        body: "Your first conversation is not the quote and it is not a performance. The objective is permission for the next sensible step: an introduction, a site visit or a clear no.",
      },
    ],
    quiz: [
      {
        prompt: "What is the main objective of the first lead conversation?",
        options: [{ key: "a", label: "Close the job immediately at any price" }, { key: "b", label: "Secure the next sensible step" }, { key: "c", label: "Explain every cleaning service you might offer" }],
        correct: "b",
        explanation: "A useful next step may be an introduction, site visit or permission to quote.",
      },
      {
        prompt: "Which referral request is strongest?",
        options: [{ key: "a", label: "Give me the phone numbers of everyone you know" }, { key: "b", label: "Please post my advertisement everywhere" }, { key: "c", label: "Do you know one person who may need dependable cleaning?" }],
        correct: "c",
        explanation: "One relevant introduction is plain, respectful and easy to act upon.",
      },
      {
        prompt: "What should you do before making detailed claims about a site?",
        options: [{ key: "a", label: "Inspect it and understand the work" }, { key: "b", label: "Promise the lowest price" }, { key: "c", label: "Assume it is similar to the last job" }],
        correct: "a",
        explanation: "Inspection protects the customer, the scope and your price.",
      },
    ],
  },
  {
    key: "presentation_before_discounting",
    version: 1,
    number: 3,
    title: "Present well—do not compete by being cheap",
    promise: "Protect the price by improving trust and presentation.",
    duration: "7 minutes",
    available: true,
    sections: [
      {
        title: "The customer is buying confidence",
        body: "A customer is not only buying hours of cleaning. They are deciding whether you will arrive, understand the work, respect the property and finish what was agreed. Clear communication and a professional quote make the price easier to trust.",
        points: ["Arrive when you said you would", "Ask sensible questions", "Take useful notes", "Explain what is included", "Send a clear written quote"],
      },
      {
        title: "Do not make cheap your main offer",
        body: "A low price can win the wrong job and leave too little money to complete it properly. The price you establish now may follow you for some time. Improve the presentation before cutting the price.",
      },
      {
        title: "If the customer questions the price",
        body: "Stay calm and explain the work behind the quote. If the customer needs a lower total, change the scope clearly instead of quietly doing the same work for less.",
        script: "I understand you are watching the cost. This price covers the work we discussed and the time needed to do it properly. If you would like a lower total, we can look at which parts of the work should be removed or done less often.",
      },
      {
        title: "Presentation is practical",
        body: "Professional does not mean expensive clothes or a complicated sales performance. It means being prepared, dependable and clear enough that the customer knows what will happen next.",
      },
    ],
    quiz: [
      {
        prompt: "A customer says the quote is higher than expected. What is the best first response?",
        options: [{ key: "a", label: "Immediately cut the price" }, { key: "b", label: "Explain the scope and discuss changing the work if the total must fall" }, { key: "c", label: "Tell the customer cheaper cleaners are unreliable" }],
        correct: "b",
        explanation: "Protect the price by explaining the work. If the total changes, the scope should change clearly as well.",
      },
      {
        prompt: "Which action does most to support a professional price?",
        options: [{ key: "a", label: "A clear inspection and written quote" }, { key: "b", label: "Promising to beat every competitor" }, { key: "c", label: "Buying equipment before any job is booked" }],
        correct: "a",
        explanation: "Preparation, clarity and follow-through give the customer a reason to trust the quote.",
      },
      {
        prompt: "What is the main risk of making cheap your selling point?",
        options: [{ key: "a", label: "The customer may ask too many questions" }, { key: "b", label: "The quote may look too professional" }, { key: "c", label: "The job may not leave enough money to deliver properly and continue" }],
        correct: "c",
        explanation: "A job that cannot support proper delivery is not a useful foundation for the business.",
      },
    ],
  },
  {
    key: "charge_out_rate",
    version: 1,
    number: 4,
    title: "Your work rate is not your charge-out rate",
    promise: "Build a rate that pays for the work and the business around it.",
    duration: "8 minutes",
    available: true,
    interactive: "charge_out_rate",
    sections: [
      {
        title: "Your wage is only one part of the price",
        body: "The amount you want to earn for an hour of cleaning is your work rate. The customer charge must also help pay for the business around that hour. That customer charge is your charge-out rate.",
      },
      {
        title: "What the charge-out rate carries",
        body: "Not every working hour can be billed to a customer. Travel, quoting, messages, buying supplies, bookkeeping and gaps between jobs still consume time or money.",
        points: ["Your pay for doing the work", "Unbilled business time", "Travel and vehicle costs", "Supplies and equipment", "Insurance, administration and tax obligations", "A margin that lets the business continue"],
      },
      {
        title: "Use the quote to test the total",
        body: "Estimate the hours honestly, apply the charge-out rate, and then look at the whole quote. Ask whether the price covers the work, the supplies and the responsibility you are accepting. First 5 Jobs helps you compare the estimate with what actually happened.",
      },
      {
        title: "A simple example",
        body: "If you want to earn $35 for each hour you clean, charging the customer $35 leaves nothing for the business around the job. The correct charge-out rate must be higher. The exact rate depends on your costs and the work; the principle does not change.",
      },
      {
        title: "Do not hide a weak rate with more hours",
        body: "Working longer does not repair a price that was too low. Start with a considered rate, record the result, and improve it from the first five jobs instead of guessing forever.",
      },
    ],
    quiz: [
      {
        prompt: "What is the difference between a work rate and a charge-out rate?",
        options: [{ key: "a", label: "There is no difference" }, { key: "b", label: "The work rate is what you want to earn; the charge-out rate must also carry business costs and margin" }, { key: "c", label: "The charge-out rate is always the competitor’s price" }],
        correct: "b",
        explanation: "The customer rate has to support both the person doing the work and the business that makes the work possible.",
      },
      {
        prompt: "Which time is usually not billed directly to one cleaning customer?",
        options: [{ key: "a", label: "Cleaning the customer’s floors" }, { key: "b", label: "Cleaning the customer’s windows when quoted" }, { key: "c", label: "Preparing quotes and organising supplies" }],
        correct: "c",
        explanation: "Unbilled business time still has to be supported by the work the business sells.",
      },
      {
        prompt: "You want to earn $35 per cleaning hour. Why is charging exactly $35 risky?",
        options: [{ key: "a", label: "It leaves nothing for the costs and unbilled work around the job" }, { key: "b", label: "Customers only accept round numbers" }, { key: "c", label: "Every cleaning job must use the same rate" }],
        correct: "a",
        explanation: "A sustainable quote must carry more than the operator’s desired hourly pay.",
      },
    ],
  },
  { key: "inspect_and_quote", version: 1, number: 5, title: "Inspect and prepare the quote", promise: "Define the work before promising a price.", duration: "Coming next", available: false },
  { key: "follow_up", version: 1, number: 6, title: "Follow up and ask for the job", promise: "Follow up clearly and give the customer an easy decision.", duration: "Coming next", available: false },
  { key: "rejected_quote", version: 1, number: 7, title: "If the quote is rejected", promise: "Ask for useful feedback without arguing or discounting automatically.", duration: "Coming next", available: false },
  { key: "complete_professionally", version: 1, number: 8, title: "Complete the job professionally", promise: "Finish the records, invoice and referral request properly.", duration: "Coming next", available: false },
];

export default function Stage1Learning() {
  const [searchParams] = useSearchParams();
  const runId = searchParams.get("runId") ?? "";
  const [progress, setProgress] = useState<Stage1LessonProgress[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) {
      setError("Return to First 5 Jobs and open the learning library from there.");
      setLoading(false);
      return;
    }
    void fetchStage1LearningProgress(runId)
      .then(setProgress)
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setLoading(false));
  }, [runId]);

  const completed = useMemo(() => new Map(progress.map((item) => [item.lessonKey, item])), [progress]);
  const score = selectedLesson?.quiz?.reduce((total, question, index) => total + (answers[index] === question.correct ? 1 : 0), 0) ?? 0;
  const quizCount = selectedLesson?.quiz?.length ?? 0;
  const passed = quizCount > 0 && score >= Math.ceil(quizCount * 0.67);

  function openLesson(lesson: Lesson) {
    if (!lesson.available) return;
    setSelectedLesson(lesson);
    setAnswers({});
    setSubmitted(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function completeLesson() {
    if (!selectedLesson || !passed) return;
    setSaving(true);
    try {
      const saved = await saveStage1LessonCompletion({ runId, lessonKey: selectedLesson.key, lessonVersion: selectedLesson.version, quizScore: score });
      setProgress((current) => [...current.filter((item) => item.lessonKey !== saved.lessonKey), saved]);
      toast.success("Lesson complete.");
      setSelectedLesson(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Lesson completion could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="container max-w-4xl py-12 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading the learning library…</div>;

  if (selectedLesson) {
    return <main className="container max-w-4xl py-10 space-y-6">
      <Button variant="ghost" className="-ml-3" onClick={() => setSelectedLesson(null)}><ArrowLeft className="mr-2 h-4 w-4" /> Back to course</Button>
      <header className="space-y-2"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Lesson {selectedLesson.number} · {selectedLesson.duration}</p><h1 className="text-3xl font-semibold tracking-tight">{selectedLesson.title}</h1><p className="text-muted-foreground">{selectedLesson.promise}</p></header>
      <Card className="border-sky-200 bg-sky-50/40"><CardHeader><CardTitle className="flex items-center gap-2"><MessageSquareText className="h-5 w-5 text-sky-700" /> Jane’s practical briefing</CardTitle><CardDescription>Read this lesson at your own pace. Audio and field demonstrations can be added without changing the lesson record.</CardDescription></CardHeader></Card>
      {selectedLesson.sections?.map((section) => <Card key={section.title}><CardHeader><CardTitle className="text-xl">{section.title}</CardTitle></CardHeader><CardContent className="space-y-4 text-sm leading-6"><p>{section.body}</p>{section.points ? <ul className="list-disc space-y-2 pl-5">{section.points.map((point) => <li key={point}>{point}</li>)}</ul> : null}{section.script ? <blockquote className="rounded-lg border-l-4 border-sky-600 bg-sky-50 p-4 text-base font-medium leading-7">“{section.script}”</blockquote> : null}</CardContent></Card>)}
      {selectedLesson.interactive === "charge_out_rate" ? <ChargeOutRateExercise /> : null}
      <Card><CardHeader><CardTitle>Quick check</CardTitle><CardDescription>Choose the best practical answer. Two correct answers out of three completes the lesson.</CardDescription></CardHeader><CardContent className="space-y-6">{selectedLesson.quiz?.map((question, index) => <div key={question.prompt} className="space-y-3"><p className="font-medium">{index + 1}. {question.prompt}</p><RadioGroup value={answers[index] ?? ""} onValueChange={(value) => setAnswers((current) => ({ ...current, [index]: value }))}>{question.options.map((option) => <Label key={option.key} htmlFor={`${selectedLesson.key}-${index}-${option.key}`} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/40"><RadioGroupItem id={`${selectedLesson.key}-${index}-${option.key}`} value={option.key} className="mt-0.5" /><span>{option.label}</span></Label>)}</RadioGroup>{submitted ? <p className={`text-sm ${answers[index] === question.correct ? "text-emerald-700" : "text-amber-700"}`}>{answers[index] === question.correct ? "Correct. " : "Not quite. "}{question.explanation}</p> : null}</div>)}
        {!submitted ? <Button onClick={() => setSubmitted(true)} disabled={Object.keys(answers).length !== quizCount}>Check my answers</Button> : passed ? <div className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-emerald-800">You understood the lesson: {score} of {quizCount}</p><p className="text-sm text-emerald-700">This records lesson completion only. It does not change your Autopsy result or progression gate.</p></div><Button onClick={() => void completeLesson()} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Complete lesson</Button></div> : <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-amber-900">Review the explanations and try again.</p><p className="text-sm text-amber-800">You scored {score} of {quizCount}. Nothing negative is recorded.</p></div><Button variant="outline" onClick={() => { setAnswers({}); setSubmitted(false); }}><RotateCcw className="mr-2 h-4 w-4" /> Try again</Button></div>}
      </CardContent></Card>
    </main>;
  }

  return <main className="container max-w-5xl py-10 space-y-6">
    <Button asChild variant="ghost" className="-ml-3"><Link to={runId ? `/stage-1?runId=${encodeURIComponent(runId)}` : "/stage-1"}><ArrowLeft className="mr-2 h-4 w-4" /> Back to First 5 Jobs</Link></Button>
    <header className="space-y-3"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">First 5 Jobs · learning library</p><h1 className="text-3xl font-semibold tracking-tight">Getting Your First Five Jobs</h1><p className="max-w-3xl text-muted-foreground">Short practical lessons, scripts and checks for finding, quoting and completing your first work. Take them in order or return when the next situation arises.</p></header>
    {error ? <Card className="border-destructive/40"><CardContent className="pt-6 text-sm text-destructive">{error}</CardContent></Card> : null}
    {!error ? <>
      <div className="grid gap-4 sm:grid-cols-3"><Summary icon={BookOpen} label="Lessons" value="8" /><Summary icon={Users} label="Available now" value="4" /><Summary icon={CheckCircle2} label="Completed" value={String(completed.size)} /></div>
      <div className="space-y-3">{lessons.map((lesson) => { const completion = completed.get(lesson.key); return <Card key={lesson.key} className={!lesson.available ? "bg-muted/30" : "hover:border-sky-300"}><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#082849] font-semibold text-white">{lesson.number}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{lesson.title}</h2>{completion ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" /> Complete</span> : null}</div><p className="mt-1 text-sm text-muted-foreground">{lesson.promise}</p><p className="mt-2 text-xs text-muted-foreground">{lesson.duration}</p></div>{lesson.available ? <Button variant={completion ? "outline" : "default"} onClick={() => openLesson(lesson)}>{completion ? "Review" : "Start lesson"}<ChevronRight className="ml-2 h-4 w-4" /></Button> : <span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><LockKeyhole className="h-4 w-4" /> Planned</span>}</CardContent></Card>; })}</div>
      <p className="flex items-start gap-2 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground"><Circle className="mt-0.5 h-4 w-4 shrink-0" /> This library supports practice. Course completion is not Autopsy scoring and does not automatically admit anyone to Core.</p>
    </> : null}
  </main>;
}

function Summary({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: string }) {
  return <Card><CardContent className="flex items-center gap-3 p-4"><span className="rounded-lg bg-sky-50 p-2 text-sky-700"><Icon className="h-5 w-5" /></span><div><p className="text-2xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div></CardContent></Card>;
}

const defaultRateInputs: ChargeOutRateInputs = {
  desiredHourlyEarnings: 35,
  billableHoursPerWeek: 25,
  weeklyBusinessCosts: 300,
  unbilledHoursPerWeek: 5,
  safetyMarginPercent: 15,
};

const money = (value: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);

function ChargeOutRateExercise() {
  const [inputs, setInputs] = useState(defaultRateInputs);
  const [cutPercent, setCutPercent] = useState(20);
  const result = calculateChargeOutRate(inputs);
  const cut = calculatePriceCutConsequence(inputs, cutPercent);
  const components = [
    { label: "Pay for cleaning", value: result.cleaningPayPerBillableHour, colour: "bg-sky-600" },
    { label: "Unbilled time", value: result.unbilledTimePerBillableHour, colour: "bg-violet-500" },
    { label: "Business costs", value: result.businessCostsPerBillableHour, colour: "bg-amber-500" },
    { label: "Safety margin", value: result.safetyMarginPerBillableHour, colour: "bg-emerald-600" },
  ];
  const chartTotal = Math.max(1, result.chargeOutRateExGst);

  function update(field: keyof ChargeOutRateInputs, raw: string) {
    const value = raw === "" ? 0 : Number(raw);
    setInputs((current) => ({ ...current, [field]: Number.isFinite(value) ? Math.max(0, value) : 0 }));
  }

  return <Card className="border-violet-300 bg-violet-50/30">
    <CardHeader>
      <CardTitle>Build your working charge-out rate</CardTitle>
      <CardDescription>Change the five figures and watch where the customer rate goes. This is a learning estimate only. It will not update your quotes or save these figures.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-7">
      <div className="rounded-lg border bg-white p-4 text-sm leading-6">
        <p className="font-semibold">Worked example</p>
        <p className="mt-1 text-muted-foreground">Someone wants to earn $35 for each working hour, expects 25 billable hours and 5 unbilled business hours each week, carries $300 of weekly business costs and adds a 15% safety margin.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <RateField label="Desired earnings per working hour" prefix="$" value={inputs.desiredHourlyEarnings} onChange={(value) => update("desiredHourlyEarnings", value)} />
        <RateField label="Billable cleaning hours each week" value={inputs.billableHoursPerWeek} onChange={(value) => update("billableHoursPerWeek", value)} />
        <RateField label="Weekly business costs" prefix="$" value={inputs.weeklyBusinessCosts} onChange={(value) => update("weeklyBusinessCosts", value)} />
        <RateField label="Unbilled business hours each week" value={inputs.unbilledHoursPerWeek} onChange={(value) => update("unbilledHoursPerWeek", value)} />
        <RateField label="Safety margin added on top" suffix="%" value={inputs.safetyMarginPercent} onChange={(value) => update("safetyMarginPercent", value)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-xl border bg-white p-5">
          <p className="font-semibold">What one billable hour has to carry</p>
          <div className="mt-4 flex h-8 overflow-hidden rounded-full bg-muted">
            {components.map((component) => <div key={component.label} className={component.colour} style={{ width: `${Math.max(2, (component.value / chartTotal) * 100)}%` }} title={`${component.label}: ${money(component.value)}`} />)}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {components.map((component) => <div key={component.label} className="flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><span className={`h-3 w-3 rounded-full ${component.colour}`} />{component.label}</span><strong>{money(component.value)}</strong></div>)}
          </div>
        </div>
        <div className="rounded-xl bg-[#082849] p-5 text-white">
          <p className="text-sm text-sky-100">Working charge-out rate</p>
          <p className="mt-2 text-3xl font-semibold">{money(result.chargeOutRateExGst)}</p>
          <p className="text-sm text-sky-100">per billable hour, ex GST</p>
          <div className="my-4 border-t border-white/20" />
          <p className="text-sm text-sky-100">Customer rate including GST</p>
          <p className="mt-1 text-2xl font-semibold">{money(result.customerRateIncludingGst)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-rose-200 bg-rose-50 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="font-semibold text-rose-950">What happens when I cut the price?</p><p className="mt-1 text-sm text-rose-800">Choose a discount. The work and business costs have not disappeared.</p></div>
          <div className="flex flex-wrap gap-2">{[10, 20, 30].map((percent) => <Button key={percent} type="button" size="sm" variant={cutPercent === percent ? "default" : "outline"} onClick={() => setCutPercent(percent)}>Cut {percent}%</Button>)}</div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Consequence label="Reduced customer rate, incl GST" value={money(cut.reducedCustomerRateIncludingGst)} />
          <Consequence label="Available pay per working hour" value={money(cut.availableHourlyEarnings)} danger={cut.hourlyEarningsShortfall > 0} />
          <Consequence label="Below your desired hourly earnings" value={money(cut.hourlyEarningsShortfall)} danger={cut.hourlyEarningsShortfall > 0} />
        </div>
        <p className="mt-4 text-sm font-medium text-rose-900">A {cutPercent}% price cut reduces the money available for your work to {money(cut.availableHourlyEarnings)} per hour after the weekly business costs in this example.</p>
      </div>

      <p className="text-xs text-muted-foreground">This calculator teaches the relationship between time, costs and price. It does not prescribe a market rate and does not transfer a rate into the quotation system.</p>
    </CardContent>
  </Card>;
}

function RateField({ label, value, onChange, prefix, suffix }: { label: string; value: number; onChange: (value: string) => void; prefix?: string; suffix?: string }) {
  return <Label className="space-y-2 text-xs leading-4"><span>{label}</span><span className="flex items-center rounded-md border bg-white px-3"><span className="text-muted-foreground">{prefix}</span><Input type="number" min="0" step="1" value={value} onChange={(event) => onChange(event.target.value)} className="border-0 px-2 shadow-none focus-visible:ring-0" /><span className="text-muted-foreground">{suffix}</span></span></Label>;
}

function Consequence({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className="rounded-lg border bg-white p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 text-xl font-semibold ${danger ? "text-rose-700" : ""}`}>{value}</p></div>;
}

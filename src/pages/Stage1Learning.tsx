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
import { toast } from "@/components/ui/sonner";
import {
  fetchStage1LearningProgress,
  saveStage1LessonCompletion,
  type Stage1LessonProgress,
} from "@/lib/stage1Learning";

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
  { key: "presentation_before_discounting", version: 1, number: 3, title: "Present well—do not compete by being cheap", promise: "Protect the price by improving trust and presentation.", duration: "Coming next", available: false },
  { key: "charge_out_rate", version: 1, number: 4, title: "Your work rate is not your charge-out rate", promise: "Build a rate that pays for the work and the business around it.", duration: "Coming next", available: false },
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
      <div className="grid gap-4 sm:grid-cols-3"><Summary icon={BookOpen} label="Lessons" value="8" /><Summary icon={Users} label="Available now" value="2" /><Summary icon={CheckCircle2} label="Completed" value={String(completed.size)} /></div>
      <div className="space-y-3">{lessons.map((lesson) => { const completion = completed.get(lesson.key); return <Card key={lesson.key} className={!lesson.available ? "bg-muted/30" : "hover:border-sky-300"}><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#082849] font-semibold text-white">{lesson.number}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{lesson.title}</h2>{completion ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" /> Complete</span> : null}</div><p className="mt-1 text-sm text-muted-foreground">{lesson.promise}</p><p className="mt-2 text-xs text-muted-foreground">{lesson.duration}</p></div>{lesson.available ? <Button variant={completion ? "outline" : "default"} onClick={() => openLesson(lesson)}>{completion ? "Review" : "Start lesson"}<ChevronRight className="ml-2 h-4 w-4" /></Button> : <span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><LockKeyhole className="h-4 w-4" /> Planned</span>}</CardContent></Card>; })}</div>
      <p className="flex items-start gap-2 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground"><Circle className="mt-0.5 h-4 w-4 shrink-0" /> This library supports practice. Course completion is not Autopsy scoring and does not automatically admit anyone to Core.</p>
    </> : null}
  </main>;
}

function Summary({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: string }) {
  return <Card><CardContent className="flex items-center gap-3 p-4"><span className="rounded-lg bg-sky-50 p-2 text-sky-700"><Icon className="h-5 w-5" /></span><div><p className="text-2xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div></CardContent></Card>;
}

import { useState } from "react";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  LockKeyhole,
  MessageSquareText,
  Users,
} from "lucide-react";
import { HudsonSupportButton } from "@/components/HudsonSupportButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { HUDSON_PRACTICES, type HudsonPracticeKey } from "@/lib/hudsonPractice";
import {
  calculateChargeOutRate,
  calculatePriceCutConsequence,
  type ChargeOutRateInputs,
} from "@/lib/stage1ChargeOutRate";
import { FollowUpPractice, JobCloseoutPractice, RejectedQuotePractice } from "@/components/stage1-learning/FinalLessonPractices";

type Lesson = {
  key: string;
  version: number;
  number: number;
  title: string;
  promise: string;
  duration: string;
  available: boolean;
  sections?: { title: string; body: string; script?: string; points?: string[] }[];
  interactive?: "charge_out_rate" | "inspect_and_quote" | "follow_up" | "rejected_quote" | "complete_professionally";
  practiceKey?: HudsonPracticeKey;
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
  },
  {
    key: "what_to_say",
    version: 1,
    number: 2,
    title: "What to say",
    promise: "Use short, natural scripts that open a conversation without sounding rehearsed.",
    duration: "7 minutes",
    available: true,
    practiceKey: "customer_opening",
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
  },
  {
    key: "presentation_before_discounting",
    version: 1,
    number: 3,
    title: "Present well—do not compete by being cheap",
    promise: "Protect the price by improving trust and presentation.",
    duration: "7 minutes",
    available: true,
    practiceKey: "price_question",
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
  },
  {
    key: "inspect_and_quote",
    version: 1,
    number: 5,
    title: "Inspect and prepare the quote",
    promise: "Define the work before promising a price.",
    duration: "9 minutes",
    available: true,
    interactive: "inspect_and_quote",
    practiceKey: "scope_inspection",
    sections: [
      {
        title: "A quote begins with an inspection",
        body: "Do not guess from a short phone call or a few photographs when you can inspect the work. Look at the site, ask what result the customer expects and note anything that changes the time, supplies, access or responsibility.",
        points: ["The areas and tasks to be cleaned", "The condition and expected standard", "Access, parking, keys and permitted working times", "Anything fragile, hazardous, unusually high or difficult to reach", "Who supplies water, power and specialist products"],
      },
      {
        title: "Turn the inspection into a clear scope",
        body: "Write what is included, how often it will be done and what is excluded. A customer should not have to guess whether windows, ovens, high areas or moving heavy furniture are part of the price.",
      },
      {
        title: "Estimate the tasks before the total",
        body: "Break the work into a few plain work items and estimate the hours needed. The estimate does not need to be perfect. It needs to be considered, recorded and capable of being compared with the actual job later.",
      },
      {
        title: "Uncertainty must be resolved or written down",
        body: "If part of the request is unclear, inspect and clarify it before including it. If it is outside the quote, say so plainly. Silence is not an exclusion and an assumption is not an agreement.",
        script: "I have included the floors, bathrooms, kitchen and bins we inspected. The external and high windows are not included in this quote. I can inspect and price those separately if you would like.",
      },
      {
        title: "The quote is a promise",
        body: "Before generating the written quote, check the customer details, service address, work items, estimated hours, clean type, exclusions, price, GST, validity period and payment terms. Generate it only when those details describe the job you are prepared to deliver.",
      },
    ],
  },
  {
    key: "follow_up", version: 1, number: 6, title: "Follow up and ask for the job", promise: "Follow up clearly and give the customer an easy decision.", duration: "7 minutes", available: true, interactive: "follow_up", practiceKey: "quote_follow_up",
    sections: [
      { title: "Following up is part of quoting", body: "A clear written quote does not remove the need to follow up. Confirm that it arrived, ask whether anything needs explaining and then ask directly whether the customer would like to proceed." },
      { title: "Use a short, calm structure", body: "Identify the quote, confirm receipt, answer questions and ask for the decision. Do not repeat the entire sales presentation or apologise for contacting them.", script: "Hi, it’s Alex from Harbour Cleaning. I’m following up on the quote for your office clean. Did it reach you, and is there anything you would like me to explain? If everything is clear, would you like me to book the work?" },
      { title: "A delay needs a next step", body: "If the customer needs more time, agree on one reasonable follow-up date. Do not keep calling without permission and do not leave the quote outstanding forever." },
      { title: "Do not negotiate against yourself", body: "Silence or hesitation is not a request for a discount. Ask what is preventing the decision. If the scope or price must change, make the change openly and issue a clear revised quote." },
    ],
  },
  {
    key: "rejected_quote", version: 1, number: 7, title: "If the quote is rejected", promise: "Ask for useful feedback without arguing or discounting automatically.", duration: "7 minutes", available: true, interactive: "rejected_quote", practiceKey: "quote_rejection",
    sections: [
      { title: "A rejected quote is an honest outcome", body: "The customer is allowed to say no. Your job is to close the conversation professionally, learn what is useful and leave the relationship intact." },
      { title: "Ask once for practical feedback", body: "Thank the customer and ask one short question. They may mention price, scope, timing, confidence, another supplier or no reason at all. Accept the answer without cross-examination.", script: "Thanks for letting me know. So I can improve future quotes, was there one main reason you decided not to proceed? No problem if you would rather not say." },
      { title: "Do not rescue every rejection with a discount", body: "A lower price only makes sense if the scope or commercial decision genuinely changes. Chasing every rejection downwards trains the business to win work it cannot afford to deliver." },
      { title: "Record the result and move on", body: "Mark the quote rejected and record the useful reason in plain language. Do not keep it outstanding to make the numbers look better, and do not turn feedback into an argument." },
    ],
  },
  {
    key: "complete_professionally", version: 1, number: 8, title: "Complete the job professionally", promise: "Finish the records, invoice and referral request properly.", duration: "9 minutes", available: true, interactive: "complete_professionally", practiceKey: "completion_referral",
    sections: [
      { title: "Completion includes the records", body: "Finishing the cleaning is not the end of the job. Record the actual hours and costs, confirm the work with the customer, issue the final invoice and keep the payment record current." },
      { title: "Compare estimate with actual", body: "The first five jobs are where estimates become experience. A variance is not automatically a failure. Record it honestly and understand whether the scope, pace, access, condition or estimate caused it." },
      { title: "Invoice from the completed work", body: "Check the customer, billing address, work and any approved additional charges or credits. The final invoice should agree with what was quoted and legitimately changed—not with what you wish the job had earned." },
      { title: "Close the money loop", body: "Record the payment when received and keep unpaid invoices visible. Do not mark a job financially complete while money is still owing." },
      { title: "Ask for the next opportunity", body: "After the customer confirms they are satisfied, ask whether they need ongoing work or know one person who may value the same service. A referral request is earned by delivery, not inserted mechanically into every conversation.", script: "I’m glad the work is complete and you’re happy with it. If you know someone who would value dependable cleaning, I’d appreciate an introduction." },
    ],
  },
];

export default function Stage1Learning() {
  const [searchParams] = useSearchParams();
  const runId = searchParams.get("runId") ?? "";
  const isDemo = searchParams.get("demo") === "1";
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);

  function openLesson(lesson: Lesson) {
    if (!lesson.available) return;
    setSelectedLesson(lesson);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (selectedLesson) {
    return <main className="container max-w-4xl py-10 space-y-6">
      <Button variant="ghost" className="-ml-3" onClick={() => setSelectedLesson(null)}><ArrowLeft className="mr-2 h-4 w-4" /> Back to course</Button>
      <header className="space-y-2"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Lesson {selectedLesson.number} · {selectedLesson.duration}</p><h1 className="text-3xl font-semibold tracking-tight">{selectedLesson.title}</h1><p className="text-muted-foreground">{selectedLesson.promise}</p></header>
      <Card className="border-sky-200 bg-sky-50/40"><CardHeader><CardTitle className="flex items-center gap-2"><MessageSquareText className="h-5 w-5 text-sky-700" /> Hudson’s practical briefing</CardTitle><CardDescription>Read this lesson at your own pace. Audio and field demonstrations can be added without changing the lesson record.</CardDescription></CardHeader></Card>
      {selectedLesson.sections?.map((section) => <Card key={section.title}><CardHeader><CardTitle className="text-xl">{section.title}</CardTitle></CardHeader><CardContent className="space-y-4 text-sm leading-6"><p>{section.body}</p>{section.points ? <ul className="list-disc space-y-2 pl-5">{section.points.map((point) => <li key={point}>{point}</li>)}</ul> : null}{section.script ? <blockquote className="rounded-lg border-l-4 border-sky-600 bg-sky-50 p-4 text-base font-medium leading-7">“{section.script}”</blockquote> : null}</CardContent></Card>)}
      {selectedLesson.interactive === "charge_out_rate" ? <ChargeOutRateExercise /> : null}
      {selectedLesson.interactive === "inspect_and_quote" ? <InspectionPractice /> : null}
      {selectedLesson.interactive === "follow_up" ? <FollowUpPractice /> : null}
      {selectedLesson.interactive === "rejected_quote" ? <RejectedQuotePractice /> : null}
      {selectedLesson.interactive === "complete_professionally" ? <JobCloseoutPractice /> : null}
      {selectedLesson.practiceKey ? <HudsonPracticeCard runId={runId} practiceKey={selectedLesson.practiceKey} /> : <Card className="border-slate-200 bg-slate-50/50"><CardHeader><CardTitle>Try it in the real world</CardTitle><CardDescription>Use this lesson when the next opportunity arises. There is no acknowledgement, score or pass mark.</CardDescription></CardHeader></Card>}
    </main>;
  }

  return <main className="container max-w-5xl py-10 space-y-6">
    <Button asChild variant="ghost" className="-ml-3"><Link to={isDemo ? "/stage-1?demo=1" : runId ? `/stage-1?runId=${encodeURIComponent(runId)}` : "/stage-1"}><ArrowLeft className="mr-2 h-4 w-4" /> Back to First 5 Jobs</Link></Button>
    <header className="space-y-3"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">First 5 Jobs · learning library</p><h1 className="text-3xl font-semibold tracking-tight">Getting Your First Five Jobs</h1><p className="max-w-3xl text-muted-foreground">Short practical lessons, scripts and customer practices for finding, quoting and completing your first work. Use them when the next situation arises.</p></header>
    <div className="grid gap-4 sm:grid-cols-3"><Summary icon={BookOpen} label="Lessons" value="8" /><Summary icon={Users} label="Hudson practices" value="6" /><Summary icon={CheckCircle2} label="Progression gates" value="0" /></div>
    <div className="space-y-3">{lessons.map((lesson) => <Card key={lesson.key} className={!lesson.available ? "bg-muted/30" : "hover:border-sky-300"}><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#082849] font-semibold text-white">{lesson.number}</div><div className="min-w-0 flex-1"><h2 className="font-semibold">{lesson.title}</h2><p className="mt-1 text-sm text-muted-foreground">{lesson.promise}</p><p className="mt-2 text-xs text-muted-foreground">{lesson.duration}{lesson.practiceKey ? " · optional Hudson practice" : ""}</p></div>{lesson.available ? <Button onClick={() => openLesson(lesson)}>Open lesson<ChevronRight className="ml-2 h-4 w-4" /></Button> : <span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><LockKeyhole className="h-4 w-4" /> Planned</span>}</CardContent></Card>)}</div>
    <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">This library supports voluntary practice. Nothing here is scored, and it does not change Autopsy or admit anyone to Core.</p>
  </main>;
}

function HudsonPracticeCard({ runId, practiceKey }: { runId: string; practiceKey: HudsonPracticeKey }) {
  const practice = HUDSON_PRACTICES[practiceKey];
  return <Card className="border-emerald-200 bg-emerald-50/40"><CardHeader><CardTitle>Practise with Hudson — about 3 minutes</CardTitle><CardDescription>{practice.purpose}</CardDescription></CardHeader><CardContent className="space-y-4"><p className="text-sm leading-6 text-muted-foreground">Hudson starts immediately as the customer. After a few exchanges, he gives you one useful observation and one thing to try next. There is no score or pass mark.</p>{runId ? <HudsonSupportButton runId={runId} practiceKey={practiceKey} label={`Practise: ${practice.title}`} /> : <Button disabled>Available in your live First 5 Jobs workspace</Button>}</CardContent></Card>;
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
          <div className="flex flex-nowrap items-center gap-2">{[10, 20, 30].map((percent) => <Button key={percent} type="button" size="sm" className="whitespace-nowrap" variant={cutPercent === percent ? "default" : "outline"} onClick={() => setCutPercent(percent)}>Cut {percent}%</Button>)}</div>
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
  return <Label className="grid grid-rows-[2rem_auto] gap-2 text-xs leading-4"><span className="flex items-end">{label}</span><span className="flex items-center rounded-md border bg-white px-3"><span className="text-muted-foreground">{prefix}</span><Input type="number" min="0" step="1" value={value} onChange={(event) => onChange(event.target.value)} className="border-0 px-2 shadow-none focus-visible:ring-0" /><span className="text-muted-foreground">{suffix}</span></span></Label>;
}

function Consequence({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className="rounded-lg border bg-white p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 text-xl font-semibold ${danger ? "text-rose-700" : ""}`}>{value}</p></div>;
}

const practiceTasks = ["Floors", "Bathrooms", "Kitchen", "Bins", "Internal glass"];

function InspectionPractice() {
  const [tasks, setTasks] = useState<string[]>(["Floors", "Bathrooms", "Kitchen", "Bins"]);
  const [hours, setHours] = useState(4);
  const [cleanType, setCleanType] = useState<"" | "Routine" | "Initial or heavy" | "Specialist">("");
  const [windows, setWindows] = useState<"" | "Clarify and inspect" | "Exclude in writing" | "Include without checking">("");
  const [access, setAccess] = useState<"" | "Confirmed" | "Assumed">("");

  const scopeReady = tasks.length > 0;
  const hoursReady = hours > 0;
  const cleanTypeReady = cleanType !== "";
  const windowsReady = windows === "Clarify and inspect" || windows === "Exclude in writing";
  const accessReady = access === "Confirmed";
  const readyCount = [scopeReady, hoursReady, cleanTypeReady, windowsReady, accessReady].filter(Boolean).length;

  function toggleTask(task: string) {
    setTasks((current) => current.includes(task) ? current.filter((item) => item !== task) : [...current, task]);
  }

  return <Card className="border-teal-300 bg-teal-50/30">
    <CardHeader>
      <CardTitle>Practice inspection: a small weekly office clean</CardTitle>
      <CardDescription>The customer wants the floors, bathrooms, kitchen and bins cleaned. They also say “the windows could use attention” without explaining which windows. Build a quote-ready inspection brief. This practice is not saved and does not create a quote.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-7">
      <PracticeStep number="1" title="Confirm the work items" description="Select only the tasks you are prepared to include in the regular scope.">
        <div className="flex flex-wrap gap-2">{practiceTasks.map((task) => <Button key={task} type="button" size="sm" variant={tasks.includes(task) ? "default" : "outline"} onClick={() => toggleTask(task)}>{tasks.includes(task) ? "Included: " : "Add: "}{task}</Button>)}</div>
      </PracticeStep>

      <PracticeStep number="2" title="Estimate the total cleaning hours" description="Build the estimate from the inspected tasks. This example starts at four hours.">
        <div className="flex max-w-xs items-center gap-3"><Input aria-label="Estimated cleaning hours" type="number" min="0" step="0.5" value={hours} onChange={(event) => setHours(Math.max(0, Number(event.target.value) || 0))} /><span className="text-sm text-muted-foreground">hours</span></div>
      </PracticeStep>

      <PracticeStep number="3" title="Choose the clean type" description="The clean type allows for the expected level of supplies. It does not replace the inspection.">
        <ChoiceRow options={["Routine", "Initial or heavy", "Specialist"]} selected={cleanType} onSelect={(value) => setCleanType(value as typeof cleanType)} />
      </PracticeStep>

      <PracticeStep number="4" title="Resolve the vague window request" description="Choose how you would prevent an unclear request becoming an unpaid promise.">
        <ChoiceRow options={["Clarify and inspect", "Exclude in writing", "Include without checking"]} selected={windows} onSelect={(value) => setWindows(value as typeof windows)} />
        {windows === "Include without checking" ? <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">That creates an uncontrolled promise. Inspect and clarify the work, or state the exclusion plainly.</p> : null}
      </PracticeStep>

      <PracticeStep number="5" title="Confirm access" description="Do not assume keys, parking, permitted times or someone being present.">
        <ChoiceRow options={["Confirmed", "Assumed"]} selected={access} onSelect={(value) => setAccess(value as typeof access)} />
        {access === "Assumed" ? <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">An access assumption can waste the booked time. Confirm it before generating the quote.</p> : null}
      </PracticeStep>

      <div className={`rounded-xl border p-5 ${readyCount === 5 ? "border-emerald-300 bg-emerald-50" : "bg-white"}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="font-semibold">Quote-readiness check</p><p className="mt-1 text-sm text-muted-foreground">{readyCount} of 5 inspection decisions are ready.</p></div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${readyCount === 5 ? "bg-emerald-700 text-white" : "bg-muted text-muted-foreground"}`}>{readyCount === 5 ? "Ready to prepare" : "Still incomplete"}</span>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <ReadinessLine ready={scopeReady} label={tasks.length ? `Scope: ${tasks.join(", ")}` : "Work items not selected"} />
          <ReadinessLine ready={hoursReady} label={hoursReady ? `Estimated time: ${hours} hours` : "Estimated time missing"} />
          <ReadinessLine ready={cleanTypeReady} label={cleanTypeReady ? `Clean type: ${cleanType}` : "Clean type missing"} />
          <ReadinessLine ready={windowsReady} label={windowsReady ? `Windows: ${windows}` : "Window request unresolved"} />
          <ReadinessLine ready={accessReady} label={accessReady ? "Access confirmed" : "Access not confirmed"} />
        </div>
        {readyCount === 5 ? <p className="mt-4 text-sm font-medium text-emerald-900">The inspection brief is coherent. In First 5 Jobs, you would now enter the customer details, these work items and hours, the clean type, exclusions and your charge-out rate—then review the total before generating the written quote.</p> : null}
      </div>
      <p className="text-xs text-muted-foreground">This exercise teaches quote preparation only. It does not save customer information, set a price or transfer anything into the quotation system.</p>
    </CardContent>
  </Card>;
}

function PracticeStep({ number, title, description, children }: { number: string; title: string; description: string; children: ReactNode }) {
  return <section className="rounded-xl border bg-white p-5"><div className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#082849] text-sm font-semibold text-white">{number}</span><div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{description}</p></div></div><div className="mt-4">{children}</div></section>;
}

function ChoiceRow({ options, selected, onSelect }: { options: string[]; selected: string; onSelect: (value: string) => void }) {
  return <div className="flex flex-wrap gap-2">{options.map((option) => <Button key={option} type="button" size="sm" variant={selected === option ? "default" : "outline"} onClick={() => onSelect(option)}>{option}</Button>)}</div>;
}

function ReadinessLine({ ready, label }: { ready: boolean; label: string }) {
  return <div className="flex items-start gap-2 text-sm"><CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${ready ? "text-emerald-700" : "text-muted-foreground/40"}`} /><span className={ready ? "" : "text-muted-foreground"}>{label}</span></div>;
}

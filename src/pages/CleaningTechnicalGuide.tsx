import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Bath,
  CheckCircle2,
  ChevronRight,
  CookingPot,
  Droplets,
  HelpCircle,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  cleaningAreaOptions,
  observationSummary,
  previousProductOptions,
  searchMatchesShower,
  showerLocationOptions,
  showerObservationOptions,
  showerSurfaceOptions,
  type GuideOption,
} from "@/lib/cleaningTechnicalGuide";

type Answers = {
  observation?: string;
  surface?: string;
  location?: string;
  previousProduct?: string;
};

const areaIcons = {
  shower: Bath,
  toilet: Droplets,
  kitchen: CookingPot,
  windows: Sparkles,
};

function TouchChoice({ option, selected, onSelect }: { option: GuideOption; selected?: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`min-h-14 w-full overflow-hidden rounded-xl border text-left transition active:scale-[0.99] ${selected ? "border-sky-700 bg-sky-50 ring-2 ring-sky-200" : "border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50/40"}`}
    >
      {option.image ? <img src={option.image} alt="" loading="lazy" width="800" height="800" className="aspect-[4/3] w-full object-cover" /> : null}
      <span className="flex items-center justify-between gap-3 px-4 py-3">
        <span>
          <span className="block text-base font-semibold text-slate-950">{option.label}</span>
          {option.description ? <span className="mt-0.5 block text-sm leading-snug text-slate-600">{option.description}</span> : null}
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
      </span>
    </button>
  );
}

function QuestionStep({ title, hint, options, value, onSelect }: { title: string; hint: string; options: GuideOption[]; value?: string; onSelect: (key: string) => void }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{hint}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => <TouchChoice key={option.key} option={option} selected={value === option.key} onSelect={() => onSelect(option.key)} />)}
      </div>
    </section>
  );
}

function ShowerLocationMap({ value, onSelect }: { value?: string; onSelect: (key: string) => void }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Where is it located?</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">Tap the closest area on the shower map. The exact location changes what should be checked next.</p>
      </div>
      <div className="rounded-2xl border border-sky-200 bg-gradient-to-b from-sky-50 to-white p-4">
        <div className="mx-auto grid max-w-sm grid-cols-2 gap-2 rounded-2xl border-4 border-slate-300 bg-white p-3 shadow-inner" aria-label="Shower area map">
          <MapChoice optionKey="wall-floor" label="Wall tiles" selected={value === "wall-floor"} onSelect={onSelect} className="col-span-2 min-h-20" />
          <MapChoice optionKey="fixture" label="Tap or fitting" selected={value === "fixture"} onSelect={onSelect} className="min-h-20" />
          <MapChoice optionKey="screen" label="Screen or door" selected={value === "screen"} onSelect={onSelect} className="row-span-2 min-h-32" />
          <MapChoice optionKey="edge-seal" label="Edge or seal" selected={value === "edge-seal"} onSelect={onSelect} className="min-h-16" />
          <MapChoice optionKey="track" label="Track or corner" selected={value === "track"} onSelect={onSelect} className="col-span-2 min-h-16" />
        </div>
      </div>
      <button type="button" onClick={() => onSelect("unsure")} className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-left text-sm font-semibold text-slate-700 hover:border-sky-300">I’m not sure where it is</button>
    </section>
  );
}

function MapChoice({ optionKey, label, selected, onSelect, className }: { optionKey: string; label: string; selected: boolean; onSelect: (key: string) => void; className: string }) {
  return <button type="button" aria-pressed={selected} onClick={() => onSelect(optionKey)} className={`${className} rounded-xl border px-3 py-2 text-sm font-semibold transition active:scale-[0.98] ${selected ? "border-sky-700 bg-sky-100 text-sky-950 ring-2 ring-sky-200" : "border-slate-300 bg-slate-50 text-slate-700 hover:border-sky-400 hover:bg-sky-50"}`}>{label}</button>;
}

export default function CleaningTechnicalGuide() {
  const [searchParams] = useSearchParams();
  const runId = searchParams.get("runId") ?? "";
  const isDemo = searchParams.get("demo") === "1";
  const first5JobsPath = isDemo ? "/stage-1?demo=1" : runId ? `/stage-1?runId=${encodeURIComponent(runId)}` : "/stage-1";
  const [step, setStep] = useState(0);
  const [search, setSearch] = useState("");
  const [searchAttempted, setSearchAttempted] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});

  const steps = ["Area", "What you see", "Surface", "Location", "Already used", "Safe next step"];
  const previousProductRequiresStop = answers.previousProduct === "unknown" || answers.previousProduct === "mixed";
  const uncertainCondition = answers.observation === "unsure" || answers.surface === "unsure" || answers.location === "unsure";
  const resultTitle = previousProductRequiresStop
    ? "Stop before using another product"
    : uncertainCondition
      ? "The condition needs identification"
      : `${observationSummary(answers.observation ?? "")} — provisional inspection result`;
  const progress = Math.round(((step + 1) / steps.length) * 100);
  const answerTrail = [
    answers.observation ? { step: 1, label: observationSummary(answers.observation) } : null,
    answers.surface ? { step: 2, label: showerSurfaceOptions.find((option) => option.key === answers.surface)?.label ?? "Surface" } : null,
    answers.location ? { step: 3, label: showerLocationOptions.find((option) => option.key === answers.location)?.label ?? "Location" } : null,
    answers.previousProduct ? { step: 4, label: previousProductOptions.find((option) => option.key === answers.previousProduct)?.label ?? "Product" } : null,
  ].filter((item): item is { step: number; label: string } => Boolean(item));

  const selectAnswer = (key: keyof Answers, value: string) => {
    setAnswers((current) => ({ ...current, [key]: value }));
    setStep((current) => Math.min(current + 1, 5));
  };

  const reset = () => {
    setStep(0);
    setAnswers({});
    setSearch("");
    setSearchAttempted(false);
  };

  const runSearch = () => {
    setSearchAttempted(true);
    if (searchMatchesShower(search)) setStep(1);
  };

  return (
    <div className="min-h-[calc(100vh-120px)] bg-slate-50 px-3 py-4 sm:px-6 sm:py-8">
      <main className="mx-auto max-w-2xl space-y-4">
        <Button asChild variant="ghost" className="-ml-2 min-h-11"><Link to={first5JobsPath}><ArrowLeft className="mr-2 h-4 w-4" /> Back to First 5 Jobs</Link></Button>

        <header className="rounded-2xl bg-gradient-to-br from-[#061b34] via-[#082849] to-[#07506b] p-5 text-white shadow-lg sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">Cleaning Sleeve · 5JD Stage Pack</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">Cleaning Technical Guide</h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-200">Start with what you can see. A few short questions will narrow the issue and show whether there is a verified procedure or you should stop and ask for help.</p>
            </div>
            <ShieldAlert className="h-8 w-8 shrink-0 text-teal-300" />
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-teal-300 transition-all" style={{ width: `${progress}%` }} /></div>
          <p className="mt-2 text-xs text-slate-300">Step {step + 1} of {steps.length} · {steps[step]}</p>
        </header>

        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex gap-3 p-4 text-sm text-amber-950">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <p><strong>Prototype only.</strong> The question flow is ready for testing. Cleaning treatments are not published until an experienced contributor and an independent technical reviewer verify them.</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-slate-200 shadow-sm">
          <CardContent className="p-4 sm:p-6">
            {answerTrail.length > 0 ? <div className="mb-5 flex gap-2 overflow-x-auto pb-1" aria-label="Your answers">{answerTrail.map((item) => <button type="button" key={item.step} onClick={() => setStep(item.step)} className="min-h-10 shrink-0 rounded-full border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-900">{item.label} · Change</button>)}</div> : null}
            {step === 0 ? (
              <section className="space-y-5">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">What are you cleaning?</h2>
                  <p className="mt-1 text-sm text-slate-600">Tap an area or search using the words you would normally use.</p>
                </div>
                <div className="flex gap-2">
                  <Input value={search} onChange={(event) => { setSearch(event.target.value); setSearchAttempted(false); }} onKeyDown={(event) => { if (event.key === "Enter") runSearch(); }} className="min-h-12 text-base" placeholder="Try shower, body fat or soap scum" aria-label="Search cleaning issue" />
                  <Button type="button" onClick={runSearch} className="min-h-12 min-w-12 px-3" aria-label="Search"><Search className="h-5 w-5" /></Button>
                </div>
                {searchAttempted && !searchMatchesShower(search) ? <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">That topic is not in the shower pilot yet. Try <strong>shower</strong>, <strong>body fat</strong> or <strong>soap scum</strong>.</p> : null}
                <div className="grid grid-cols-2 gap-3">
                  {cleaningAreaOptions.map((option) => {
                    const Icon = areaIcons[option.key as keyof typeof areaIcons] ?? HelpCircle;
                    const enabled = option.key === "shower";
                    return <button key={option.key} type="button" disabled={!enabled} onClick={() => setStep(1)} className="min-h-32 rounded-xl border border-slate-200 bg-white p-4 text-left disabled:bg-slate-50 disabled:opacity-60 enabled:hover:border-sky-400 enabled:hover:bg-sky-50"><Icon className="h-7 w-7 text-sky-700" /><span className="mt-3 block text-base font-semibold">{option.label}</span><span className="mt-1 block text-xs leading-snug text-slate-600">{option.description}</span></button>;
                  })}
                </div>
              </section>
            ) : null}

            {step === 1 ? <QuestionStep title="What are you seeing?" hint="Choose the closest description. Do not diagnose it yet." options={showerObservationOptions} value={answers.observation} onSelect={(value) => selectAnswer("observation", value)} /> : null}
            {step === 2 ? <QuestionStep title="What is the surface?" hint="The same mark can require a different response on glass, grout, metal or acrylic." options={showerSurfaceOptions} value={answers.surface} onSelect={(value) => selectAnswer("surface", value)} /> : null}
            {step === 3 ? <ShowerLocationMap value={answers.location} onSelect={(value) => selectAnswer("location", value)} /> : null}
            {step === 4 ? <QuestionStep title="What has already been used?" hint="Do not add another product when an existing chemical is unknown." options={previousProductOptions} value={answers.previousProduct} onSelect={(value) => selectAnswer("previousProduct", value)} /> : null}

            {step === 5 ? (
              <section className="space-y-5">
                <div className="flex items-start gap-3">
                  {previousProductRequiresStop || uncertainCondition ? <ShieldAlert className="mt-1 h-7 w-7 shrink-0 text-amber-700" /> : <CheckCircle2 className="mt-1 h-7 w-7 shrink-0 text-emerald-700" />}
                  <div><Badge variant="outline">Provisional result</Badge><h2 className="mt-2 text-2xl font-semibold tracking-tight">{resultTitle}</h2></div>
                </div>

                <div className="grid gap-3">
                  <ResultBlock title="What the guide recorded" items={[
                    `You saw: ${observationSummary(answers.observation ?? "")}.`,
                    `Surface: ${showerSurfaceOptions.find((option) => option.key === answers.surface)?.label ?? "not identified"}.`,
                    `Location: ${showerLocationOptions.find((option) => option.key === answers.location)?.label ?? "not identified"}.`,
                  ]} />
                  <ResultBlock title="Before you start" items={[
                    "Keep the area ventilated and follow the product label and SDS.",
                    "Confirm the surface before applying any treatment.",
                    "Never mix cleaning products or add a product over an unknown residue.",
                  ]} />
                  <ResultBlock title="Safe next step" items={previousProductRequiresStop || uncertainCondition ? [
                    "Do not apply another chemical.",
                    "Identify the surface and any product already used.",
                    "Ask a supervisor, product manufacturer or other competent person before continuing.",
                  ] : [
                    "Photograph or note the condition before treatment if the customer may need an explanation.",
                    "Pause here: the treatment method remains locked until the pilot guidance is technically verified.",
                    "Use a supervisor-approved method or the product manufacturer’s surface instructions.",
                  ]} />
                  <ResultBlock title="Stop and get help if…" items={[
                    "the surface is damaged, unknown or vulnerable;",
                    "there is unknown chemical residue, biological waste or a strong unexplained odour;",
                    "mould-like growth is extensive or the source may be structural; or",
                    "safe access, ventilation or protective equipment is not available.",
                  ]} />
                </div>
                <Button type="button" onClick={reset} variant="outline" className="min-h-12 w-full"><RotateCcw className="mr-2 h-4 w-4" /> Start another search</Button>
              </section>
            ) : null}
          </CardContent>
        </Card>

        {step > 0 && step < 5 ? <Button type="button" variant="outline" onClick={() => setStep((current) => Math.max(0, current - 1))} className="min-h-12 w-full"><ArrowLeft className="mr-2 h-4 w-4" /> Back to the previous question</Button> : null}
      </main>
    </div>
  );
}

function ResultBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-950">{title}</h3>
      <ul className="mt-2 space-y-2 text-sm leading-relaxed text-slate-700">
        {items.map((item) => <li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-700" /><span>{item}</span></li>)}
      </ul>
    </div>
  );
}

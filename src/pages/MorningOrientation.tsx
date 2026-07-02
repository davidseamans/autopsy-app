import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Clock, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { baselineMorningOrientation, signalEmoji } from "@/lib/morningOrientation";

const briefing = baselineMorningOrientation;

function Divider() {
  return <div className="border-t border-dashed" />;
}

export default function MorningOrientation() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-5 sm:py-8">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-6 p-5">
            <header className="rounded-2xl border bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Morning Orientation</p>
                  <h1 className="mt-2 text-2xl font-semibold tracking-tight">Good Morning, {briefing.owner_name}</h1>
                  <p className="mt-1 text-sm text-slate-500">BuildOS briefing baseline</p>
                </div>
                <div className="flex flex-col items-end gap-2 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 shadow-sm">
                    <Clock className="h-3.5 w-3.5" /> Ready
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 shadow-sm">
                    <Sun className="h-3.5 w-3.5" /> BuildOS
                  </span>
                </div>
              </div>
            </header>

            <section className="space-y-2" aria-label="Business signal lights">
              {briefing.sections.map((item) => (
                <div key={item.key} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <div>
                    <p className="font-medium">{item.label}</p>
                    <p className="text-xs text-slate-500">{item.summary}</p>
                  </div>
                  <span className="text-2xl" aria-label={item.signal}>
                    {signalEmoji[item.signal]}
                  </span>
                </div>
              ))}
            </section>

            <Divider />

            <section className="space-y-3" aria-labelledby="priorities-heading">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Today's Priorities</p>
                <h2 id="priorities-heading" className="text-lg font-semibold">Three things worth your attention</h2>
              </div>
              <div className="space-y-2">
                {briefing.priorities.slice(0, 3).map((item) => (
                  <div key={item.text} className="flex items-start gap-3 rounded-xl border bg-white px-4 py-3">
                    <span className="text-xl leading-none">{signalEmoji[item.signal]}</span>
                    <p className="text-sm font-medium leading-snug">{item.text}</p>
                  </div>
                ))}
              </div>
            </section>

            <Divider />

            <section className="space-y-3" aria-labelledby="yesterday-heading">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Yesterday</p>
                <h2 id="yesterday-heading" className="text-lg font-semibold">What settled cleanly</h2>
              </div>
              <div className="space-y-2">
                {briefing.yesterday.map((item) => (
                  <div key={item} className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </section>

            <Divider />

            <section className="rounded-2xl bg-slate-900 p-4 text-white" aria-labelledby="recommendation-heading">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Today's Recommendation</p>
              <h2 id="recommendation-heading" className="mt-2 text-lg font-semibold">Recommended focus</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-200">{briefing.recommendation}</p>
            </section>

            <Divider />

            <footer className="space-y-4 text-center">
              <p className="text-xs text-slate-400">BuildOS-owned briefing baseline. Supabase runtime is next.</p>
              <p className="text-sm font-medium text-slate-600">Morning Orientation Complete</p>
              <Button asChild className="w-full rounded-xl">
                <Link to="/owner-cockpit">
                  Open BuildOS <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </footer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

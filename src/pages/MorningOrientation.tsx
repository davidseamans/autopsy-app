import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Clock, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const healthSignals = [
  { label: "Business Health", light: "🟢", status: "Healthy" },
  { label: "Sales", light: "🟢", status: "Healthy" },
  { label: "Operations", light: "🟡", status: "Attention recommended" },
  { label: "Finance", light: "🟢", status: "Healthy" },
  { label: "People", light: "🟡", status: "Attention recommended" },
  { label: "Growth", light: "🟢", status: "Healthy" },
];

const priorities = [
  { light: "🔴", text: "Approve payroll before 11:00" },
  { light: "🟡", text: "Mary certification expires in 14 days" },
  { light: "🟡", text: "Smith Residence referral opportunity" },
];

const yesterday = ["6 jobs completed", "2 invoices requested", "No critical exceptions"];

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
                  <h1 className="mt-2 text-2xl font-semibold tracking-tight">Good Morning, David</h1>
                  <p className="mt-1 text-sm text-slate-500">Thursday, 2 July</p>
                </div>
                <div className="flex flex-col items-end gap-2 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 shadow-sm">
                    <Clock className="h-3.5 w-3.5" /> 7:12 AM
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 shadow-sm">
                    <Sun className="h-3.5 w-3.5" /> Clear
                  </span>
                </div>
              </div>
            </header>

            <section className="space-y-2" aria-label="Business signal lights">
              {healthSignals.map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <div>
                    <p className="font-medium">{item.label}</p>
                    <p className="text-xs text-slate-500">{item.status}</p>
                  </div>
                  <span className="text-2xl" aria-label={item.status}>
                    {item.light}
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
                {priorities.map((item) => (
                  <div key={item.text} className="flex items-start gap-3 rounded-xl border bg-white px-4 py-3">
                    <span className="text-xl leading-none">{item.light}</span>
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
                {yesterday.map((item) => (
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
              <h2 id="recommendation-heading" className="mt-2 text-lg font-semibold">Protect the quote window</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-200">
                Spend 30 minutes issuing the remaining two quotes before 10:00.
              </p>
            </section>

            <Divider />

            <footer className="space-y-4 text-center">
              <p className="text-sm font-medium text-slate-600">Morning Orientation Complete</p>
              <Button asChild className="w-full rounded-xl">
                <Link to="/launchpad">
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

import { Link } from "react-router-dom";
import { ArrowRight, Building2, CheckCircle2, CircleAlert, Clock, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const health = [
  { label: "Business Health", light: "🟢", value: "87%", note: "Stable and improving" },
  { label: "Readiness", light: "🟡", value: "91%", note: "Two gates need attention" },
  { label: "Risk", light: "🟡", value: "Medium", note: "No blocked work" },
  { label: "Learning", light: "🟢", value: "+12", note: "New signals this week" },
];

const sections = [
  { name: "Sales", light: "🟢", detail: "2 quotes ready to issue" },
  { name: "Operations", light: "🟡", detail: "3 jobs need review" },
  { name: "Finance", light: "🟢", detail: "Payroll ready after approval" },
  { name: "People", light: "🟡", detail: "1 certification expiring" },
  { name: "Growth", light: "🟢", detail: "1 referral opportunity" },
];

const priorities = [
  "Approve payroll before 11:00",
  "Confirm Mary’s certification renewal path",
  "Issue two pending quotes before 10:00",
];

const opportunities = [
  "Smith Residence is referral ready",
  "Bathroom template may need +5 minutes",
  "Recurring service opportunity identified for Jones Office",
];

export default function OwnerCockpit() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <div className="container max-w-6xl py-8 space-y-6">
        <header className="flex flex-col gap-4 rounded-3xl bg-slate-950 p-6 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Owner Cockpit</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Good morning, David.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
              The business is healthy. Three items deserve owner attention today. Everything else is under control.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <Badge className="w-fit bg-emerald-600 text-white hover:bg-emerald-600">🟢 Business healthy</Badge>
            <p className="text-sm text-slate-400">Thursday, 2 July · 7:24 AM</p>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Business health summary">
          {health.map((item) => (
            <Card key={item.label}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">{item.label}</CardTitle>
                <span className="text-2xl">{item.light}</span>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{item.value}</div>
                <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CircleAlert className="h-5 w-5" /> Today's Priorities
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {priorities.map((item, index) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl border bg-white p-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
                    {index + 1}
                  </span>
                  <p className="font-medium leading-snug">{item}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="h-5 w-5" /> Headquarters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {sections.map((section) => (
                <div key={section.name} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                  <div>
                    <p className="font-medium">{section.name}</p>
                    <p className="text-xs text-muted-foreground">{section.detail}</p>
                  </div>
                  <span className="text-2xl">{section.light}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5" /> Opportunities
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {opportunities.map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl border bg-white p-4 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-slate-950 text-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5" /> Recommended Focus
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-slate-200">
                Spend 30 minutes in Sales before opening Operations. The quote window is the highest leverage block today.
              </p>
              <Button asChild className="mt-5 w-full bg-white text-slate-950 hover:bg-slate-100">
                <Link to="/staff-cockpit">
                  View Staff Cockpit <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

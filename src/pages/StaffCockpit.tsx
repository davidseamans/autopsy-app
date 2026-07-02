import { Link } from "react-router-dom";
import { ArrowLeft, Camera, CheckCircle2, Clock, MapPin, MessageSquareWarning, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const readiness = [
  { label: "Documents", value: "Current", signal: "🟢" },
  { label: "Today", value: "2 sites", signal: "🟢" },
  { label: "Evidence", value: "Photos required", signal: "🟡" },
];

const jobs = [
  {
    customer: "Smith Residence",
    time: "8:30 AM",
    address: "18 Maple Street",
    signal: "🟡",
    role: "You own the bathrooms and kitchen finish.",
    note: "Bathroom evidence required. Client values a quiet arrival and a citrus finish.",
    checklist: ["Kitchen surfaces", "Main bathroom", "Ensuite", "Final photo set"],
  },
  {
    customer: "Jones Office",
    time: "11:15 AM",
    address: "42 Market Road",
    signal: "🟢",
    role: "You own reception and boardroom presentation.",
    note: "Reception and boardroom only. Leave boardroom reset for a 1:00 PM meeting.",
    checklist: ["Reception desk", "Entry glass", "Boardroom table", "Bin reset"],
  },
];

const reminders = [
  "Capture evidence at the lowest practical burden.",
  "Raise a variation before extra work starts.",
  "Make the room feel finished, not merely completed.",
];

export default function StaffCockpit() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto w-full max-w-md space-y-5 px-4 py-5">
        <header className="rounded-3xl bg-slate-950 p-5 text-white shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Staff Cockpit</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">Good morning, Mary.</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                This is your run for today. The aim is simple: arrive ready, finish cleanly, and leave evidence without paperwork.
              </p>
            </div>
            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Ready</Badge>
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5" /> Work Readiness
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {readiness.map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.value}</p>
                </div>
                <span className="text-2xl">{item.signal}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <section className="space-y-3" aria-label="Today's sites">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Today's Sites</p>
          {jobs.map((job) => (
            <Card key={job.customer} className="overflow-hidden">
              <CardContent className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{job.customer}</h2>
                    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                      <p className="flex items-center gap-2"><Clock className="h-4 w-4" /> {job.time}</p>
                      <p className="flex items-center gap-2"><MapPin className="h-4 w-4" /> {job.address}</p>
                    </div>
                  </div>
                  <span className="text-2xl">{job.signal}</span>
                </div>

                <div className="rounded-2xl bg-slate-950 p-3 text-white">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Your Domain</p>
                  <p className="mt-1 text-sm font-medium leading-relaxed">{job.role}</p>
                </div>

                <div className="rounded-2xl bg-amber-50 p-3 text-sm leading-relaxed text-amber-950">
                  {job.note}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {job.checklist.map((item) => (
                    <div key={item} className="rounded-xl border bg-white px-3 py-2 text-xs font-medium">
                      {item}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Button variant="outline" className="rounded-xl text-xs">
                    <Camera className="mr-1 h-4 w-4" /> Evidence
                  </Button>
                  <Button variant="outline" className="rounded-xl text-xs">
                    <MessageSquareWarning className="mr-1 h-4 w-4" /> Raise
                  </Button>
                  <Button className="rounded-xl text-xs">Start</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card className="bg-slate-950 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5" /> Stewardship Standard
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reminders.map((item) => (
              <div key={item} className="flex items-start gap-3 text-sm text-slate-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span>{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Button asChild variant="outline" className="w-full rounded-xl bg-white">
          <Link to="/owner-cockpit">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Owner Cockpit
          </Link>
        </Button>
      </div>
    </div>
  );
}

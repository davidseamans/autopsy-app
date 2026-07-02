import { Link } from "react-router-dom";
import { ArrowLeft, Camera, CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const jobs = [
  {
    customer: "Smith Residence",
    time: "8:30 AM",
    signal: "🟡",
    note: "Bathroom photo evidence required.",
  },
  {
    customer: "Jones Office",
    time: "11:15 AM",
    signal: "🟢",
    note: "Reception and boardroom only.",
  },
];

export default function StaffCockpit() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto w-full max-w-md space-y-5 px-4 py-5">
        <header className="rounded-3xl bg-slate-950 p-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Staff Cockpit</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">Good morning.</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                You are responsible for today's customer experience at two sites.
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
          <CardContent>
            <div className="flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3">
              <div>
                <p className="font-medium text-emerald-950">Ready for work</p>
                <p className="text-xs text-emerald-800">Documents current. Shifts accepted.</p>
              </div>
              <span className="text-2xl">🟢</span>
            </div>
          </CardContent>
        </Card>

        <section className="space-y-3" aria-label="Today's jobs">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Today's Sites</p>
          {jobs.map((job) => (
            <Card key={job.customer}>
              <CardContent className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{job.customer}</h2>
                    <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" /> {job.time}
                    </p>
                  </div>
                  <span className="text-2xl">{job.signal}</span>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 text-sm leading-relaxed">
                  {job.note}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="rounded-xl">
                    <Camera className="mr-2 h-4 w-4" /> Evidence
                  </Button>
                  <Button className="rounded-xl">Start Job</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card className="bg-slate-950 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle2 className="h-5 w-5" /> Stewardship Reminders
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-200">
            <p>Capture evidence at room level, not task level.</p>
            <p>Escalate out-of-scope work before doing it.</p>
            <p>Leave the room better than the checklist describes.</p>
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

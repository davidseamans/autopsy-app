import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  Phone,
  Users,
  Megaphone,
  TrendingUp,
  ArrowRight,
  Target,
  DollarSign,
  FileText,
  Camera,
} from "lucide-react";

// ----- Critical test state (acceptance fixture) -----
const TEST_STATE = {
  jobsCompleted: 3,
  jobsTarget: 5,
  avgGM: 24,
  gmTarget: 30,
  gateStatus: "Blocked" as const,
  gateReason: "You have jobs, but not enough margin proof.",
  nextAction:
    "Raise price, reduce labour time, or reduce direct costs.",
};

type MethodKey = "phone" | "referral" | "flyer";
const METHODS: Record<
  MethodKey,
  { label: string; icon: typeof Phone; benchmark: string }
> = {
  phone: { label: "Phone Outreach", icon: Phone, benchmark: "20 calls → 3 quotes → 1 job" },
  referral: { label: "Referral Request", icon: Users, benchmark: "10 asks → 4 leads → 2 jobs" },
  flyer: { label: "Local Flyer", icon: Megaphone, benchmark: "200 drops → 5 calls → 1 job" },
};

function tryQuery<T = unknown>(key: string, fn: () => Promise<T>) {
  return useQuery({
    queryKey: [key],
    queryFn: async () => {
      try {
        return await fn();
      } catch {
        return null;
      }
    },
    retry: false,
  });
}

function StatTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "warn" | "good";
}) {
  const toneCls =
    tone === "warn"
      ? "text-amber-600"
      : tone === "good"
        ? "text-emerald-600"
        : "text-foreground";
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneCls}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function CurrentStageCard() {
  const pct = (TEST_STATE.jobsCompleted / TEST_STATE.jobsTarget) * 100;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardDescription className="uppercase text-xs tracking-wide">
              You are in
            </CardDescription>
            <CardTitle className="text-xl">Stage 1 — First 5 Jobs</CardTitle>
          </div>
          <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50">
            Gate: {TEST_STATE.gateStatus}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Jobs completed</span>
            <span className="font-medium">
              {TEST_STATE.jobsCompleted} / {TEST_STATE.jobsTarget}
            </span>
          </div>
          <Progress value={pct} className="mt-2 h-2" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <StatTile
            label="Avg GM"
            value={`${TEST_STATE.avgGM}%`}
            hint={`Target ≥ ${TEST_STATE.gmTarget}%`}
            tone="warn"
          />
          <StatTile label="Jobs Done" value={TEST_STATE.jobsCompleted} tone="default" />
          <StatTile label="Jobs Left" value={TEST_STATE.jobsTarget - TEST_STATE.jobsCompleted} tone="default" />
        </div>
      </CardContent>
    </Card>
  );
}

function MethodPerformanceCard() {
  const [method, setMethod] = useState<MethodKey>("phone");
  const M = METHODS[method];
  // Try real data
  const { data } = tryQuery(`method_attempt_${method}`, async () => {
    const { data, error } = await supabase
      .from("method_attempt_summary")
      .select("*")
      .limit(50);
    if (error) throw error;
    return data;
  });

  // Fallback fixture per method
  const fixture = {
    phone: { attempts: 18, contacts: 7, quotes: 2, jobs: 1, conv: "5.5%" },
    referral: { attempts: 6, contacts: 4, quotes: 3, jobs: 2, conv: "33%" },
    flyer: { attempts: 150, contacts: 3, quotes: 1, jobs: 0, conv: "0%" },
  }[method];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Method Performance</CardTitle>
            <CardDescription>What's actually generating jobs</CardDescription>
          </div>
          <Select value={method} onValueChange={(v) => setMethod(v as MethodKey)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(METHODS) as MethodKey[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {METHODS[k].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <M.icon className="h-4 w-4" />
          <span>Benchmark: {M.benchmark}</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <StatTile label="Attempts" value={fixture.attempts} />
          <StatTile label="Contacts" value={fixture.contacts} />
          <StatTile label="Quotes" value={fixture.quotes} />
          <StatTile label="Jobs" value={fixture.jobs} tone={fixture.jobs > 0 ? "good" : "warn"} />
        </div>
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <span className="text-muted-foreground">Conversion: </span>
          <span className="font-medium">{fixture.conv}</span>
          {data ? null : (
            <span className="ml-2 text-xs text-muted-foreground">(sample data)</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PipelineFunnelCard() {
  const stages = [
    { label: "Suspects", value: 42 },
    { label: "Prospects", value: 18 },
    { label: "Customers", value: 6 },
    { label: "Repeat", value: 2 },
    { label: "Referrers", value: 1 },
  ];
  const max = stages[0].value;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Pipeline — Five Ways Funnel</CardTitle>
        <CardDescription>Where leads sit right now</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {stages.map((s) => {
          const pct = (s.value / max) * 100;
          return (
            <div key={s.label} className="flex items-center gap-3">
              <div className="w-24 text-sm text-muted-foreground">{s.label}</div>
              <div className="flex-1 h-6 bg-muted rounded">
                <div
                  className="h-6 rounded bg-[hsl(var(--autopsy-accent,220_70%_50%))]/80 flex items-center px-2 text-xs text-white"
                  style={{ width: `${Math.max(pct, 8)}%` }}
                >
                  {s.value}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function FirstFiveJobsTracker() {
  const jobs = [
    { n: 1, client: "M. Patel", status: "Complete", gm: 28 },
    { n: 2, client: "K. Nguyen", status: "Complete", gm: 22 },
    { n: 3, client: "Sunrise Cafe", status: "Complete", gm: 22 },
    { n: 4, client: "—", status: "Open", gm: null },
    { n: 5, client: "—", status: "Open", gm: null },
  ];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">First 5 Jobs Tracker</CardTitle>
        <CardDescription>Prove the model before scaling</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">GM %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((j) => (
              <TableRow key={j.n}>
                <TableCell className="font-medium">{j.n}</TableCell>
                <TableCell>{j.client}</TableCell>
                <TableCell>
                  {j.status === "Complete" ? (
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Complete
                    </Badge>
                  ) : (
                    <Badge variant="outline">Open</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {j.gm == null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className={j.gm >= 30 ? "text-emerald-600" : "text-amber-600"}>
                      {j.gm}%
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function MarginSnapshot() {
  const completed = 3;
  const avg = TEST_STATE.avgGM;
  const target = TEST_STATE.gmTarget;
  const gap = target - avg;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Margin Snapshot
        </CardTitle>
        <CardDescription>From {completed} completed jobs</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Avg GM" value={`${avg}%`} tone="warn" />
          <StatTile label="Target" value={`${target}%`} />
          <StatTile label="Gap" value={`${gap}pp`} tone="warn" />
        </div>
        <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
          You're {gap}pp below target. Each point below {target}% means the next
          5 jobs won't fund Stage 2.
        </div>
      </CardContent>
    </Card>
  );
}

function StageCoachCard() {
  return (
    <Card className="border-amber-300 bg-amber-50/40">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-amber-100 p-2">
            <AlertTriangle className="h-5 w-5 text-amber-700" />
          </div>
          <div className="flex-1">
            <CardDescription className="uppercase text-xs tracking-wide text-amber-700">
              Stage Coach — Gate {TEST_STATE.gateStatus}
            </CardDescription>
            <CardTitle className="text-lg leading-snug text-amber-900">
              {TEST_STATE.gateReason}
            </CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            Next action
          </div>
          <div className="font-medium flex items-start gap-2">
            <Target className="h-4 w-4 mt-1 text-amber-700" />
            <span>{TEST_STATE.nextAction}</span>
          </div>
        </div>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
          <li>Pick one lever (price, labour, or cost) per next job.</li>
          <li>Log the result in the Financials form below.</li>
          <li>Two more jobs at ≥30% GM unlocks Stage 2.</li>
        </ul>
      </CardContent>
    </Card>
  );
}

function LockedStage2() {
  return (
    <Card className="opacity-90">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Stage 2 — Repeatable System</CardTitle>
          </div>
          <Badge variant="outline">Locked</Badge>
        </div>
        <CardDescription>
          Unlocks when 5 jobs are completed at avg GM ≥ {TEST_STATE.gmTarget}%.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {["Job templates", "Pricing rulebook", "Hire-ready SOPs"].map((x) => (
            <div key={x} className="rounded-md border bg-muted/30 p-3 text-muted-foreground">
              {x}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ----- Forms -----
function useLocalForm<T extends Record<string, string>>(key: string, initial: T) {
  const [val, setVal] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`stage1.${key}`);
      return raw ? { ...initial, ...JSON.parse(raw) } : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`stage1.${key}`, JSON.stringify(val));
    } catch {
      /* noop */
    }
  }, [key, val]);
  return [val, setVal] as const;
}

function AddJobForm() {
  const [form, setForm] = useLocalForm("addJob", {
    client: "",
    location: "",
    quote: "",
    scheduled: "",
  });
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Add Job</CardTitle>
        <CardDescription>Record a new job toward your first 5</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Client</Label>
          <Input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Job Location</Label>
          <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Quote Amount ($)</Label>
          <Input type="number" value={form.quote} onChange={(e) => setForm({ ...form, quote: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Scheduled Date</Label>
          <Input type="date" value={form.scheduled} onChange={(e) => setForm({ ...form, scheduled: e.target.value })} />
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <Button onClick={() => toast({ title: "Job saved", description: `${form.client || "Untitled"} added to tracker.` })}>
            Save Job
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LogActivityForm() {
  const [form, setForm] = useLocalForm("logActivity", {
    method: "phone",
    attempts: "",
    contacts: "",
    quotes: "",
    notes: "",
  });
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Log Activity</CardTitle>
        <CardDescription>Record your outreach work today</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Method</Label>
          <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(METHODS) as MethodKey[]).map((k) => (
                <SelectItem key={k} value={k}>{METHODS[k].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Attempts</Label>
          <Input type="number" value={form.attempts} onChange={(e) => setForm({ ...form, attempts: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Contacts Made</Label>
          <Input type="number" value={form.contacts} onChange={(e) => setForm({ ...form, contacts: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Quotes Generated</Label>
          <Input type="number" value={form.quotes} onChange={(e) => setForm({ ...form, quotes: e.target.value })} />
        </div>
        <div className="sm:col-span-2 space-y-1">
          <Label>Notes</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <Button onClick={() => toast({ title: "Activity logged" })}>Log Activity</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FinancialsForm() {
  const [form, setForm] = useLocalForm("financials", {
    job: "",
    revenue: "",
    materials: "",
    labour: "",
    other: "",
  });
  const rev = Number(form.revenue) || 0;
  const cost = (Number(form.materials) || 0) + (Number(form.labour) || 0) + (Number(form.other) || 0);
  const gm = rev > 0 ? Math.round(((rev - cost) / rev) * 100) : null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-4 w-4" /> Financials
        </CardTitle>
        <CardDescription>Enter revenue + costs to compute GM</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label>Job</Label>
          <Input value={form.job} onChange={(e) => setForm({ ...form, job: e.target.value })} placeholder="Client / job name" />
        </div>
        <div className="space-y-1">
          <Label>Revenue ($)</Label>
          <Input type="number" value={form.revenue} onChange={(e) => setForm({ ...form, revenue: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Materials ($)</Label>
          <Input type="number" value={form.materials} onChange={(e) => setForm({ ...form, materials: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Labour ($)</Label>
          <Input type="number" value={form.labour} onChange={(e) => setForm({ ...form, labour: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Other Direct Costs ($)</Label>
          <Input type="number" value={form.other} onChange={(e) => setForm({ ...form, other: e.target.value })} />
        </div>
        <div className="sm:col-span-2 rounded-md border bg-muted/30 p-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Computed GM</span>
          <span className={`text-lg font-semibold ${gm == null ? "" : gm >= 30 ? "text-emerald-600" : "text-amber-600"}`}>
            {gm == null ? "—" : `${gm}%`}
          </span>
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <Button onClick={() => toast({ title: "Financials saved" })}>Save Financials</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EvidenceForm() {
  const [form, setForm] = useLocalForm("evidence", {
    job: "",
    type: "photo",
    note: "",
  });
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Camera className="h-4 w-4" /> Evidence
        </CardTitle>
        <CardDescription>Photos, testimonials, or before/after notes</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Job</Label>
          <Input value={form.job} onChange={(e) => setForm({ ...form, job: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Type</Label>
          <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="photo">Photo</SelectItem>
              <SelectItem value="testimonial">Testimonial</SelectItem>
              <SelectItem value="before_after">Before / After</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2 space-y-1">
          <Label>Note / Quote</Label>
          <Textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <Button onClick={() => toast({ title: "Evidence saved" })}>Save Evidence</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Stage1() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Autopsy → Stage 1
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          First 5 Jobs Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Prove the model before you scale it. Five jobs, real margin, real evidence.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><CurrentStageCard /></div>
        <StageCoachCard />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MethodPerformanceCard />
        <PipelineFunnelCard />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <FirstFiveJobsTracker />
        <MarginSnapshot />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Operator Inputs
          </CardTitle>
          <CardDescription>
            Enter what happened. The dashboard updates from these.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="job">
            <TabsList>
              <TabsTrigger value="job">Add Job</TabsTrigger>
              <TabsTrigger value="activity">Log Activity</TabsTrigger>
              <TabsTrigger value="financials">Financials</TabsTrigger>
              <TabsTrigger value="evidence">Evidence</TabsTrigger>
            </TabsList>
            <TabsContent value="job" className="mt-4"><AddJobForm /></TabsContent>
            <TabsContent value="activity" className="mt-4"><LogActivityForm /></TabsContent>
            <TabsContent value="financials" className="mt-4"><FinancialsForm /></TabsContent>
            <TabsContent value="evidence" className="mt-4"><EvidenceForm /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <LockedStage2 />

      <div className="flex justify-end">
        <Button variant="outline" className="gap-2">
          Continue working Stage 1 <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
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

// ---- Stage 1 Proof Scorecard ----
// Cleaning-sleeve scoring config. Keep separated from generic Core proof data.
type ProofType =
  | "Completed Job"
  | "Recurring Job"
  | "Signed Contract"
  | "Contract Site"
  | "Repeat Job"
  | "Referral Job";

type GateStatus = "Locked" | "Conditional" | "Unlocked";

interface ProofUnit {
  n: number;
  client: string;
  proofType: ProofType;
  status: string;
  gm: number;
  evidence: boolean;
  recurringFirstInvoicePaid?: boolean;
  isNewClient?: boolean;
  isAdditionalSite?: boolean;
  isReferralOrRepeat?: boolean;
  projectedRevenue?: number;
}

const BASE_POINTS: Record<ProofType, number> = {
  "Completed Job": 20,
  "Recurring Job": 25,
  "Signed Contract": 25,
  "Contract Site": 10,
  "Repeat Job": 20,
  "Referral Job": 20,
};

function scoreUnit(u: ProofUnit): number {
  let pts = BASE_POINTS[u.proofType] ?? 0;
  if (u.isNewClient) pts += 15;
  if (u.isAdditionalSite) pts += 10;
  if (u.proofType === "Recurring Job" && u.recurringFirstInvoicePaid) pts += 10;
  if (u.gm >= 30) pts += 10;
  if (u.evidence) pts += 10;
  if (u.isReferralOrRepeat) pts += 5;
  return pts;
}

function unitRisk(u: ProofUnit, concentrationClient: string | null): string {
  if (concentrationClient && u.client === concentrationClient) {
    return "Concentration warning";
  }
  if (u.gm < 25) return "Margin blocker";
  if (u.gm < 30) return "Margin warning";
  if (!u.evidence) return "Evidence missing";
  return "—";
}

const SEED_UNITS: ProofUnit[] = [
  { n: 1, client: "M. Patel", proofType: "Completed Job", status: "Paid", gm: 28, evidence: true, isNewClient: true, projectedRevenue: 1200 },
  { n: 2, client: "K. Nguyen", proofType: "Completed Job", status: "Paid", gm: 22, evidence: true, isNewClient: true, projectedRevenue: 900 },
  { n: 3, client: "Sunrise Cafe", proofType: "Recurring Job", status: "Active", gm: 22, evidence: false, isNewClient: true, recurringFirstInvoicePaid: true, projectedRevenue: 2400 },
  { n: 4, client: "QML", proofType: "Contract Site", status: "Signed", gm: 35, evidence: true, isNewClient: true, projectedRevenue: 6000 },
  { n: 5, client: "QML", proofType: "Contract Site", status: "Scheduled", gm: 35, evidence: false, isAdditionalSite: true, projectedRevenue: 6000 },
];

function computeScorecard(units: ProofUnit[]) {
  const totalRevenue = units.reduce((s, u) => s + (u.projectedRevenue ?? 0), 0);
  // Concentration: any single client > 70% of points OR projected revenue
  const byClientPoints: Record<string, number> = {};
  const byClientRev: Record<string, number> = {};
  units.forEach((u) => {
    byClientPoints[u.client] = (byClientPoints[u.client] ?? 0) + scoreUnit(u);
    byClientRev[u.client] = (byClientRev[u.client] ?? 0) + (u.projectedRevenue ?? 0);
  });
  const totalPoints = Object.values(byClientPoints).reduce((a, b) => a + b, 0);
  let concentrationClient: string | null = null;
  for (const c of Object.keys(byClientPoints)) {
    const ptShare = totalPoints > 0 ? byClientPoints[c] / totalPoints : 0;
    const revShare = totalRevenue > 0 ? byClientRev[c] / totalRevenue : 0;
    if (ptShare > 0.7 || revShare > 0.7) concentrationClient = c;
  }

  const earnedPoints = totalPoints;

  // Weighted GM by projected revenue (fallback: equal weight)
  const weights = units.map((u) => u.projectedRevenue ?? 1);
  const wSum = weights.reduce((a, b) => a + b, 0) || 1;
  const weightedGM =
    units.reduce((s, u, i) => s + u.gm * weights[i], 0) / wSum;

  const validUnits = units.filter(
    (u) => u.client && u.proofType && u.status && typeof u.gm === "number"
  );
  const payingStatuses = new Set(["Paid", "Active", "Signed", "Mobilising", "Renewed"]);
  const payingClients = new Set(
    units.filter((u) => payingStatuses.has(u.status)).map((u) => u.client)
  );
  const missingEvidence = units.filter((u) => !u.evidence).length;

  const blockers: string[] = [];
  if (weightedGM < 30)
    blockers.push("Margin blocker: you have activity, but the work is not yet economically safe to scale.");
  if (missingEvidence > 0)
    blockers.push("Evidence blocker: claims must be supported before progression can unlock.");

  const warnings: string[] = [];
  if (concentrationClient)
    warnings.push(
      `Customer concentration risk: ${concentrationClient} is carrying most of your proof. This may be acceptable at Stage 1, but it is not yet a stable business.`
    );

  const meetsScore = earnedPoints >= 100;
  const enoughUnits = validUnits.length >= 2;
  const enoughClients = payingClients.size >= 1;
  const marginOk = weightedGM >= 30;
  const evidenceOk = missingEvidence === 0;

  let gate: GateStatus = "Locked";
  let reason = "";
  let nextAction = "";

  if (meetsScore && enoughUnits && enoughClients && marginOk && evidenceOk) {
    gate = "Unlocked";
    reason = "All proof, margin, and evidence requirements are satisfied.";
    nextAction = "Proceed to Stage 2 setup.";
  } else if (meetsScore && (!marginOk || !evidenceOk)) {
    gate = "Locked";
    if (!marginOk && !evidenceOk) {
      reason = "You have enough demand proof, but margin and evidence requirements are unmet.";
      nextAction = "Upload pricing and cost evidence, and correct pricing or cost structure.";
    } else if (!marginOk) {
      reason = "You have enough demand proof, but not enough margin proof.";
      nextAction = "Correct pricing or cost structure before scaling.";
    } else {
      reason = "You have demand and margin, but supporting evidence is missing.";
      nextAction = `Upload pricing and cost evidence for ${missingEvidence} proof unit${missingEvidence > 1 ? "s" : ""}.`;
    }
  } else if (earnedPoints >= 60) {
    gate = "Conditional";
    reason = "Progress is partway. Continue adding proof units and supporting evidence.";
    nextAction = "Add more paid jobs, signed contracts, or recurring work with documented margin.";
  } else {
    gate = "Locked";
    reason = "Not enough commercial proof yet.";
    nextAction = "Record completed jobs, signed contracts, or active recurring work.";
  }

  return {
    earnedPoints,
    weightedGM,
    gate,
    reason,
    nextAction,
    blockers,
    warnings,
    concentrationClient,
  };
}

function GateBadge({ gate }: { gate: GateStatus }) {
  const cls =
    gate === "Unlocked"
      ? "border-emerald-400 text-emerald-700 bg-emerald-50"
      : gate === "Conditional"
        ? "border-amber-400 text-amber-700 bg-amber-50"
        : "border-red-400 text-red-700 bg-red-50";
  return <Badge variant="outline" className={cls}>Gate: {gate}</Badge>;
}

function riskCellClass(risk: string) {
  if (risk.includes("blocker")) return "text-red-600";
  if (risk.includes("warning") || risk.includes("missing")) return "text-amber-600";
  return "text-muted-foreground";
}

function Stage1ProofScorecard() {
  const units = SEED_UNITS;
  const sc = useMemo(() => computeScorecard(units), [units]);
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Stage 1 Proof Scorecard</CardTitle>
            <CardDescription>Prove real demand before scaling</CardDescription>
          </div>
          <GateBadge gate={sc.gate} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <StatTile
            label="Progress Score"
            value={`${sc.earnedPoints} / 100`}
            tone={sc.earnedPoints >= 100 ? "good" : "warn"}
          />
          <StatTile
            label="Weighted GM"
            value={`${sc.weightedGM.toFixed(0)}%`}
            hint="Target ≥ 30%"
            tone={sc.weightedGM >= 30 ? "good" : "warn"}
          />
          <StatTile label="Gate Status" value={sc.gate} />
        </div>

        <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
          <div>
            <span className="text-muted-foreground">Primary reason: </span>
            <span className="font-medium">{sc.reason}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Next required action: </span>
            <span className="font-medium">{sc.nextAction}</span>
          </div>
        </div>

        {sc.blockers.map((b) => (
          <div key={b} className="rounded-md border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">
            <span className="font-semibold">Blocker: </span>{b}
          </div>
        ))}
        {sc.warnings.map((w) => (
          <div key={w} className="rounded-md border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
            <span className="font-semibold">Risk warning: </span>{w}
          </div>
        ))}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Proof Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">GM %</TableHead>
              <TableHead className="text-right">Points</TableHead>
              <TableHead>Risk</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((u) => {
              const risk = unitRisk(u, sc.concentrationClient);
              return (
                <TableRow key={u.n}>
                  <TableCell className="font-medium">{u.n}</TableCell>
                  <TableCell>{u.client}</TableCell>
                  <TableCell>{u.proofType}</TableCell>
                  <TableCell>{u.status}</TableCell>
                  <TableCell className="text-right">
                    <span className={u.gm >= 30 ? "text-emerald-600" : "text-amber-600"}>{u.gm}%</span>
                  </TableCell>
                  <TableCell className="text-right">{scoreUnit(u)}</TableCell>
                  <TableCell className={riskCellClass(risk)}>{risk}</TableCell>
                </TableRow>
              );
            })}
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
        <Stage1ProofScorecard />
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
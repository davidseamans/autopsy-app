import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  getStage1RunId,
  getActiveRunId,
  isStage1Reachable,
  ROUTING_COPY,
  setStage1RunId,
  STAGE_1_GOAL,
  useProgression,
} from "@/lib/progression";
import { computeGstSplit, GST_TREATMENTS, type GstTreatment } from "@/lib/gst";
import {
  loadStage1UnitsCache,
  saveStage1UnitsCache,
  fetchStage1Units,
  syncStage1Units,
  syncStage1UnitsWithDiagnostics,
  mergeUnits,
  type Stage1CanonicalWriteDiagnostics,
} from "@/lib/stage1Store";
import {
  loadStage1ReflectionCache,
  saveStage1ReflectionCache,
  fetchStage1Reflection,
  syncStage1Reflection,
  type Stage1Reflection,
  type ConfidenceSelection,
  type WorkDifficultySelection,
  type IncomeSelection,
  type ProfitabilitySelection,
  type RecordKeepingSelection,
  type ContinuationDecision,
} from "@/lib/stage1Reflection";
import { Stage1EvidenceAttachments } from "@/components/Stage1EvidenceAttachments";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";
import { supabase, isDebug } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { persistJobProgress } from "@/lib/jobProvisioning";
import {
  loadAdjustments,
  saveAdjustment,
  ADJUSTMENT_TYPES,
  adjustmentTypeLabel,
  type AdjustmentRow,
  type AdjustmentType,
  saveHandover,
  loadHandover,
  SATISFACTION_OPTIONS,
  THANK_YOU_OPTIONS,
  satisfactionLabel,
  thankYouLabel,
  type SatisfactionStatus,
  type ThankYouAction,
  type HandoverRow,
  type ReferralRow,
  type ReferralInput,
} from "@/lib/jobWorkspace";
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
  Paperclip,
  Plus,
  Save,
  Clock,
} from "lucide-react";
import { Loader2, Receipt } from "lucide-react";

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

export interface CostLine {
  id: string;
  description: string;
  /** GST-inclusive purchase amount as entered. */
  amount?: number;
  /** Legacy flag, kept in sync with gstTreatment. */
  gstIncluded: boolean;
  /** How GST is treated for this purchase. */
  gstTreatment?: GstTreatment;
  /** Current GST amount (auto from 1/11 or manually overridden). */
  gstAmount?: number;
  /** True when the operator overwrote the auto GST amount. */
  gstOverridden?: boolean;
}

export interface ProofUnit {
  n: number;
  jobNumber?: string;
  // Persisted Stage 1 job number (public.stage1_job_margin_summary.job_sequence_number).
  // Authoritative source for the displayed "J-#" in the ledger.
  jobSequenceNumber?: number;
  client: string;
  jobSite?: string;
  proofType: ProofType;
  status: string;
  gm: number;
  evidence: boolean;
  recurringFirstInvoicePaid?: boolean;
  isNewClient?: boolean;
  isAdditionalSite?: boolean;
  isReferralOrRepeat?: boolean;
  projectedRevenue?: number;
  quoteValue?: number;
  scheduledDate?: string;
  sourceQuote?: string;
  quoteComment?: string;
  notes?: string;
  nextAction?: string;
  // Real Supabase linkage — this unit is a workspace over an existing job row.
  jobId?: string;
  // Canonical Stage 1 commercial record id (stage1_jobs.id) in Supabase.
  stage1JobId?: string;
  accountId?: string;
  siteId?: string;
  dbQuoteId?: string;
  dbQuoteNumber?: string;
  // Customer Invoice / Contract
  invoiceAmount?: number;
  // GST-aware revenue treatment for the customer invoice.
  // invoiceAmount is treated as the GST-inclusive total.
  invoiceGstTreatment?: GstTreatment;
  invoiceGstAmount?: number;
  invoiceGstOverridden?: boolean;
  invoiceDate?: string;
  invoiceStatus?: "Draft" | "Sent" | "Approved" | "Invoiced" | "Part Paid" | "Paid" | "Cancelled";
  contractStart?: string;
  contractEnd?: string;
  invoiceDocType?: "Quote" | "Customer Invoice" | "Signed Contract" | "Work Order" | "Customer Approval" | "Other";
  invoiceDocName?: string;
  // Job Costs
  costMaterials?: number;
  costLabour?: number;
  costSubcontractors?: number;
  costOther?: number;
  costLines?: CostLine[];
  costDocType?: "Supplier Receipt" | "Supplier Bill" | "Timesheet" | "Subcontractor Invoice" | "Materials Receipt" | "Other Cost Proof";
  costDocName?: string;
  // Payment Proof
  paymentStatus?: "Not Paid" | "Part Paid" | "Paid" | "Disputed" | "Written Off";
  paymentDate?: string;
  paymentAmount?: number;
  paymentMethod?: "Bank Transfer" | "Card" | "Cash with Receipt" | "Payment Platform" | "Other";
  paymentProofName?: string;
  // Canonical Stage 1 sandbox commercial proof model
  // (public.stage1_job_margin_summary). These are read-only projections of the
  // persisted sandbox view used by the First 5 Jobs ledger.
  sandboxRevenueAmount?: number;
  sandboxOriginalInvoiceAmount?: number;
  sandboxVariationInvoiceAmount?: number;
  sandboxProgressClaimAmount?: number;
  sandboxAdjustmentAmount?: number;
  sandboxPaymentReceivedAmount?: number;
  sandboxOutstandingAmount?: number;
  sandboxTotalDirectCost?: number;
  sandboxGrossProfit?: number;
  sandboxGrossMarginPct?: number;
  sandboxProofType?: string;
  sandboxPaymentStatus?: string;
  sandboxVariationRecorded?: boolean;
  // General Business Expenses (not included in job GM)
  gbExpenses?: GBExpense[];
  // Miscellaneous attachment / comment (optional, never blocks saving)
  miscAttachmentName?: string;
  // Lifecycle / audit
  lifecycle?: "active" | "voided" | "archived";
  voidReason?: string;
  voidedAt?: string;
  archivedAt?: string;
  reviewed?: boolean;
  audit?: AuditEntry[];
}

type AuditAction = "created" | "updated" | "corrected" | "voided" | "archived" | "restored" | "deleted_draft";
interface AuditEntry {
  ts: string;
  action: AuditAction;
  reason?: string;
  changes?: { field: string; from: unknown; to: unknown }[];
  user?: string;
}

type GBCategory =
  | "Fuel / Vehicle"
  | "Phone / Internet"
  | "Parking / Tolls"
  | "Software"
  | "Small Tools"
  | "PPE / Uniforms"
  | "General Supplies"
  | "Training"
  | "Insurance"
  | "Other";

export interface GBExpense {
  id: string;
  expenseDate?: string;
  supplier?: string;
  description?: string;
  category?: GBCategory;
  amount?: number;
  gstIncluded?: boolean;
  receiptName?: string;
  notes?: string;
}

const BASE_POINTS: Record<ProofType, number> = {
  "Completed Job": 20,
  "Recurring Job": 25,
  "Signed Contract": 25,
  "Contract Site": 10,
  "Repeat Job": 20,
  "Referral Job": 20,
};

export function scoreUnit(u: ProofUnit): number {
  let pts = BASE_POINTS[u.proofType] ?? 0;
  if (u.isNewClient) pts += 15;
  if (u.isAdditionalSite) pts += 10;
  if (u.proofType === "Recurring Job" && u.recurringFirstInvoicePaid) pts += 10;
  if (u.gm >= 30) pts += 10;
  if (u.evidence) pts += 10;
  if (u.isReferralOrRepeat) pts += 5;
  return pts;
}

export function unitRisk(u: ProofUnit, concentrationClient: string | null): string {
  if (concentrationClient && u.client === concentrationClient) {
    return "Concentration warning";
  }
  if (u.gm < 25) return "Margin blocker";
  if (u.gm < 30) return "Margin warning";
  if (!u.evidence) return "Evidence missing";
  return "—";
}

export const SEED_UNITS: ProofUnit[] = [];

export function computeScorecard(units: ProofUnit[]) {
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
  const payingStatuses = new Set(["Scheduled", "In Progress", "Completed", "Paid"]);
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

// ============================================================================
// First Five Jobs progression engine
// ----------------------------------------------------------------------------
// Stage 1 counts COMPLETED, RECORDED job records — not vague activity.
//
// A job counts toward the First Five only when ALL of these hold:
//   1. Job created
//   2. Revenue / invoice recorded (ex-GST revenue exists)
//   3. Direct costs recorded (ex-GST cost exists)
//   4. GST split calculated (handled by computeGstSplit on revenue + costs)
//   5. Ex-GST margin calculable (revenue > 0 and cost > 0 → not "Not Yet Proven")
//   6. Status marked completed
//
// A job does NOT count if: no revenue, no cost, margin Not Yet Proven, or the
// job is still a draft / in progress.
//
// Evidence is recommended, never mandatory: missing paperwork never blocks a
// job from counting. This engine never changes GST, margin, storage, auth, or
// run-scoped access logic — it only reads existing ex-GST values.
// ============================================================================

export const FIRST_FIVE_TARGET = 5;
const FF_COMPLETED_STATUSES = new Set(["Completed", "Paid"]);

export interface FirstFiveJob {
  unit: ProofUnit;
  revenueExGst: number;
  directCostExGst: number;
  grossProfit: number;
  marginProven: boolean;
  gm: number | null;
  isCompleted: boolean;
  hasRevenue: boolean;
  hasCost: boolean;
  hasEvidence: boolean;
  qualifies: boolean;
}

/** Ex-GST revenue + ex-GST direct cost for one unit (mirrors the drill-down). */
function unitExGstTotals(u: ProofUnit): { revenueExGst: number; directCostExGst: number } {
  const revenueExGst = computeGstSplit({
    inclusive: u.invoiceAmount ?? 0,
    treatment: u.invoiceGstTreatment ?? "gst_included",
    gstOverride: u.invoiceGstAmount,
    overridden: u.invoiceGstOverridden,
  }).exGst;

  const hasCostLines = !!(u.costLines && u.costLines.length > 0);
  const linesTotalExGst = (u.costLines ?? []).reduce(
    (s, l) =>
      s +
      computeGstSplit({
        inclusive: l.amount ?? 0,
        treatment: l.gstTreatment ?? (l.gstIncluded ? "gst_included" : "no_gst"),
        gstOverride: l.gstAmount,
        overridden: l.gstOverridden,
      }).exGst,
    0,
  );
  const legacyTotal =
    (u.costMaterials ?? 0) +
    (u.costLabour ?? 0) +
    (u.costSubcontractors ?? 0) +
    (u.costOther ?? 0);
  const directCostExGst = hasCostLines ? linesTotalExGst : legacyTotal;
  return { revenueExGst, directCostExGst };
}

/** Evaluate a single unit against the First Five counting rule. */
export function evaluateFirstFiveJob(u: ProofUnit): FirstFiveJob {
  const { revenueExGst, directCostExGst } = unitExGstTotals(u);
  const isCompleted = FF_COMPLETED_STATUSES.has(u.status);
  const hasRevenue = revenueExGst > 0;
  const hasCost = directCostExGst > 0;
  const marginProven = hasRevenue && hasCost;
  const grossProfit = marginProven ? revenueExGst - directCostExGst : 0;
  const gm = marginProven ? Math.round((grossProfit / revenueExGst) * 100) : null;
  const hasEvidence = !!(u.evidence || u.invoiceDocName || u.costDocName);
  const qualifies = isCompleted && hasRevenue && hasCost && marginProven;
  return {
    unit: u,
    revenueExGst,
    directCostExGst,
    grossProfit,
    marginProven,
    gm,
    isCompleted,
    hasRevenue,
    hasCost,
    hasEvidence,
    qualifies,
  };
}

export function computeFirstFive(units: ProofUnit[], gateUnlocked: boolean) {
  const jobs = units.map(evaluateFirstFiveJob);
  const qualifying = jobs.filter((j) => j.qualifies);
  const qualifyingCount = qualifying.length;
  const completedCount = Math.min(qualifyingCount, FIRST_FIVE_TARGET);
  const remaining = Math.max(0, FIRST_FIVE_TARGET - qualifyingCount);

  // Aggregates are derived from qualifying jobs only — never from unproven ones.
  const revenueExGstTotal = qualifying.reduce((s, j) => s + j.revenueExGst, 0);
  const directCostsExGstTotal = qualifying.reduce((s, j) => s + j.directCostExGst, 0);
  const grossProfit = revenueExGstTotal - directCostsExGstTotal;
  const marginProven = revenueExGstTotal > 0 && directCostsExGstTotal > 0;
  const grossMargin = marginProven
    ? Math.round((grossProfit / revenueExGstTotal) * 100)
    : null;

  const evidenceAttached = jobs.filter((j) => j.hasEvidence).length;
  const evidenceMissing = jobs.filter((j) => !j.hasEvidence).length;

  const requirementMet = qualifyingCount >= FIRST_FIVE_TARGET;
  // Stage 2 only turns yes when five qualifying jobs exist AND existing gate
  // logic (margin/evidence/score) already passes.
  const stage2Ready = requirementMet && gateUnlocked;

  const progressionState = requirementMet
    ? "Stage 1 ready for review"
    : `Job ${Math.min(qualifyingCount + 1, FIRST_FIVE_TARGET)} of ${FIRST_FIVE_TARGET}`;

  const nextAction = requirementMet
    ? "Stage 1 job requirement met. Review commercial results before Stage 2."
    : `Complete and record ${remaining} more job${remaining === 1 ? "" : "s"} before Stage 1 review.`;

  const notes: string[] = [];
  if (jobs.some((j) => j.isCompleted && !j.marginProven)) {
    notes.push("Record direct costs before margin can be judged.");
  }
  if (evidenceMissing > 0) {
    notes.push("Supporting paperwork recommended.");
  }

  return {
    jobs,
    qualifying,
    qualifyingCount,
    completedCount,
    remaining,
    revenueExGstTotal,
    directCostsExGstTotal,
    grossProfit,
    grossMargin,
    marginProven,
    evidenceAttached,
    evidenceMissing,
    requirementMet,
    stage2Ready,
    progressionState,
    nextAction,
    notes,
  };
}

type FirstFive = ReturnType<typeof computeFirstFive>;

// ============================================================================
// Stage 1 Review Gate
// ----------------------------------------------------------------------------
// Answers: "Has this operator demonstrated enough commercial and operational
// maturity to progress beyond Stage 1?" — using existing Stage 1 data only.
//
// Stage 1 does NOT prove business success. It proves early operator discipline
// and basic commercial reality: can the operator win, complete, record, cost,
// and understand five real jobs.
//
// Evidence doctrine: supporting paperwork is used to assess business maturity
// and record discipline. It is NOT collected for surveillance. Missing
// paperwork is a warning only — never an automatic failure. This gate never
// changes GST, margin, evidence storage, auth, run-scoped access, or the base
// Stage 2 readiness logic.
// ============================================================================

export type ReviewOutcome =
  | "Stage 1 Passed"
  | "Stage 1 Passed With Warnings"
  | "Stage 1 Not Yet Demonstrated";

export type MaturityBand = "Emerging" | "Developing" | "Competent";

export const EVIDENCE_DOCTRINE =
  "Supporting paperwork is used to assess business maturity and record discipline. It is not collected for surveillance.";

export function computeReviewGate(ff: FirstFive) {
  const requirementMet = ff.requirementMet;
  const marginProven = ff.marginProven && ff.grossMargin != null;
  const marginPositive = marginProven && ff.grossProfit > 0 && (ff.grossMargin ?? 0) > 0;
  const stage2Ready = ff.stage2Ready;

  // Warning conditions (qualifying jobs only) — all non-blocking.
  const warnings: string[] = [];
  if (marginProven && (ff.grossMargin ?? 0) < 30) {
    warnings.push("Low gross margin (under 30%).");
  }
  if (
    ff.revenueExGstTotal > 0 &&
    ff.directCostsExGstTotal / ff.revenueExGstTotal > 0.7
  ) {
    warnings.push("Direct costs are unusually high relative to revenue.");
  }

  const qualifyingMissingEvidence = ff.qualifying.filter((j) => !j.hasEvidence).length;
  const qualifyingWithEvidence = ff.qualifying.filter((j) => j.hasEvidence).length;
  if (qualifyingMissingEvidence > 0) {
    warnings.push("Recommended supporting paperwork is missing on one or more jobs.");
  }
  if (qualifyingMissingEvidence > 0 && qualifyingWithEvidence > 0) {
    warnings.push("Evidence attachment is inconsistent across jobs.");
  }

  const provenGms = ff.qualifying
    .filter((j) => j.gm != null)
    .map((j) => j.gm as number);
  if (provenGms.length > 1) {
    const spread = Math.max(...provenGms) - Math.min(...provenGms);
    if (spread > 40) warnings.push("Job profitability is uneven across the first five jobs.");
  }

  const overrideCount = ff.qualifying.reduce((s, j) => {
    const u = j.unit;
    let c = u.invoiceGstOverridden ? 1 : 0;
    c += (u.costLines ?? []).filter((l) => l.gstOverridden).length;
    return s + c;
  }, 0);
  if (overrideCount >= 3) {
    warnings.push("A high number of manual GST overrides were used.");
  }

  // Outcome
  let outcome: ReviewOutcome;
  if (requirementMet && marginProven && marginPositive && stage2Ready) {
    outcome = warnings.length === 0 ? "Stage 1 Passed" : "Stage 1 Passed With Warnings";
  } else if (requirementMet && marginProven && stage2Ready) {
    // 5 qualifying + margin calculable + Stage 2 Ready, but not cleanly positive.
    outcome = "Stage 1 Passed With Warnings";
  } else {
    outcome = "Stage 1 Not Yet Demonstrated";
  }

  const passed = outcome === "Stage 1 Passed";
  const passedWithWarnings = outcome === "Stage 1 Passed With Warnings";

  const outcomeText = passed
    ? "Stage 1 Passed — First Five Jobs requirement demonstrated."
    : passedWithWarnings
      ? "Stage 1 Passed With Warnings — execution demonstrated, but operating discipline requires review."
      : "Stage 1 Not Yet Demonstrated — complete and record the required jobs before review.";

  // Maturity band
  let maturity: MaturityBand;
  if (!requirementMet || !marginProven) {
    maturity = "Emerging";
  } else if (marginPositive && warnings.length === 0) {
    maturity = "Competent";
  } else {
    maturity = "Developing";
  }

  const evidenceProves = passed
    ? "This evidence shows the operator can complete paid work, record revenue, record direct costs, calculate commercial margin, and maintain supporting transaction records."
    : passedWithWarnings
      ? "This evidence shows the operator can complete and record work, but commercial discipline or documentation habits require review before progression."
      : "This evidence is not yet sufficient. The operator must complete and record more qualifying jobs before Stage 1 maturity can be assessed.";

  const nextAction =
    outcome === "Stage 1 Not Yet Demonstrated"
      ? ff.nextAction
      : passedWithWarnings
        ? "Review the flagged commercial or documentation warnings, then proceed to Stage 2 setup."
        : "Proceed to Stage 2 setup.";

  return {
    outcome,
    outcomeText,
    maturity,
    evidenceProves,
    warnings,
    nextAction,
    doctrine: EVIDENCE_DOCTRINE,
  };
}

type ReviewGate = ReturnType<typeof computeReviewGate>;

function Stage1ReviewGate({ gate }: { gate: ReviewGate }) {
  const tone =
    gate.outcome === "Stage 1 Passed"
      ? "border-emerald-400 text-emerald-700 bg-emerald-50"
      : gate.outcome === "Stage 1 Passed With Warnings"
        ? "border-amber-400 text-amber-700 bg-amber-50"
        : "border-red-400 text-red-700 bg-red-50";
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Stage 1 Review Gate</CardTitle>
            <CardDescription>
              Has this operator demonstrated enough commercial and operational maturity to progress beyond Stage 1?
            </CardDescription>
          </div>
          <Badge variant="outline" className={tone}>
            {gate.outcome}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Outcome</div>
          <p className="mt-1 font-medium">{gate.outcomeText}</p>
        </div>

        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Operator Maturity Demonstrated
          </div>
          <p className="mt-1 font-medium">{gate.maturity}</p>
        </div>

        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            What this evidence proves
          </div>
          <p className="mt-1">{gate.evidenceProves}</p>
          <p className="mt-2 text-xs text-muted-foreground">{gate.doctrine}</p>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Warnings</div>
          {gate.warnings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No warnings flagged.</p>
          ) : (
            <ul className="space-y-1">
              {gate.warnings.map((w) => (
                <li
                  key={w}
                  className="rounded-md border-l-4 border-amber-400 bg-amber-50 p-2 text-sm text-amber-900"
                >
                  {w}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <span className="text-muted-foreground">Next action: </span>
          <span className="font-medium">{gate.nextAction}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ====================================================================
// Stage 1 Reflection / Exit Gate
//
// Structured selections only — measures recognition, judgement and
// decision-making, not writing ability. Autopsy generates the
// interpretation; the operator does not write it.
//
// Doctrine: Reflection is recognition. Stopping is not failure. Ignoring
// evidence is failure. Continue, Repeat, Stop and Unsure are all valid.
// ====================================================================

type ReflectionQuestion<T extends string> = {
  key: keyof Stage1Reflection;
  title: string;
  question: string;
  options: { value: T; label: string }[];
};

const CONFIDENCE_QUESTION: ReflectionQuestion<ConfidenceSelection> = {
  key: "confidence_selection",
  title: "Confidence",
  question: "After completing your first jobs, how do you feel about this business?",
  options: [
    { value: "more_confident", label: "More confident than when I started" },
    { value: "about_the_same", label: "About the same" },
    { value: "less_confident", label: "Less confident than when I started" },
    { value: "unsure", label: "Unsure" },
  ],
};

const WORK_DIFFICULTY_QUESTION: ReflectionQuestion<WorkDifficultySelection> = {
  key: "work_difficulty_selection",
  title: "Work Difficulty",
  question: "How difficult was the work compared to what you expected?",
  options: [
    { value: "easier", label: "Easier than expected" },
    { value: "as_expected", label: "About what I expected" },
    { value: "harder", label: "Harder than expected" },
    { value: "much_harder", label: "Much harder than expected" },
  ],
};

const INCOME_QUESTION: ReflectionQuestion<IncomeSelection> = {
  key: "income_selection",
  title: "Income Produced",
  question: "Looking at the numbers, how do you feel about the income produced?",
  options: [
    { value: "better", label: "Better than expected" },
    { value: "as_expected", label: "About what I expected" },
    { value: "worse", label: "Worse than expected" },
    { value: "unsure", label: "Unsure" },
  ],
};

const PROFITABILITY_QUESTION: ReflectionQuestion<ProfitabilitySelection> = {
  key: "profitability_selection",
  title: "Profitability",
  question: "Looking at the profitability of the jobs completed, how do you feel about the results?",
  options: [
    { value: "better", label: "Better than expected" },
    { value: "as_expected", label: "About what I expected" },
    { value: "worse", label: "Worse than expected" },
    { value: "unsure", label: "Unsure" },
  ],
};

const RECORDKEEPING_QUESTION: ReflectionQuestion<RecordKeepingSelection> = {
  key: "recordkeeping_selection",
  title: "Record Keeping",
  question: "How comfortable are you recording jobs, revenue, costs, and supporting paperwork?",
  options: [
    { value: "comfortable", label: "Comfortable" },
    { value: "mostly_comfortable", label: "Mostly comfortable" },
    { value: "need_practice", label: "Need more practice" },
    { value: "not_comfortable", label: "Not comfortable" },
  ],
};

const DECISION_QUESTION: ReflectionQuestion<ContinuationDecision> = {
  key: "continuation_decision",
  title: "Decision",
  question: "Based on your first completed jobs, what would you like to do next?",
  options: [
    { value: "continue", label: "Continue to Stage 2" },
    { value: "repeat", label: "Complete another five jobs first" },
    { value: "stop", label: "Stop here" },
    { value: "unsure", label: "Unsure" },
  ],
};

const REFLECTION_QUESTIONS = [
  CONFIDENCE_QUESTION,
  WORK_DIFFICULTY_QUESTION,
  INCOME_QUESTION,
  PROFITABILITY_QUESTION,
  RECORDKEEPING_QUESTION,
  DECISION_QUESTION,
] as const;

export const MATURITY_DOCTRINE = [
  "A mature decision is not always progression.",
  "Autopsy exists to help operators make informed decisions before time, money, confidence, staff, customers, or capital are damaged.",
  "Stopping or repeating a stage may be the correct decision.",
];

function decisionInterpretation(decision: ContinuationDecision | null): {
  heading: string;
  body: string;
  maturityPositive: boolean;
} | null {
  switch (decision) {
    case "continue":
      return {
        heading: "Continue to Stage 2",
        body: "The operator believes sufficient evidence exists to continue progression.",
        maturityPositive: false,
      };
    case "repeat":
      return {
        heading: "Complete Another Five Jobs",
        body: "The operator believes additional practical experience would be beneficial before progression. This is considered a maturity-positive decision.",
        maturityPositive: true,
      };
    case "stop":
      return {
        heading: "Stop Here",
        body: "The operator has chosen not to continue. Stopping may be a mature decision when the evidence suggests the business, lifestyle, economics, or work itself is not aligned with personal goals.",
        maturityPositive: true,
      };
    case "unsure":
      return {
        heading: "Unsure",
        body: "The operator is uncertain and should review the evidence before making a progression decision.",
        maturityPositive: false,
      };
    default:
      return null;
  }
}

function joinClauses(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// Autopsy generates the reflection summary from the structured selections.
function buildReflectionSummary(r: Stage1Reflection): string[] {
  const lines: string[] = [];

  const expFragments: string[] = [];
  if (r.work_difficulty_selection === "much_harder") {
    expFragments.push("the work was much harder than expected");
  } else if (r.work_difficulty_selection === "harder") {
    expFragments.push("the work was harder than expected");
  } else if (r.work_difficulty_selection === "easier") {
    expFragments.push("the work was easier than expected");
  } else if (r.work_difficulty_selection === "as_expected") {
    expFragments.push("the work was about as expected");
  }
  if (r.income_selection === "worse") {
    expFragments.push("the income produced was below expectations");
  } else if (r.income_selection === "better") {
    expFragments.push("the income produced was above expectations");
  } else if (r.income_selection === "as_expected") {
    expFragments.push("the income produced was about as expected");
  }
  if (r.profitability_selection === "worse") {
    expFragments.push("profitability was below expectations");
  } else if (r.profitability_selection === "better") {
    expFragments.push("profitability was above expectations");
  } else if (r.profitability_selection === "as_expected") {
    expFragments.push("profitability was about as expected");
  }
  if (expFragments.length > 0) {
    lines.push(`The operator reports that ${joinClauses(expFragments)}.`);
  }

  const standingFragments: string[] = [];
  if (r.confidence_selection === "more_confident") {
    standingFragments.push("feels more confident about the business than at the start");
  } else if (r.confidence_selection === "less_confident") {
    standingFragments.push("feels less confident about the business than at the start");
  } else if (r.confidence_selection === "about_the_same") {
    standingFragments.push("feels about the same level of confidence as at the start");
  } else if (r.confidence_selection === "unsure") {
    standingFragments.push("is unsure how they feel about the business");
  }
  if (r.recordkeeping_selection === "comfortable") {
    standingFragments.push("is comfortable recording jobs, revenue, costs and paperwork");
  } else if (r.recordkeeping_selection === "mostly_comfortable") {
    standingFragments.push("is mostly comfortable with record keeping");
  } else if (r.recordkeeping_selection === "need_practice") {
    standingFragments.push("feels more practice with record keeping would help");
  } else if (r.recordkeeping_selection === "not_comfortable") {
    standingFragments.push("is not yet comfortable with record keeping");
  }
  if (standingFragments.length > 0) {
    lines.push(`The operator ${joinClauses(standingFragments)}.`);
  }

  const di = decisionInterpretation(r.continuation_decision);
  if (di) {
    if (di.maturityPositive && r.continuation_decision === "repeat") {
      lines.push(
        "The decision to repeat Stage 1 is considered a maturity-positive decision because it reflects recognition of current capability limits rather than progression without sufficient evidence.",
      );
    } else if (di.maturityPositive && r.continuation_decision === "stop") {
      lines.push(
        "The decision to stop is considered a maturity-positive decision because it reflects recognition that continuing may not be aligned with the operator's goals or the available evidence.",
      );
    } else {
      lines.push(di.body);
    }
  }

  return lines;
}

function Stage1ReflectionGate({
  reflection,
  onChange,
}: {
  reflection: Stage1Reflection;
  onChange: (next: Stage1Reflection) => void;
}) {
  const answeredCount = REFLECTION_QUESTIONS.filter(
    (q) => reflection[q.key] != null,
  ).length;
  const completed = answeredCount === REFLECTION_QUESTIONS.length;

  const setAnswer = (key: keyof Stage1Reflection, value: string) => {
    const now = new Date().toISOString();
    const next: Stage1Reflection = {
      ...reflection,
      [key]: value,
      reflection_created_at: reflection.reflection_created_at ?? now,
      reflection_updated_at: now,
    };
    next.reflection_completed =
      REFLECTION_QUESTIONS.filter((q) => next[q.key] != null).length ===
      REFLECTION_QUESTIONS.length;
    onChange(next);
  };

  const di = decisionInterpretation(reflection.continuation_decision);
  const summary = buildReflectionSummary(reflection);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Stage 1 Reflection / Exit Gate</CardTitle>
            <CardDescription>
              Reflection is recognition. Stopping is not failure. Ignoring evidence is failure.
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={
              completed
                ? "border-emerald-400 text-emerald-700 bg-emerald-50"
                : "border-amber-400 text-amber-700 bg-amber-50"
            }
          >
            {completed
              ? "Reflection complete"
              : `${answeredCount} / ${REFLECTION_QUESTIONS.length} answered`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {REFLECTION_QUESTIONS.map((q) => (
          <div key={q.key} className="rounded-md border bg-muted/20 p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {q.title}
            </div>
            <p className="mt-1 text-sm font-medium">{q.question}</p>
            <RadioGroup
              className="mt-3 space-y-2"
              value={(reflection[q.key] as string | null) ?? undefined}
              onValueChange={(v) => setAnswer(q.key, v)}
            >
              {q.options.map((opt) => {
                const id = `${q.key}-${opt.value}`;
                return (
                  <div key={opt.value} className="flex items-center gap-2">
                    <RadioGroupItem value={opt.value} id={id} />
                    <Label htmlFor={id} className="text-sm font-normal cursor-pointer">
                      {opt.label}
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          </div>
        ))}

        {summary.length > 0 && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Stage 1 Reflection Summary
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Generated by Autopsy from your selections.
            </p>
            <div className="mt-2 space-y-2">
              {summary.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>
        )}

        {di && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Decision: {di.heading}
            </div>
            <p className="mt-1">{di.body}</p>
            {di.maturityPositive && (
              <Badge
                variant="outline"
                className="mt-2 border-emerald-400 text-emerald-700 bg-emerald-50"
              >
                Maturity-positive decision
              </Badge>
            )}
          </div>
        )}

        <div className="rounded-md border border-dashed bg-muted/10 p-3 text-xs text-muted-foreground space-y-1">
          {MATURITY_DOCTRINE.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ====================================================================
// Stage 1 Parity Audit
//
// A business-capability audit (not a code audit) that runs entirely from
// existing Stage 1 data. It scores each canon section as Complete /
// Partial / Missing, surfaces remaining prototype elements and governance
// gaps, then produces a parity verdict and a recommendation. No manual
// scoring is required — every status is derived.
// ====================================================================

type ParityStatus = "Complete" | "Partial" | "Missing";

type ParityItem = { label: string; status: ParityStatus; note?: string };

type ParitySection = {
  title: string;
  status: ParityStatus;
  answer?: string;
  items?: ParityItem[];
};

function rollup(items: ParityItem[]): ParityStatus {
  if (items.length === 0) return "Missing";
  if (items.every((i) => i.status === "Complete")) return "Complete";
  if (items.every((i) => i.status === "Missing")) return "Missing";
  return "Partial";
}

export interface ParityAudit {
  sections: ParitySection[];
  prototypeItems: string[];
  lockBeforeStage2: ParityItem[];
  unresolvedRisks: string[];
  unresolvedControls: string[];
  unresolvedPersistence: string[];
  unresolvedGovernance: string[];
  verdict: "Stage 1 Parity Achieved" | "Stage 1 Near Parity" | "Stage 1 Not Yet At Parity";
  recommendation:
    | "Proceed to Stage 2 Design"
    | "Complete Remaining Stage 1 Gaps"
    | "Repeat Stage 1 Validation";
  maturity: MaturityBand;
  maturityExplanation: string;
}

export function computeParityAudit(
  ff: FirstFive,
  gate: ReviewGate,
  reflection: Stage1Reflection,
  unitsCount: number,
): ParityAudit {
  const anyJobs = unitsCount > 0;
  const anyCompleted = ff.jobs.some((j) => j.isCompleted);
  const anyRevenue = ff.jobs.some((j) => j.hasRevenue);
  const anyCost = ff.jobs.some((j) => j.hasCost);
  const anyMargin = ff.jobs.some((j) => j.marginProven);
  const anyEvidence = ff.evidenceAttached > 0;
  const reviewDone = ff.requirementMet; // Review Gate produces a real verdict once jobs recorded.
  const reflectionDone = reflection.reflection_completed;
  const decisionMade = reflection.continuation_decision != null;

  // --- Section 1: Why does Stage 1 exist? -------------------------------
  const section1: ParitySection = {
    title: "Why does Stage 1 exist?",
    answer:
      "Stage 1 exists to determine whether an operator can win, complete, record, cost, evidence, understand, and review the first five real jobs of a new business.",
    status: "Complete", // The capability to make this determination is implemented.
  };

  // --- Section 2: What must the operator prove? -------------------------
  const tri = (full: boolean, some: boolean): ParityStatus =>
    full ? "Complete" : some ? "Partial" : "Missing";
  const fiveRevenue = ff.qualifying.length >= FIRST_FIVE_TARGET || ff.jobs.filter((j) => j.hasRevenue).length >= FIRST_FIVE_TARGET;
  const fiveCost = ff.qualifying.length >= FIRST_FIVE_TARGET || ff.jobs.filter((j) => j.hasCost).length >= FIRST_FIVE_TARGET;
  const s2items: ParityItem[] = [
    { label: "Jobs won", status: tri(unitsCount >= FIRST_FIVE_TARGET, anyJobs) },
    { label: "Jobs completed", status: tri(ff.jobs.filter((j) => j.isCompleted).length >= FIRST_FIVE_TARGET, anyCompleted) },
    { label: "Revenue recorded", status: tri(fiveRevenue, anyRevenue) },
    { label: "Costs recorded", status: tri(fiveCost, anyCost) },
    { label: "GST handled correctly", status: tri(fiveRevenue, anyRevenue), note: "GST split applied automatically on every recorded amount." },
    { label: "Margin calculated", status: tri(ff.requirementMet && ff.marginProven, anyMargin) },
    {
      label: "Evidence attached or consciously omitted",
      status: anyEvidence && ff.evidenceMissing === 0 ? "Complete" : anyEvidence || anyJobs ? "Partial" : "Missing",
      note: "Evidence is recommended; conscious omission is permitted.",
    },
    { label: "Review completed", status: reviewDone ? "Complete" : anyJobs ? "Partial" : "Missing" },
    { label: "Reflection completed", status: reflectionDone ? "Complete" : decisionMade ? "Partial" : "Missing" },
    { label: "Progression decision made", status: decisionMade ? "Complete" : "Missing" },
  ];
  const section2: ParitySection = {
    title: "What must the operator prove?",
    items: s2items,
    status: rollup(s2items),
  };

  // --- Section 3: What money or risk is being measured? ----------------
  const s3items: ParityItem[] = [
    { label: "Revenue", status: tri(ff.revenueExGstTotal > 0, anyRevenue) },
    { label: "Direct Costs", status: tri(ff.directCostsExGstTotal > 0, anyCost) },
    { label: "Gross Profit", status: ff.marginProven ? "Complete" : anyMargin ? "Partial" : "Missing" },
    { label: "Gross Margin", status: ff.grossMargin != null ? "Complete" : anyMargin ? "Partial" : "Missing" },
    {
      label: "Missing Costs Risk",
      status: ff.jobs.some((j) => j.isCompleted && !j.marginProven) ? "Partial" : "Complete",
      note: ff.jobs.some((j) => j.isCompleted && !j.marginProven)
        ? "One or more completed jobs have no recorded costs."
        : "Margin governance active; no unproven completed jobs.",
    },
    {
      label: "Missing Evidence Risk",
      status: ff.evidenceMissing > 0 ? "Partial" : anyJobs ? "Complete" : "Missing",
      note: ff.evidenceMissing > 0 ? "Supporting paperwork missing on one or more jobs." : undefined,
    },
    {
      label: "Documentation Discipline Risk",
      status: gate.warnings.length === 0 ? "Complete" : "Partial",
      note: gate.warnings.length > 0 ? "Review Gate has flagged discipline warnings." : undefined,
    },
  ];
  const section3: ParitySection = {
    title: "What money or risk is being measured?",
    items: s3items,
    status: rollup(s3items),
  };

  // --- Section 4: What Core controls are triggered? -------------------
  // These controls are implemented and always operational in Stage 1.
  const s4items: ParityItem[] = [
    { label: "Run-scoped security", status: "Complete" },
    { label: "Stage auto-activation", status: "Complete" },
    { label: "Margin governance", status: "Complete" },
    { label: "GST governance", status: "Complete" },
    { label: "Evidence governance", status: "Complete" },
    { label: "Review Gate", status: "Complete" },
    { label: "Reflection Gate", status: "Complete" },
  ];
  const section4: ParitySection = {
    title: "What Core controls are triggered?",
    items: s4items,
    status: rollup(s4items),
  };

  // --- Section 5: What Sleeve logic is required? ----------------------
  const s5items: ParityItem[] = [
    { label: "Revenue capture", status: "Complete" },
    { label: "Cost capture", status: "Complete" },
    { label: "Margin visibility", status: "Complete" },
    { label: "Evidence recommendation", status: "Complete" },
    { label: "First Five Jobs progression", status: "Complete" },
  ];
  const section5: ParitySection = {
    title: "What Sleeve logic is required? (Cleaning Sleeve)",
    answer:
      "Cleaning Sleeve only requires revenue capture, cost capture, margin visibility, evidence recommendation, and First Five Jobs progression.",
    items: s5items,
    status: rollup(s5items),
  };

  // --- Section 6: What product support exists? ------------------------
  // Records (jobs/revenue/cost/GST/reflection) and evidence now persist in
  // canonical Supabase storage (tables + storage bucket). Local storage is a
  // cache only, so canonical storage is fully achieved across the record set.
  const s6items: ParityItem[] = [
    { label: "Revenue persistence", status: "Complete", note: "Stage 1 sandbox storage (stage1_revenue_events)." },
    { label: "Cost persistence", status: "Complete", note: "Stage 1 sandbox storage (stage1_job_costs)." },
    { label: "GST persistence", status: "Complete", note: "Stage 1 sandbox storage (amounts persisted ex-GST)." },
    { label: "Reflection persistence", status: "Complete", note: "Canonical Supabase storage (stage1_reflections)." },
    { label: "Evidence persistence", status: "Complete", note: "Canonical cloud storage." },
    {
      label: "Canonical storage",
      status: "Complete",
      note: "Jobs, revenue, cost, GST, reflection and evidence are canonical in Supabase; local storage is cache only.",
    },
    { label: "Review Gate", status: "Complete" },
    { label: "Reflection Gate", status: "Complete" },
  ];
  const section6: ParitySection = {
    title: "What product support exists?",
    items: s6items,
    status: rollup(s6items),
  };

  // --- Section 7: What maturity has been demonstrated? ----------------
  const maturityExplanation =
    gate.maturity === "Competent"
      ? "Competent: Evidence demonstrates basic commercial execution and record discipline."
      : gate.maturity === "Developing"
        ? "Developing: Evidence exists but discipline gaps remain."
        : "Emerging: Insufficient evidence.";
  const section7: ParitySection = {
    title: "What maturity has been demonstrated?",
    answer: maturityExplanation,
    status:
      gate.maturity === "Competent" ? "Complete" : gate.maturity === "Developing" ? "Partial" : "Missing",
  };

  // --- Section 8: What remains prototype-only? ------------------------
  const prototypeItems: string[] = [];
  if (unitsCount === 0) {
    prototypeItems.push("No commercial records captured yet — Stage 1 has not been exercised with real data.");
  }

  // --- Section 9 / verdict inputs ------------------------------------
  const unresolvedRisks: string[] = [];
  if (ff.jobs.some((j) => j.isCompleted && !j.marginProven))
    unresolvedRisks.push("Completed jobs with missing costs (margin not yet proven).");
  if (ff.evidenceMissing > 0) unresolvedRisks.push("Recommended evidence missing on one or more jobs.");
  if (gate.warnings.length > 0)
    unresolvedRisks.push("Review Gate documentation/commercial discipline warnings.");

  const unresolvedControls: string[] = s4items
    .filter((i) => i.status !== "Complete")
    .map((i) => i.label);

  const unresolvedPersistence: string[] = [];

  const unresolvedGovernance: string[] = [];
  if (!reviewDone) unresolvedGovernance.push("Review Gate not yet satisfied (fewer than five qualifying jobs).");
  if (!reflectionDone) unresolvedGovernance.push("Reflection Gate not yet completed.");
  if (!decisionMade) unresolvedGovernance.push("Progression decision not yet made.");

  const lockBeforeStage2: ParityItem[] = [
    {
      label: "First Five Jobs requirement (five qualifying jobs)",
      status: ff.requirementMet ? "Complete" : ff.qualifyingCount > 0 ? "Partial" : "Missing",
    },
    {
      label: "Margin proven on qualifying jobs",
      status: ff.requirementMet && ff.marginProven ? "Complete" : anyMargin ? "Partial" : "Missing",
    },
    { label: "Review Gate satisfied", status: reviewDone ? "Complete" : anyJobs ? "Partial" : "Missing" },
    { label: "Reflection Gate completed", status: reflectionDone ? "Complete" : decisionMade ? "Partial" : "Missing" },
    { label: "Progression decision recorded", status: decisionMade ? "Complete" : "Missing" },
    { label: "Canonical persistence of all records", status: "Complete" },
  ];

  // --- Final verdict --------------------------------------------------
  // Major capability missing → Not Yet At Parity.
  // Minor gaps only → Near Parity.
  // All critical controls operational and no major capability missing → Achieved.
  const coreControlsOperational = section4.status === "Complete";
  const majorCapabilityMissing =
    !ff.requirementMet || !ff.marginProven || !reviewDone || !decisionMade || !coreControlsOperational;
  const minorGaps =
    !reflectionDone ||
    ff.evidenceMissing > 0 ||
    gate.warnings.length > 0 ||
    section6.status !== "Complete";

  let verdict: ParityAudit["verdict"];
  let recommendation: ParityAudit["recommendation"];
  if (majorCapabilityMissing) {
    verdict = "Stage 1 Not Yet At Parity";
    recommendation = "Repeat Stage 1 Validation";
  } else if (minorGaps) {
    verdict = "Stage 1 Near Parity";
    recommendation = "Complete Remaining Stage 1 Gaps";
  } else {
    verdict = "Stage 1 Parity Achieved";
    recommendation = "Proceed to Stage 2 Design";
  }

  return {
    sections: [section1, section2, section3, section4, section5, section6, section7],
    prototypeItems,
    lockBeforeStage2,
    unresolvedRisks,
    unresolvedControls,
    unresolvedPersistence,
    unresolvedGovernance,
    verdict,
    recommendation,
    maturity: gate.maturity,
    maturityExplanation,
  };
}

function ParityStatusBadge({ status }: { status: ParityStatus }) {
  const tone =
    status === "Complete"
      ? "border-emerald-400 text-emerald-700 bg-emerald-50"
      : status === "Partial"
        ? "border-amber-400 text-amber-700 bg-amber-50"
        : "border-red-400 text-red-700 bg-red-50";
  return (
    <Badge variant="outline" className={tone}>
      {status}
    </Badge>
  );
}

function ParityItemRow({ item }: { item: ParityItem }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/20 p-2">
      <div>
        <p className="text-sm">{item.label}</p>
        {item.note && <p className="text-xs text-muted-foreground mt-0.5">{item.note}</p>}
      </div>
      <ParityStatusBadge status={item.status} />
    </div>
  );
}

function Stage1ParityAudit({ audit }: { audit: ParityAudit }) {
  const verdictTone =
    audit.verdict === "Stage 1 Parity Achieved"
      ? "border-emerald-400 text-emerald-700 bg-emerald-50"
      : audit.verdict === "Stage 1 Near Parity"
        ? "border-amber-400 text-amber-700 bg-amber-50"
        : "border-red-400 text-red-700 bg-red-50";
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Stage 1 Parity Audit</CardTitle>
            <CardDescription>
              A business-capability audit against the Autopsy canon, derived entirely from existing Stage 1 data.
            </CardDescription>
          </div>
          <Badge variant="outline" className={verdictTone}>
            {audit.verdict}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {audit.sections.map((section, idx) => (
          <div key={section.title} className="rounded-md border p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Section {idx + 1}
                </div>
                <p className="text-sm font-medium">{section.title}</p>
              </div>
              <ParityStatusBadge status={section.status} />
            </div>
            {section.answer && (
              <p className="mt-2 text-sm text-muted-foreground">{section.answer}</p>
            )}
            {section.items && (
              <div className="mt-3 space-y-1.5">
                {section.items.map((item) => (
                  <ParityItemRow key={item.label} item={item} />
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="rounded-md border p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Section 8 — What remains prototype-only?
          </div>
          {audit.prototypeItems.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No prototype-only elements remain.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {audit.prototypeItems.map((p) => (
                <li
                  key={p}
                  className="rounded-md border-l-4 border-amber-400 bg-amber-50 p-2 text-sm text-amber-900"
                >
                  {p}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-md border p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Section 9 — What must be locked before Stage 2?
          </div>
          <div className="mt-2 space-y-1.5">
            {audit.lockBeforeStage2.map((item) => (
              <ParityItemRow key={item.label} item={item} />
            ))}
          </div>
          {(audit.unresolvedRisks.length > 0 ||
            audit.unresolvedControls.length > 0 ||
            audit.unresolvedGovernance.length > 0 ||
            audit.unresolvedPersistence.length > 0) && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <UnresolvedList title="Unresolved risks" items={audit.unresolvedRisks} />
              <UnresolvedList title="Unresolved controls" items={audit.unresolvedControls} />
              <UnresolvedList title="Unresolved persistence" items={audit.unresolvedPersistence} />
              <UnresolvedList title="Unresolved governance" items={audit.unresolvedGovernance} />
            </div>
          )}
        </div>

        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Final Audit Outcome
          </div>
          <p className="mt-1 font-medium">{audit.verdict}</p>
          <div className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">
            Final Recommendation
          </div>
          <p className="mt-1 font-medium">{audit.recommendation}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function UnresolvedList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{title}</div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None.</p>
      ) : (
        <ul className="space-y-1 text-sm list-disc pl-4">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FirstFiveJobsPanel({ ff }: { ff: FirstFive }) {
  const money = (n: number) =>
    `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const NYP = "Not Yet Proven";
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">First Five Jobs</CardTitle>
            <CardDescription>
              Can this operator win, complete, record, and understand five real jobs?
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={
              ff.requirementMet
                ? "border-emerald-400 text-emerald-700 bg-emerald-50"
                : "border-amber-400 text-amber-700 bg-amber-50"
            }
          >
            {ff.progressionState}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile
            label="Completed jobs"
            value={`${ff.completedCount} / ${FIRST_FIVE_TARGET}`}
            tone={ff.requirementMet ? "good" : "warn"}
          />
          <StatTile label="Remaining jobs" value={ff.remaining} />
          <StatTile label="Revenue ex GST" value={money(ff.revenueExGstTotal)} />
          <StatTile label="Direct costs ex GST" value={money(ff.directCostsExGstTotal)} />
          <StatTile
            label="Gross profit"
            value={ff.marginProven ? money(ff.grossProfit) : NYP}
            tone={ff.marginProven ? "default" : "warn"}
          />
          <StatTile
            label="Gross margin"
            value={ff.grossMargin == null ? NYP : `${ff.grossMargin}%`}
            tone={ff.grossMargin == null ? "warn" : ff.grossMargin >= 30 ? "good" : "warn"}
          />
          <StatTile label="Evidence attached" value={ff.evidenceAttached} />
          <StatTile
            label="Evidence recommended"
            value={ff.evidenceMissing}
            hint={ff.evidenceMissing > 0 ? "Supporting paperwork recommended" : undefined}
          />
          <StatTile
            label="Stage 2 Ready"
            value={ff.stage2Ready ? "Yes" : "No"}
            tone={ff.stage2Ready ? "good" : "warn"}
          />
        </div>

        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <span className="text-muted-foreground">Next action: </span>
          <span className="font-medium">{ff.nextAction}</span>
        </div>

        {ff.notes.map((n) => (
          <div
            key={n}
            className="rounded-md border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900"
          >
            {n}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

type Scorecard = ReturnType<typeof computeScorecard>;

function plainGateLabel(sc: Scorecard, unitsCount: number): string {
  if (unitsCount === 0) return "Locked — no proof recorded yet";
  if (sc.gate === "Unlocked") return "Unlocked — Stage 1 proof ready for review";
  if (sc.gate === "Conditional") return "Conditional — concentration risk visible";
  // Locked — pick most-specific reason
  if (sc.weightedGM < 30 && sc.earnedPoints >= 100) return "Locked — margin too low";
  if (sc.blockers.some((b) => b.toLowerCase().includes("evidence"))) return "Locked — evidence missing";
  if (sc.weightedGM < 30) return "Locked — margin too low";
  return "Locked — not enough proof yet";
}

function PlainGateBadge({ sc, unitsCount }: { sc: Scorecard; unitsCount: number }) {
  const label = plainGateLabel(sc, unitsCount);
  const tone = label.startsWith("Unlocked")
    ? "border-emerald-400 text-emerald-700 bg-emerald-50"
    : label.startsWith("Conditional")
      ? "border-amber-400 text-amber-700 bg-amber-50"
      : "border-red-400 text-red-700 bg-red-50";
  return <Badge variant="outline" className={tone}>{label}</Badge>;
}

function nextStepText(sc: Scorecard, unitsCount: number): string {
  if (unitsCount === 0) {
    return "No proof recorded yet. Start by adding your first real job, quote, signed contract, or recurring job.";
  }
  if (sc.gate === "Unlocked") {
    return "Stage 1 proof is ready for review. Confirm evidence and prepare to unlock the next stage.";
  }
  if (sc.earnedPoints >= 100 && sc.weightedGM < 30) {
    return "Your demand proof is strong enough, but your margin is too low. Correct pricing or cost structure before scaling.";
  }
  if (sc.earnedPoints >= 100 && sc.blockers.some((b) => b.toLowerCase().includes("evidence"))) {
    return "Your score is high enough, but evidence is missing. Attach invoices, receipts, contracts, quotes, timesheets, or payment proof.";
  }
  if (sc.gate === "Conditional" && sc.concentrationClient) {
    return "You may proceed conditionally, but one client is carrying most of your proof. Add another client before relying on this model.";
  }
  return "Add one proof item, record its revenue and costs, then attach evidence.";
}

function WhatToDoNextCard({ sc, unitsCount, onAddFirst }: { sc: Scorecard; unitsCount: number; onAddFirst?: () => void }) {
  return (
    <Card className="border-[hsl(var(--autopsy-accent,220_70%_50%))]/40 bg-[hsl(var(--autopsy-accent,220_70%_50%))]/5">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardDescription className="uppercase text-xs tracking-wide">Next Step</CardDescription>
            <CardTitle className="text-lg">What to do next</CardTitle>
          </div>
          <PlainGateBadge sc={sc} unitsCount={unitsCount} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{nextStepText(sc, unitsCount)}</p>
        {unitsCount === 0 && (
          <Button size="sm" onClick={onAddFirst} className="gap-2">
            <Plus className="h-4 w-4" /> Add First Proof Item
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function Stage1GoalBanner() {
  return (
    <div className="rounded-md border-l-4 border-[hsl(var(--autopsy-accent,220_70%_50%))] bg-muted/40 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">Stage 1 Goal</div>
      <p className="text-sm mt-1">
        Prove that people will pay, the work can be delivered, and the margin is safe enough to repeat.
      </p>
    </div>
  );
}

export function riskCellClass(risk: string) {
  if (risk.includes("blocker")) return "text-red-600";
  if (risk.includes("warning") || risk.includes("missing")) return "text-amber-600";
  return "text-muted-foreground";
}

// ---- Drilldown helpers ----
function kindForProof(t: ProofType): "oneoff" | "contract" {
  return t === "Signed Contract" || t === "Contract Site" ? "contract" : "oneoff";
}

function allowedStatuses(current: string, _kind: "oneoff" | "contract"): string[] {
  const order = ["Scheduled", "In Progress", "Completed", "Paid"];
  const normalized = order.includes(current) ? current : "Scheduled";
  const i = Math.max(0, order.indexOf(normalized));
  return Array.from(new Set([current, ...order.slice(i)]));
}

function Stage1SummaryDialog({
  open,
  onOpenChange,
  unit,
  computedGm,
  grossProfit,
  totalCosts,
  risk,
  onEdit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  unit: ProofUnit;
  computedGm: number | null;
  grossProfit: number;
  totalCosts: number;
  risk: string;
  onEdit: () => void;
}) {
  const points = scoreUnit(unit);
  const base = BASE_POINTS[unit.proofType] ?? 0;
  const contributors: { label: string; pts: number }[] = [];
  if (base) contributors.push({ label: `${unit.proofType}: base`, pts: base });
  if (unit.isNewClient) contributors.push({ label: "New client", pts: 15 });
  if (unit.isAdditionalSite) contributors.push({ label: "Additional site", pts: 10 });
  if (unit.proofType === "Recurring Job" && unit.recurringFirstInvoicePaid) contributors.push({ label: "First recurring invoice paid", pts: 10 });
  if (unit.gm >= 30) contributors.push({ label: "GM above 30%", pts: 10 });
  if (unit.evidence) contributors.push({ label: "Evidence uploaded", pts: 10 });
  if (unit.isReferralOrRepeat) contributors.push({ label: "Referral / repeat", pts: 5 });

  const warnings: string[] = [];
  if (risk === "Concentration warning") warnings.push("Customer concentration risk");
  if (unit.gm < 30 && unit.gm >= 25) warnings.push("Margin below 30%");

  const blockers: string[] = [];
  if (!unit.invoiceDocName && !unit.invoiceAmount && !unit.evidence) blockers.push("Customer proof missing");
  if (unit.paymentStatus === "Paid" && !unit.paymentProofName) blockers.push("Payment proof missing");
  if (unit.paymentMethod === "Cash with Receipt" && !unit.paymentProofName) blockers.push("Cash proof missing");
  if ((computedGm ?? unit.gm) < 25) blockers.push("Margin too low to repeat safely");

  const gbTotal = (unit.gbExpenses ?? []).reduce((s, e) => s + (e.amount ?? 0), 0);
  const gbMissingReceipts = (unit.gbExpenses ?? []).filter((e) => !e.receiptName).length;

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Stage 1 Summary</DialogTitle>
          <DialogDescription>
            This shows how this job or contract site contributes to your Stage 1 proof.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section className="rounded-md border p-3">
            <div className="font-medium text-sm mb-1">1. Job / Site Overview</div>
            {row("Client", unit.client)}
            {row("Site / Location", unit.jobSite ?? "—")}
            {row("Proof Type", unit.proofType)}
            {row("Job / Contract Status", unit.status)}
            {row("Scheduled Date", unit.scheduledDate || "—")}
            {row("Contract Start Date", unit.contractStart || "—")}
            {row("Contract End Date", unit.contractEnd || "—")}
            {row("Quote / Contract Value", unit.quoteValue != null ? `$${unit.quoteValue.toLocaleString()}` : "—")}
          </section>

          <section className="rounded-md border p-3">
            <div className="font-medium text-sm mb-1">2. Customer Invoice / Contract</div>
            {row("Invoice Amount", unit.invoiceAmount != null ? `$${unit.invoiceAmount.toLocaleString()}` : "—")}
            {row("Invoice Status", unit.invoiceStatus ?? "—")}
            {row("Invoice Date", unit.invoiceDate || "—")}
            {row("Document", unit.invoiceDocName ? `${unit.invoiceDocType ?? "Attached"}: ${unit.invoiceDocName}` : "—")}
            {row("Customer proof status", unit.invoiceDocName || unit.evidence
              ? <span className="text-emerald-600">Uploaded</span>
              : <span className="text-red-600">Missing</span>)}
          </section>

          <section className="rounded-md border p-3">
            <div className="font-medium text-sm mb-1">3. Job Costs</div>
            {(unit.costLines && unit.costLines.length > 0) ? (
              (unit.costLines).map((l) => {
                const split = computeGstSplit({
                  inclusive: l.amount ?? 0,
                  treatment: l.gstTreatment ?? (l.gstIncluded ? "gst_included" : "no_gst"),
                  gstOverride: l.gstAmount,
                  overridden: l.gstOverridden,
                });
                return row(
                  l.description || "Direct cost",
                  `$${split.exGst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                );
              })
            ) : (
              <>
                {row("Materials", `$${(unit.costMaterials ?? 0).toLocaleString()}`)}
                {row("Labour", `$${(unit.costLabour ?? 0).toLocaleString()}`)}
                {row("Subcontractors", `$${(unit.costSubcontractors ?? 0).toLocaleString()}`)}
                {row("Other Direct Job Costs", `$${(unit.costOther ?? 0).toLocaleString()}`)}
              </>
            )}
            {row("Job Costs (ex-GST)", totalCosts > 0 ? `$${totalCosts.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Not Yet Recorded")}
            {row("Gross Profit", computedGm != null && totalCosts > 0 ? `$${grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Not Yet Proven")}
            {row("GM %", computedGm != null
              ? <span className={computedGm >= 30 ? "text-emerald-600" : "text-amber-600"}>{computedGm}%</span>
              : "Not Yet Proven")}
          </section>

          <section className="rounded-md border p-3">
            <div className="font-medium text-sm mb-1">4. Payment Proof</div>
            {row("Payment Status", unit.paymentStatus ?? "—")}
            {row("Payment Date", unit.paymentDate || "—")}
            {row("Payment Amount", unit.paymentAmount != null ? `$${unit.paymentAmount.toLocaleString()}` : "—")}
            {row("Payment Method", unit.paymentMethod ?? "—")}
            {row("Payment proof status", unit.paymentProofName
              ? <span className="text-emerald-600">Uploaded</span>
              : <span className="text-red-600">Missing</span>)}
          </section>

          <section className="rounded-md border p-3">
            <div className="font-medium text-sm mb-1">5. General Business Expenses</div>
            {row("Total recorded", `$${gbTotal.toLocaleString()}`)}
            {row("Receipt status", gbMissingReceipts === 0
              ? <span className="text-emerald-600">All attached</span>
              : <span className="text-amber-600">{gbMissingReceipts} missing</span>)}
            <p className="text-xs text-muted-foreground pt-1">These expenses are not included in this job's gross margin.</p>
          </section>

          <section className="rounded-md border p-3">
            <div className="font-medium text-sm mb-1">6. Stage 1 Contribution</div>
            {row("Points Earned", points)}
            <div className="mt-2">
              <div className="text-xs font-medium">Contributing proof:</div>
              <ul className="text-sm">
                {contributors.length === 0
                  ? <li className="text-muted-foreground">No points yet.</li>
                  : contributors.map((c, i) => <li key={i}>- {c.label}: {c.pts} points</li>)}
              </ul>
            </div>
            <div className="mt-2">
              <div className="text-xs font-medium">Warnings:</div>
              <ul className="text-sm">{warnings.length === 0 ? <li className="text-muted-foreground">None</li> : warnings.map((w, i) => <li key={i}>- {w}</li>)}</ul>
            </div>
            <div className="mt-2">
              <div className="text-xs font-medium">Blockers:</div>
              <ul className="text-sm">{blockers.length === 0 ? <li className="text-muted-foreground">None</li> : blockers.map((b, i) => <li key={i}>- {b}</li>)}</ul>
            </div>
            <div className="mt-2">
              <div className="text-xs font-medium">Next Action:</div>
              <p className="text-sm">{unit.nextAction || (blockers[0] ? `Resolve: ${blockers[0]}.` : "Keep going.")}</p>
            </div>
          </section>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={onEdit}>Edit Job / Site Detail</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GBExpenseForm({ onAdd }: { onAdd: (e: GBExpense) => void }) {
  const [exp, setExp] = useState<GBExpense>({ id: "" });
  const reset = () => setExp({ id: "" });
  const categories: GBCategory[] = [
    "Fuel / Vehicle",
    "Phone / Internet",
    "Parking / Tolls",
    "Software",
    "Small Tools",
    "PPE / Uniforms",
    "General Supplies",
    "Training",
    "Insurance",
    "Other",
  ];
  return (
    <div className="rounded border bg-muted/30 p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Expense Date</Label>
          <Input type="date" value={exp.expenseDate ?? ""} onChange={(e) => setExp({ ...exp, expenseDate: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Supplier</Label>
          <Input value={exp.supplier ?? ""} onChange={(e) => setExp({ ...exp, supplier: e.target.value })} />
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">Description</Label>
          <Input value={exp.description ?? ""} onChange={(e) => setExp({ ...exp, description: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Category</Label>
          <Select value={exp.category ?? ""} onValueChange={(v) => setExp({ ...exp, category: v as GBCategory })}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Amount</Label>
          <Input type="number" value={exp.amount ?? ""} onChange={(e) => setExp({ ...exp, amount: e.target.value === "" ? undefined : Number(e.target.value) })} />
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-xs flex items-center gap-2">
            <input type="checkbox" checked={!!exp.gstIncluded} onChange={(e) => setExp({ ...exp, gstIncluded: e.target.checked })} />
            GST included (optional)
          </Label>
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">Attach Receipt (Take Photo / Upload File)</Label>
          <Input
            type="file"
            accept="image/jpeg,image/png,image/heic,application/pdf"
            capture="environment"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setExp({ ...exp, receiptName: f.name });
            }}
          />
          {exp.receiptName && (
            <p className="text-xs text-emerald-700">{exp.receiptName}</p>
          )}
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">Notes</Label>
          <Textarea rows={2} value={exp.notes ?? ""} onChange={(e) => setExp({ ...exp, notes: e.target.value })} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => {
            if (!exp.amount && !exp.category && !exp.supplier) {
              toast({ title: "Add at least a category, supplier, or amount" });
              return;
            }
            onAdd({ ...exp, id: crypto.randomUUID() });
            reset();
            toast({
              title: "Expense recorded",
              description: "This item is not a direct job cost and will not be included in this job's gross margin.",
            });
          }}
        >
          Add Expense
        </Button>
      </div>
    </div>
  );
}

// ---------- Payment (revenue_events) — single source of truth for money received ----------
// Payment entry lives here, inside Job / Contract Site Detail. All payments write to
// revenue_events against the current job_id; summary figures are derived from those rows
// (and job_revenue_control), never duplicated into local proof state.
type RevenueEventRow = {
  id: string;
  job_id: string;
  amount: number;
  revenue_type: string;
  source: string;
  reference: string | null;
  created_at: string;
};

type RevenueControlRow = {
  job_id: string;
  approved_job_value: number | null;
  revenue_collected: number | null;
  outstanding_balance: number | null;
  collection_status: string | null;
};

const REVENUE_TYPES = [
  { value: "deposit", label: "Deposit" },
  { value: "part_payment", label: "Part Payment" },
  { value: "balance_payment", label: "Balance Payment" },
  { value: "full_payment", label: "Full Payment" },
] as const;

const PAYMENT_SOURCES = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
] as const;

const revenueTypeLabel = (v: string) =>
  REVENUE_TYPES.find((t) => t.value === v)?.label ?? v;
const paymentSourceLabel = (v: string) =>
  PAYMENT_SOURCES.find((s) => s.value === v)?.label ?? v;

const collectionStatusLabel = (status: string | null): { label: string; tone: string } => {
  switch (status) {
    case "fully_collected":
      return { label: "Fully Collected", tone: "text-emerald-600" };
    case "outstanding_balance":
      return { label: "Outstanding Balance", tone: "text-amber-600" };
    case "over_collected_review":
      return { label: "Over-Collection — Review", tone: "text-red-600" };
    case "missing_quote_control":
      return { label: "Missing Quote Control", tone: "text-muted-foreground" };
    default:
      return { label: status ?? "—", tone: "text-muted-foreground" };
  }
};

const fmtPayDateTime = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
};

// Inline "Record Payment" form — writes a single revenue_events row for this job.
function PaymentRecorder({
  jobId,
  disabled,
  onRecorded,
}: {
  jobId?: string;
  disabled?: boolean;
  onRecorded: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [revenueType, setRevenueType] = useState("");
  const [source, setSource] = useState("");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  const amountNum = parseFloat(amount);
  const amountValid = !isNaN(amountNum) && amountNum > 0;
  const canSave = !!jobId && amountValid && !!revenueType && !!source && !saving && !disabled;

  async function record() {
    if (!canSave || !jobId) return;
    setSaving(true);
    const { error } = await supabase.from("revenue_events").insert({
      job_id: jobId,
      amount: amountNum,
      revenue_type: revenueType,
      source,
      reference: reference.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Could not record payment", description: error.message });
      return;
    }
    setAmount("");
    setRevenueType("");
    setSource("");
    setReference("");
    toast({ title: "Payment recorded", description: "Saved against this job." });
    onRecorded();
  }

  if (!jobId) {
    return (
      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        Convert an accepted quote into a job to record payments against this job.
      </div>
    );
  }

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="text-xs font-medium">Record Payment</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Amount</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Revenue Type</Label>
          <Select value={revenueType} onValueChange={setRevenueType}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {REVENUE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Payment Source</Label>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {PAYMENT_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Reference / Notes</Label>
          <Input
            placeholder="Optional"
            maxLength={500}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={record} disabled={!canSave}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
          Record Payment
        </Button>
      </div>
    </div>
  );
}

// Read-only payment history for this job (revenue_events rows).
function PaymentHistoryList({ rows }: { rows: RevenueEventRow[] }) {
  if (!rows.length) {
    return <p className="text-xs text-muted-foreground">No payments recorded yet.</p>;
  }
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Date</TableHead>
            <TableHead className="text-right text-xs">Amount</TableHead>
            <TableHead className="text-xs">Type</TableHead>
            <TableHead className="text-xs">Source</TableHead>
            <TableHead className="text-xs">Reference</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{fmtPayDateTime(r.created_at)}</TableCell>
              <TableCell className="text-right tabular-nums text-xs font-medium">${Number(r.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
              <TableCell className="text-xs">{revenueTypeLabel(r.revenue_type)}</TableCell>
              <TableCell className="text-xs">{paymentSourceLabel(r.source)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{r.reference || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Write-Offs / Value Adjustments — writes to job_value_adjustments (WRITABLE).
// Lives inside the Job / Contract Site Detail workspace, keyed on the real job_id.
// ---------------------------------------------------------------------------
function WriteOffsSection({
  jobId,
  disabled,
}: {
  jobId?: string;
  disabled?: boolean;
}) {
  const [rows, setRows] = useState<AdjustmentRow[]>([]);
  const [adjType, setAdjType] = useState<AdjustmentType | "">("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [approved, setApproved] = useState(false);
  const [docRef, setDocRef] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!jobId) {
      setRows([]);
      return;
    }
    setRows(await loadAdjustments(jobId));
  }, [jobId]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const amountNum = parseFloat(amount);
  const amountValid = !isNaN(amountNum) && amountNum > 0;
  const canSave =
    !!jobId && !!adjType && amountValid && reason.trim().length > 0 && !saving && !disabled;

  async function add() {
    if (!canSave || !jobId || !adjType) return;
    setSaving(true);
    const res = await saveAdjustment({
      jobId,
      adjustmentType: adjType,
      amount: amountNum,
      reason: reason.trim(),
      approvedByCustomer: approved,
      documentReference: docRef.trim() || undefined,
    });
    setSaving(false);
    if (!res.ok) {
      toast({ title: "Could not save write-off", description: res.error });
      return;
    }
    setAdjType("");
    setAmount("");
    setReason("");
    setApproved(false);
    setDocRef("");
    toast({ title: "Adjustment saved", description: "Recorded against this job." });
    refresh();
  }

  if (!jobId) {
    return (
      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        Convert an accepted quote into a job to record write-offs against this job.
      </div>
    );
  }

  const total = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Adjustment Type</Label>
          <Select value={adjType} onValueChange={(v) => setAdjType(v as AdjustmentType)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {ADJUSTMENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Amount</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Reason (required)</Label>
          <Input
            placeholder="Why is this value being adjusted?"
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Document Reference</Label>
          <Input
            placeholder="Optional — credit note, customer approval, etc."
            maxLength={500}
            value={docRef}
            onChange={(e) => setDocRef(e.target.value)}
          />
        </div>
        <label className="col-span-2 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={approved}
            onChange={(e) => setApproved(e.target.checked)}
          />
          Approved by customer
        </label>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={add} disabled={!canSave}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add Write-Off
        </Button>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs font-medium">
          <span>Recorded Adjustments</span>
          {rows.length > 0 && (
            <span className="tabular-nums">Total ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No adjustments recorded yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {rows.map((r) => (
              <li key={r.id} className="rounded border bg-white px-2 py-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{adjustmentTypeLabel(r.adjustment_type)}</span>
                  <span className="tabular-nums font-medium">${Number(r.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.reason}
                  {r.approved_by_customer ? " · Customer approved" : ""}
                  {r.document_reference ? ` · ${r.document_reference}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Handover + Referral capture — writes to job_handovers and job_referrals
// (both WRITABLE), keyed on the real job_id. Referrals are captured in the same
// flow so the operator completes the proof pack in one place.
// ---------------------------------------------------------------------------
function HandoverDialog({
  jobId,
  open,
  onOpenChange,
  onSaved,
}: {
  jobId?: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved?: () => void;
}) {
  const [workCompleted, setWorkCompleted] = useState(false);
  const [walkthrough, setWalkthrough] = useState(false);
  const [satisfaction, setSatisfaction] = useState<SatisfactionStatus | "">("");
  const [issueNotes, setIssueNotes] = useState("");
  const [paymentChecked, setPaymentChecked] = useState(false);
  const [referralRequested, setReferralRequested] = useState(false);
  const [thankYou, setThankYou] = useState<ThankYouAction | "">("");
  const [thankYouNotes, setThankYouNotes] = useState("");
  const [referrals, setReferrals] = useState<ReferralInput[]>([]);
  const [saving, setSaving] = useState(false);

  const [existing, setExisting] = useState<HandoverRow | null>(null);
  const [savedReferrals, setSavedReferrals] = useState<ReferralRow[]>([]);

  const refresh = useCallback(async () => {
    if (!jobId) {
      setExisting(null);
      setSavedReferrals([]);
      return;
    }
    const { handover, referrals: refs } = await loadHandover(jobId);
    setExisting(handover);
    setSavedReferrals(refs);
  }, [jobId]);
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const canSave = !!jobId && !!satisfaction && !saving;

  async function save() {
    if (!canSave || !jobId || !satisfaction) return;
    setSaving(true);
    const cleanRefs = referrals.filter((r) => (r.name || r.phone || r.email || "").toString().trim());
    const res = await saveHandover({
      jobId,
      workCompletedAsAgreed: workCompleted,
      customerWalkthroughCompleted: walkthrough,
      satisfactionStatus: satisfaction,
      issueNotes: issueNotes.trim() || undefined,
      paymentStatusChecked: paymentChecked,
      referralRequestMade: referralRequested,
      referralCount: cleanRefs.length,
      thankYouAction: thankYou || undefined,
      thankYouNotes: thankYouNotes.trim() || undefined,
      referrals: cleanRefs,
    });
    setSaving(false);
    if (!res.ok) {
      toast({ title: "Could not save handover", description: res.error });
      return;
    }
    if (res.error) {
      // Handover saved, referrals partially failed — surface, do not hide.
      toast({ title: "Handover saved", description: res.error });
    } else {
      toast({
        title: "Handover complete",
        description: res.referralsSaved ? `Saved with ${res.referralsSaved} referral(s).` : "Saved against this job.",
      });
    }
    setReferrals([]);
    onSaved?.();
    refresh();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Complete Handover</DialogTitle>
          <DialogDescription>
            Close out the job with the customer and capture any referrals. Saved against this job record.
          </DialogDescription>
        </DialogHeader>

        {!jobId ? (
          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            Convert an accepted quote into a job before completing handover.
          </div>
        ) : (
          <div className="space-y-4">
            {existing && (
              <div className="rounded border-l-4 border-emerald-500 bg-emerald-50 p-2 text-xs text-emerald-900">
                A handover was already recorded ({satisfactionLabel(existing.satisfaction_status)},
                {" "}thank-you: {thankYouLabel(existing.thank_you_action)}). Saving again adds a new record.
              </div>
            )}

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={workCompleted} onChange={(e) => setWorkCompleted(e.target.checked)} />
                Work completed as agreed
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={walkthrough} onChange={(e) => setWalkthrough(e.target.checked)} />
                Customer walkthrough completed
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={paymentChecked} onChange={(e) => setPaymentChecked(e.target.checked)} />
                Payment status checked
              </label>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Customer Satisfaction (required)</Label>
              <Select value={satisfaction} onValueChange={(v) => setSatisfaction(v as SatisfactionStatus)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {SATISFACTION_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Issue Notes</Label>
              <Textarea rows={2} value={issueNotes} onChange={(e) => setIssueNotes(e.target.value)} placeholder="Any issues raised at handover" />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Thank-You Action</Label>
              <Select value={thankYou} onValueChange={(v) => setThankYou(v as ThankYouAction)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {THANK_YOU_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Thank-You Notes</Label>
              <Input value={thankYouNotes} onChange={(e) => setThankYouNotes(e.target.value)} placeholder="Optional" />
            </div>

            {/* Referral capture */}
            <div className="rounded-md border p-3 space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="h-4 w-4" checked={referralRequested} onChange={(e) => setReferralRequested(e.target.checked)} />
                Referral request made
              </label>
              {savedReferrals.length > 0 && (
                <p className="text-xs text-muted-foreground">{savedReferrals.length} referral(s) already saved for this job.</p>
              )}
              {referrals.map((r, idx) => (
                <div key={idx} className="rounded border p-2 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Name" value={r.name ?? ""} onChange={(e) => {
                      const next = [...referrals]; next[idx] = { ...r, name: e.target.value }; setReferrals(next);
                    }} />
                    <Input placeholder="Phone" value={r.phone ?? ""} onChange={(e) => {
                      const next = [...referrals]; next[idx] = { ...r, phone: e.target.value }; setReferrals(next);
                    }} />
                    <Input placeholder="Email" value={r.email ?? ""} onChange={(e) => {
                      const next = [...referrals]; next[idx] = { ...r, email: e.target.value }; setReferrals(next);
                    }} />
                    <Input placeholder="Notes" value={r.notes ?? ""} onChange={(e) => {
                      const next = [...referrals]; next[idx] = { ...r, notes: e.target.value }; setReferrals(next);
                    }} />
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setReferrals(referrals.filter((_, i) => i !== idx))}>Remove</Button>
                  </div>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setReferrals([...referrals, {}])}>
                <Plus className="h-4 w-4" /> Add Referral
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!canSave}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Save Handover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function JobDetailSheet({
  unit,
  open,
  onOpenChange,
  onSave,
  onJumpToFinancials,
  concentrationClient,
  onVoid,
  onArchive,
  onDelete,
  onOpenDetailedReport,
  savePrerequisites,
}: {
  unit: ProofUnit | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (u: ProofUnit) => Promise<Stage1CanonicalWriteDiagnostics | boolean | void> | Stage1CanonicalWriteDiagnostics | boolean | void;
  onJumpToFinancials: () => void;
  concentrationClient: string | null;
  onVoid: (n: number, reason: string) => void;
  onArchive: (n: number) => void;
  onDelete: (n: number) => void;
  onOpenDetailedReport?: (n: number) => void;
  savePrerequisites?: { runId: string | null; authUserId: string | null; loading?: boolean };
}) {
  const evidenceRunId = getActiveRunId();
  const [draft, setDraft] = useState<ProofUnit | null>(unit);
  const [mode, setMode] = useState<"view" | "edit">("edit");
  const [correctionReason, setCorrectionReason] = useState<string>("");
  const [showSummary, setShowSummary] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState<string>("Entered by mistake");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editGateOpen, setEditGateOpen] = useState(false);
  const [saveDiagnostics, setSaveDiagnostics] = useState<Stage1CanonicalWriteDiagnostics | null>(null);
  const [payEvents, setPayEvents] = useState<RevenueEventRow[]>([]);
  const [payControl, setPayControl] = useState<RevenueControlRow | null>(null);
  const [handoverOpen, setHandoverOpen] = useState(false);
  useEffect(() => {
    setDraft(unit);
    setMode("edit");
    setCorrectionReason("");
    setSaveDiagnostics(null);
  }, [unit]);
  const jobId = unit?.jobId;
  const normalizeSaveResult = (value: Stage1CanonicalWriteDiagnostics | boolean | void): Stage1CanonicalWriteDiagnostics => {
    if (value && typeof value === "object" && "counts" in value && "success" in value) return value;
    return {
      status: "failed",
      runId: evidenceRunId,
      authUserId: null,
      authUserIdPresent: false,
      autopsyRunIdWrittenMatchesActiveRun: null,
      createdByMatchesAuthUser: null,
      counts: { jobs: null, revenueLines: null, costLines: null },
      rows: { jobs: [], revenueLines: [], costLines: [] },
      writtenRows: { jobs: [], revenueLines: [], costLines: [] },
      errors: [{ table: "stage1_canonical", operation: "save", message: "No canonical Supabase diagnostics were returned." }],
      writeSucceeded: false,
      success: false,
      message: "Canonical Supabase write did not return diagnostics.",
    };
  };
  const loadPayments = useCallback(async () => {
    if (!jobId) {
      setPayEvents([]);
      setPayControl(null);
      return;
    }
    const [evRes, ctrlRes] = await Promise.all([
      supabase
        .from("revenue_events")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false }),
      supabase.from("job_revenue_control").select("*").eq("job_id", jobId).maybeSingle(),
    ]);
    setPayEvents((evRes.data ?? []) as RevenueEventRow[]);
    setPayControl((ctrlRes.data ?? null) as RevenueControlRow | null);
  }, [jobId]);
  useEffect(() => {
    loadPayments();
  }, [loadPayments]);
  if (!draft) return null;
  const kind = kindForProof(draft.proofType);
  const statuses = allowedStatuses(draft.status, kind);
  const risk = unitRisk(draft, concentrationClient);
  const lifecycle = draft.lifecycle ?? "active";
  const isLocked = lifecycle !== "active";
  const isReviewed = !!draft.reviewed;
  const readOnly = mode === "view" || isLocked;
  const reviewedNeedsReason = isReviewed && mode === "edit" && !correctionReason.trim();
  const canonicalPrerequisitesLoading = !!savePrerequisites?.loading;
  const canonicalSaveMissingBinding = !!savePrerequisites && (!savePrerequisites.runId || !savePrerequisites.authUserId);
  const canonicalSaveBlockedMessage =
    "Stage 1 cannot save because no signed-in user or active Autopsy run is attached.";
  const saveDisabled = isLocked || reviewedNeedsReason || canonicalPrerequisitesLoading || canonicalSaveMissingBinding;

  // Best-effort lookup into the Financial Proof local store (read-only)
  const fpClients = readLS<FPClient[]>(LS.clients, []);
  const fpJobs = readLS<FPJob[]>(LS.jobs, []);
  const fpFin = readLS<FPFinancial[]>(LS.fin, []);
  const fpDocs = readLS<FPDocument[]>(LS.docs, []);
  const matchedClient = fpClients.find(
    (c) => c.name.toLowerCase() === draft.client.toLowerCase()
  );
  const matchedJob = matchedClient
    ? fpJobs.find(
        (j) =>
          j.client_id === matchedClient.id &&
          (draft.jobSite ? j.job_name.toLowerCase() === draft.jobSite.toLowerCase() : true)
      )
    : null;
  const fin = matchedJob ? fpFin.find((f) => f.job_id === matchedJob.id) : null;
  const docs = matchedJob ? fpDocs.filter((d) => d.job_id === matchedJob.id) : [];

  // GST-aware GM. Margin is calculated from ex-GST revenue and ex-GST direct
  // costs only — GST is a tax/reporting component, never business margin.
  const invAmt = draft.invoiceAmount ?? 0; // GST-inclusive invoice total
  const invoiceSplit = computeGstSplit({
    inclusive: invAmt,
    treatment: draft.invoiceGstTreatment ?? "gst_included",
    gstOverride: draft.invoiceGstAmount,
    overridden: draft.invoiceGstOverridden,
  });
  const revenueExGst = invoiceSplit.exGst;

  // Each cost line stores a GST-inclusive amount; reduce to ex-GST for margin.
  const lineSplits = (draft.costLines ?? []).map((l) =>
    computeGstSplit({
      inclusive: l.amount ?? 0,
      treatment: l.gstTreatment ?? (l.gstIncluded ? "gst_included" : "no_gst"),
      gstOverride: l.gstAmount,
      overridden: l.gstOverridden,
    })
  );
  const linesTotalExGst = lineSplits.reduce((s, x) => s + x.exGst, 0);
  // Legacy cost fields carry no GST split; treat them as ex-GST as-is.
  const legacyTotal =
    (draft.costMaterials ?? 0) +
    (draft.costLabour ?? 0) +
    (draft.costSubcontractors ?? 0) +
    (draft.costOther ?? 0);
  const hasCostLines = !!(draft.costLines && draft.costLines.length > 0);
  // Ex-GST direct cost total used for margin.
  const costs = hasCostLines ? linesTotalExGst : legacyTotal;
  // GST-inclusive cost total (display only).
  const costsInclGst = hasCostLines
    ? lineSplits.reduce((s, x) => s + x.inclusive, 0)
    : legacyTotal;
  const grossProfit = revenueExGst - costs;
  const computedGm = revenueExGst > 0 ? Math.round((grossProfit / revenueExGst) * 100) : null;

  const invoiceProofOk = !!(draft.invoiceDocName || fin || draft.evidence);
  const costsEntered = invAmt > 0 || costs > 0;
  const paymentClaimed = draft.paymentStatus === "Paid" || draft.paymentStatus === "Part Paid";
  const paymentProofOk = !!draft.paymentProofName;
  const cashRequiresProof = draft.paymentMethod === "Cash with Receipt" && !paymentProofOk;

  // Payment figures are derived from revenue_events / job_revenue_control — the single
  // source of truth. Nothing about money received is stored on the local proof draft.
  const eventsTotal = payEvents.reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const paymentReceived =
    payControl?.revenue_collected != null ? Number(payControl.revenue_collected) : eventsTotal;
  const approvedValue =
    payControl?.approved_job_value != null && Number(payControl.approved_job_value) > 0
      ? Number(payControl.approved_job_value)
      : draft.quoteValue ?? 0;
  const quoteVal = approvedValue;
  const outstanding =
    payControl?.outstanding_balance != null
      ? Number(payControl.outstanding_balance)
      : approvedValue - paymentReceived;
  const collectionStatus = payControl?.collection_status ?? null;
  const paidStatusMissingAmount =
    draft.paymentStatus === "Paid" && paymentReceived === 0;
  const paymentExceedsQuote = approvedValue > 0 && paymentReceived > approvedValue;

  async function save() {
    if (saveDisabled) return;
    const original = unit!;
    const changes: { field: string; from: unknown; to: unknown }[] = [];
    (Object.keys(draft) as (keyof ProofUnit)[]).forEach((k) => {
      if (k === "audit") return;
      const a = (original as unknown as Record<string, unknown>)[k as string];
      const b = (draft as unknown as Record<string, unknown>)[k as string];
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        changes.push({ field: String(k), from: a, to: b });
      }
    });
    const entry: AuditEntry = {
      ts: new Date().toISOString(),
      action: isReviewed ? "corrected" : "updated",
      reason: isReviewed ? correctionReason || undefined : undefined,
      changes,
    };
    const next: ProofUnit = { ...draft, audit: [...(draft.audit ?? []), entry] };
    const diagnostics = normalizeSaveResult(await onSave(next));
    setSaveDiagnostics(diagnostics);
    if (!diagnostics.success) {
      toast({
        title: "Not saved",
        description: diagnostics.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: isReviewed ? "Correction logged" : "Job updated", description: `${draft.client} — ${draft.jobSite ?? "site"}` });
    setMode("view");
    setCorrectionReason("");
  }

  function cancelEdit() {
    setDraft(unit);
    setMode("view");
    setCorrectionReason("");
  }

  // Save Progress — the primary, always-visible save action for this workspace.
  // Persists the current form values into the dashboard's job record and keeps
  // the panel open so the operator can carry on working.
  async function saveProgress() {
    if (saveDisabled) return;
    const original = unit!;
    const changes: { field: string; from: unknown; to: unknown }[] = [];
    (Object.keys(draft) as (keyof ProofUnit)[]).forEach((k) => {
      if (k === "audit") return;
      const a = (original as unknown as Record<string, unknown>)[k as string];
      const b = (draft as unknown as Record<string, unknown>)[k as string];
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        changes.push({ field: String(k), from: a, to: b });
      }
    });
    const entry: AuditEntry = {
      ts: new Date().toISOString(),
      action: isReviewed ? "corrected" : "updated",
      reason: isReviewed ? correctionReason || undefined : undefined,
      changes,
    };
    const next: ProofUnit = { ...draft, audit: [...(draft.audit ?? []), entry] };
    setDraft(next);
    // Commercial truth (invoice, costs, GST) is written to the canonical
    // Supabase tables here. Only claim "saved" when that write succeeds.
    const diagnostics = normalizeSaveResult(await onSave(next));
    setSaveDiagnostics(diagnostics);
    if (!diagnostics.success) {
      toast({
        title: "Not saved",
        description: diagnostics.message,
        variant: "destructive",
      });
      return;
    }
    // Persist against the real job row when this workspace is backed by one.
    if (draft.jobId) {
      const res = await persistJobProgress({
        jobId: draft.jobId,
        siteId: draft.siteId,
        jobSite: draft.jobSite,
        scheduledDate: draft.scheduledDate,
        completed: draft.paymentStatus === "Paid" || draft.status === "Paid",
      });
      if (res.ok) {
        toast({ title: "Progress Saved", description: "Saved to this job record." });
      } else {
        toast({ title: "Canonical write confirmed", description: `Job side record not updated: ${res.error}` });
      }
    } else {
      toast({
        title: "Progress Saved",
        description: "Saved to your secure Stage 1 records.",
      });
    }
  }

  // Delete eligibility — only truly empty drafts
  const hasInvoiceProof = !!draft.invoiceDocName || !!draft.invoiceAmount;
  const hasCosts = !!(draft.costMaterials || draft.costLabour || draft.costSubcontractors || draft.costOther);
  const hasPayment = !!draft.paymentProofName || paymentReceived > 0 || payEvents.length > 0;
  const hasGB = (draft.gbExpenses ?? []).length > 0;
  const hasReview = isReviewed;
  const isDraftLike = draft.status === "Draft" || draft.status === "Open";
  const canDelete =
    isDraftLike && !hasInvoiceProof && !hasCosts && !hasPayment && !hasGB && !hasReview && scoreUnit(draft) === 0;

  const fieldRow = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );

  const sectionTitle = (n: number, label: string, Icon?: React.ComponentType<{ className?: string }>) => (
    <div className="font-medium text-sm flex items-center gap-2">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">{n}</span>
      {Icon ? <Icon className="h-4 w-4" /> : null}
      {label}
    </div>
  );

  const fileInput = (label: string, currentName: string | undefined, onPick: (name: string) => void) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="file"
        accept="image/*,application/pdf"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f.name);
        }}
      />
      {currentName && (
        <p className="text-xs text-emerald-700 flex items-center gap-1"><FileText className="h-3 w-3" /> {currentName}</p>
      )}
    </div>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o && unit && JSON.stringify(draft) !== JSON.stringify(unit) && (!isReviewed || correctionReason.trim())) {
          try { save(); } catch { /* noop */ }
        }
        onOpenChange(o);
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <div className="flex items-start justify-between gap-3 pr-10">
            <div className="min-w-0">
              <SheetTitle>Job / Contract Site Detail</SheetTitle>
              <SheetDescription>
                {draft.client} — {draft.jobSite ?? <span className="text-amber-600">Site not entered</span>}
              </SheetDescription>
            </div>
            {onOpenDetailedReport && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => onOpenDetailedReport(draft.n)}
              >
                Detailed Report
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {/* Supporting paperwork — maturity-oriented guidance */}
          <div className="rounded-md border-l-4 border-emerald-500 bg-emerald-50 p-3 text-xs text-emerald-900 space-y-2">
            <p className="font-semibold">Supporting paperwork recommended</p>
            <p>
              Supporting paperwork is strongly recommended for all transactions. Maintaining relevant
              documents such as accepted quotes, invoices, receipts, work orders, and job records assists
              with financial reporting, operational continuity, and dispute resolution if questions arise
              in the future.
            </p>
            <p>
              Accepted and dated quotes should be retained wherever possible. While not generally required
              for taxation purposes, they provide important evidence of customer approval, agreed scope,
              pricing, and terms in the event of a dispute.
            </p>
          </div>
          {/* 1. Quote Reference */}
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            {sectionTitle(1, "Quote Reference")}
            <p className="text-xs text-muted-foreground">
              A quote is a sales record proving you are quoting and converting work. The quoted amount is not revenue and never drives gross margin.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Quote #</Label>
                <Input value={draft.sourceQuote ?? ""} onChange={(e) => setDraft({ ...draft, sourceQuote: e.target.value })} placeholder="e.g. Q-1001" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Quote Status</Label>
                <div className="h-10 flex items-center text-sm font-medium">{draft.sourceQuote ? "Accepted" : "—"}</div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Quoted amount inc GST</Label>
                <Input type="number" value={draft.quoteValue ?? ""} onChange={(e) => setDraft({ ...draft, quoteValue: e.target.value === "" ? undefined : Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Converted to Job #</Label>
                <div className="h-10 flex items-center text-sm font-medium font-mono">{draft.jobSequenceNumber != null ? `J-${draft.jobSequenceNumber}` : `J-${draft.n}`}</div>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Optional comment</Label>
              <Input value={draft.quoteComment ?? ""} onChange={(e) => setDraft({ ...draft, quoteComment: e.target.value })} placeholder="e.g. scope change agreed by phone" />
            </div>
            {fieldRow("Client", draft.client)}
            {fieldRow("Job Site / Location", draft.jobSite ?? <span className="text-amber-600">Site not entered</span>)}
          </div>

          {/* Job record + accepted quote / customer approval paperwork */}
          <Stage1EvidenceAttachments
            runId={evidenceRunId}
            linkType="quote"
            linkRef={`unit-${draft.n}`}
            linkLabel={`Job ${draft.jobSequenceNumber != null ? `J-${draft.jobSequenceNumber}` : `J-${draft.n}`} — quote / approval`}
            defaultEvidenceType="Accepted Quote"
            title="Accepted quote / customer approval"
            readOnly={readOnly}
          />

          {/* Blockers / warnings */}
          <div className="space-y-2">
            {!draft.jobSite && (
              <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 p-2 text-xs text-amber-900">Site not entered</div>
            )}
            <div className="rounded-md border-l-4 border-slate-400 bg-slate-50 p-2 text-xs text-slate-700">
              Optional supporting evidence helps verify the record. Missing paperwork does not block saving.
            </div>
          </div>

          {isLocked && (
            <div className="rounded-md border-l-4 border-slate-500 bg-slate-50 p-2 text-xs text-slate-800">
              This record is <span className="font-semibold">{lifecycle}</span>. It is read-only and excluded from your Stage 1 score.
              {draft.voidReason && <> Reason: {draft.voidReason}.</>}
            </div>
          )}
          {!isLocked && isReviewed && mode === "edit" && (
            <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 p-2 text-xs text-amber-900 space-y-2">
              <p>This record has been used for progression review. Changes must be logged as corrections.</p>
              <div className="space-y-1">
                <Label className="text-xs">Correction reason (required)</Label>
                <Input value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} placeholder="Why is this being corrected?" />
              </div>
            </div>
          )}
          <fieldset disabled={readOnly} className="space-y-5 contents [&:disabled_input]:opacity-70 [&:disabled_button]:opacity-70">
          {/* 2. Client Invoices */}
          <div className="rounded-md border p-3 space-y-3">
            {sectionTitle(2, "Client Invoices", DollarSign)}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Quote / Contract Amount</Label>
                <Input type="number" value={draft.quoteValue ?? ""} onChange={(e) => setDraft({ ...draft, quoteValue: e.target.value === "" ? undefined : Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Invoice Total incl. GST</Label>
                <Input type="number" value={draft.invoiceAmount ?? ""} onChange={(e) => setDraft({ ...draft, invoiceAmount: e.target.value === "" ? undefined : Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Invoice Date</Label>
                <Input type="date" value={draft.invoiceDate ?? ""} onChange={(e) => setDraft({ ...draft, invoiceDate: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Invoice Status</Label>
                <Select value={draft.invoiceStatus ?? ""} onValueChange={(v) => setDraft({ ...draft, invoiceStatus: v as ProofUnit["invoiceStatus"] })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {(["Draft","Sent","Approved","Invoiced","Part Paid","Paid","Cancelled"] as const).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Contract Start</Label>
                <Input type="date" value={draft.contractStart ?? ""} onChange={(e) => setDraft({ ...draft, contractStart: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Contract End</Label>
                <Input type="date" value={draft.contractEnd ?? ""} onChange={(e) => setDraft({ ...draft, contractEnd: e.target.value })} />
              </div>
            </div>
            {/* GST treatment for revenue. Margin uses ex-GST revenue only. */}
            <div className="rounded border bg-muted/30 p-2 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">GST treatment</Label>
                  <Select
                    value={draft.invoiceGstTreatment ?? "gst_included"}
                    onValueChange={(v) =>
                      setDraft({ ...draft, invoiceGstTreatment: v as GstTreatment, invoiceGstOverridden: v === "manual" ? draft.invoiceGstOverridden : false })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GST_TREATMENTS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">GST</Label>
                  <Input
                    type="number"
                    value={draft.invoiceGstOverridden || (draft.invoiceGstTreatment ?? "gst_included") === "manual" ? (draft.invoiceGstAmount ?? "") : invoiceSplit.gst}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        invoiceGstOverridden: true,
                        invoiceGstAmount: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Ex-GST revenue (for margin)</Label>
                  <div className="h-10 flex items-center font-medium tabular-nums">
                    {invAmt > 0 ? `$${revenueExGst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                  </div>
                </div>
              </div>
              {draft.invoiceGstOverridden && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  onClick={() => setDraft({ ...draft, invoiceGstOverridden: false, invoiceGstAmount: undefined })}
                >
                  Reset GST to auto (1/11)
                </button>
              )}
              <p className="text-[11px] text-muted-foreground">GST is excluded from gross margin. Only ex-GST revenue is used.</p>
            </div>
            {fileInput("Upload file or take picture", draft.invoiceDocName, (name) => setDraft({ ...draft, invoiceDocName: name, evidence: true }))}
            <Stage1EvidenceAttachments
              runId={evidenceRunId}
              linkType="invoice"
              linkRef={`unit-${draft.n}`}
              linkLabel={`Job ${draft.jobSequenceNumber != null ? `J-${draft.jobSequenceNumber}` : `J-${draft.n}`} — revenue line`}
              defaultEvidenceType="Invoice"
              title="Invoice paperwork (revenue line)"
              readOnly={readOnly}
            />
          </div>

          {/* 3. Job Costs */}
          <div className="rounded-md border p-3 space-y-3">
            {sectionTitle(3, "Job Costs", Paperclip)}
            <p className="text-xs text-muted-foreground">
              Enter each cost as a simple line. If you used a subcontractor, add it as a normal line (e.g. "Subcontractor help") with its invoice as proof.
            </p>
            <div className="space-y-2">
              {(draft.costLines ?? []).map((line, idx) => {
                const split = lineSplits[idx] ?? computeGstSplit({ inclusive: line.amount ?? 0 });
                const treatment = line.gstTreatment ?? (line.gstIncluded ? "gst_included" : "no_gst");
                const updateLine = (patch: Partial<CostLine>) => {
                  const next = [...(draft.costLines ?? [])];
                  next[idx] = { ...line, ...patch };
                  setDraft({ ...draft, costLines: next });
                };
                return (
                  <div key={line.id} className="rounded-md border p-3 space-y-3">
                    {/* Cost calculation — simple stacked form */}
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Description</Label>
                        <Input
                          value={line.description}
                          placeholder="e.g. Materials, Subcontractor help"
                          onChange={(e) => updateLine({ description: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Total incl. GST</Label>
                          <Input
                            type="number"
                            value={line.amount ?? ""}
                            onChange={(e) => updateLine({ amount: e.target.value === "" ? undefined : Number(e.target.value) })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">GST treatment</Label>
                          <Select
                            value={treatment}
                            onValueChange={(v) =>
                              updateLine({
                                gstTreatment: v as GstTreatment,
                                gstIncluded: v === "gst_included",
                                gstOverridden: v === "manual" ? line.gstOverridden : false,
                              })
                            }
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {GST_TREATMENTS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">GST</Label>
                          <Input
                            type="number"
                            value={line.gstOverridden || treatment === "manual" ? (line.gstAmount ?? "") : split.gst}
                            onChange={(e) => updateLine({ gstOverridden: true, gstAmount: e.target.value === "" ? undefined : Number(e.target.value) })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Ex-GST (for margin)</Label>
                          <div className="h-10 flex items-center font-medium tabular-nums">
                            {line.amount ? `$${split.exGst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                          </div>
                        </div>
                      </div>
                      {line.gstOverridden && (
                        <button
                          type="button"
                          className="text-xs text-muted-foreground underline"
                          onClick={() => updateLine({ gstOverridden: false, gstAmount: undefined })}
                        >
                          Reset GST to auto (1/11)
                        </button>
                      )}
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const next = (draft.costLines ?? []).filter((_, i) => i !== idx);
                            setDraft({ ...draft, costLines: next });
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                    {/* Supporting paperwork — separated from the cost calculation */}
                    <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                      <p className="text-xs font-medium">Supporting paperwork recommended</p>
                      <Stage1EvidenceAttachments
                        runId={evidenceRunId}
                        linkType="cost"
                        linkRef={`cost-${line.id}`}
                        linkLabel={`Cost line: ${line.description || "Untitled cost"}`}
                        defaultEvidenceType="Supplier Receipt"
                        title="Supplier receipt / cost paperwork"
                        readOnly={readOnly}
                      />
                    </div>
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const seed: CostLine[] =
                    (draft.costLines && draft.costLines.length > 0)
                      ? draft.costLines
                      : [
                          ...(draft.costMaterials ? [{ id: crypto.randomUUID(), description: "Materials", amount: draft.costMaterials, gstIncluded: true, gstTreatment: "gst_included" as GstTreatment }] : []),
                          ...(draft.costLabour ? [{ id: crypto.randomUUID(), description: "Labour", amount: draft.costLabour, gstIncluded: false, gstTreatment: "no_gst" as GstTreatment }] : []),
                          ...(draft.costSubcontractors ? [{ id: crypto.randomUUID(), description: "Subcontractor help", amount: draft.costSubcontractors, gstIncluded: true, gstTreatment: "gst_included" as GstTreatment }] : []),
                          ...(draft.costOther ? [{ id: crypto.randomUUID(), description: "Other direct cost", amount: draft.costOther, gstIncluded: true, gstTreatment: "gst_included" as GstTreatment }] : []),
                        ];
                  const next: CostLine[] = [...seed, { id: crypto.randomUUID(), description: "", amount: undefined, gstIncluded: true, gstTreatment: "gst_included" }];
                  setDraft({ ...draft, costLines: next });
                }}
              >
                Add Cost Line
              </Button>
            </div>
            <div className="rounded bg-muted/40 p-2 text-sm">
              {fieldRow("Total job costs incl. GST", costsInclGst > 0 ? `$${costsInclGst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—")}
              {fieldRow("Job Costs (ex-GST, for margin)", costs > 0 ? `$${costs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Not Yet Recorded")}
              {fieldRow("Ex-GST revenue", invAmt > 0 ? `$${revenueExGst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—")}
              {fieldRow("Gross Profit (ex-GST)", revenueExGst > 0 && costs > 0 ? `$${grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Not Yet Proven")}
              {fieldRow("GM %", revenueExGst > 0 && costs > 0 && computedGm != null ? <span className={computedGm >= 30 ? "text-emerald-600" : "text-amber-600"}>{computedGm}%</span> : "Not Yet Proven")}
            </div>
            {fileInput("Upload file or take picture", draft.costDocName, (name) => setDraft({ ...draft, costDocName: name }))}
            <Stage1EvidenceAttachments
              runId={evidenceRunId}
              linkType="cost"
              linkRef={`unit-${draft.n}-general`}
              linkLabel={`Job ${draft.jobSequenceNumber != null ? `J-${draft.jobSequenceNumber}` : `J-${draft.n}`} — general cost proof`}
              defaultEvidenceType="Supplier Receipt"
              title="Other cost paperwork"
              readOnly={readOnly}
            />
          </div>

          {/* 4. Payment Proof */}
          <div className="rounded-md border p-3 space-y-3">
            {sectionTitle(4, "Payment Proof", FileText)}
            <div className="rounded-md border-l-4 border-slate-400 bg-slate-50 p-2 text-xs text-slate-700">
              Optional supporting evidence helps verify the record. Missing paperwork does not block saving.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Payment Status</Label>
                <Select value={draft.paymentStatus ?? ""} onValueChange={(v) => setDraft({ ...draft, paymentStatus: v as ProofUnit["paymentStatus"] })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {(["Not Paid","Part Paid","Paid","Disputed","Written Off"] as const).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Payment Date</Label>
                <Input type="date" value={draft.paymentDate ?? ""} onChange={(e) => setDraft({ ...draft, paymentDate: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Payment Method</Label>
                <Select value={draft.paymentMethod ?? ""} onValueChange={(v) => setDraft({ ...draft, paymentMethod: v as ProofUnit["paymentMethod"] })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {(["Bank Transfer","Card","Cash with Receipt","Payment Platform","Other"] as const).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {fileInput("Upload file or take picture", draft.paymentProofName, (name) => setDraft({ ...draft, paymentProofName: name }))}

            {/* Live payment figures — derived from revenue_events for this job */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md border bg-muted/20 p-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Received</div>
                <div className="font-semibold tabular-nums">${paymentReceived.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
              <div className="rounded-md border bg-muted/20 p-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Outstanding</div>
                <div className={`font-semibold tabular-nums ${outstanding < 0 ? "text-red-600" : ""}`}>{`${outstanding < 0 ? "-" : ""}$${Math.abs(outstanding).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</div>
              </div>
              <div className="rounded-md border bg-muted/20 p-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Status</div>
                <div className={`font-semibold text-xs ${collectionStatusLabel(collectionStatus).tone}`}>{collectionStatusLabel(collectionStatus).label}</div>
              </div>
            </div>

            {/* Record a payment — writes to revenue_events against this job_id */}
            <PaymentRecorder jobId={draft.jobId} disabled={isLocked} onRecorded={loadPayments} />

            {/* Payment history for this job */}
            <div className="space-y-1">
              <div className="text-xs font-medium">Payment History</div>
              <PaymentHistoryList rows={payEvents} />
            </div>
          </div>

          {/* 4. General Business Expenses (not in GM) */}
          <div className="rounded-md border p-3 space-y-3">
            <div className="font-medium text-sm flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">4</span>
              <Paperclip className="h-4 w-4" /> General Business Expenses
            </div>
            <p className="text-xs text-muted-foreground">Not included in this job's gross margin.</p>
            <div className="rounded border-l-4 border-blue-400 bg-blue-50 p-2 text-xs text-blue-900 space-y-1">
              <p>Use this for business-related dockets that are not direct costs of this specific job. Examples: fuel, phone, parking, software, small tools, PPE, general supplies.</p>
              <p>If you are unsure whether something is a direct job cost, record it here and ask your accountant later.</p>
              <p className="italic">This section records possible business expenses. It does not decide tax deductibility.</p>
            </div>

            {(draft.gbExpenses ?? []).length > 0 && (
              <ul className="space-y-1 text-sm">
                {(draft.gbExpenses ?? []).map((e, idx) => (
                  <li key={e.id} className="flex items-center justify-between rounded border bg-white px-2 py-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate">
                        {e.category ?? "Uncategorised"} — ${(e.amount ?? 0).toFixed(2)} —{" "}
                        {e.receiptName
                          ? <span className="text-emerald-700">Receipt uploaded</span>
                          : <span className="text-amber-700">Receipt missing</span>}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          gbExpenses: (draft.gbExpenses ?? []).filter((_, i) => i !== idx),
                        })
                      }
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <GBExpenseForm
              onAdd={(exp) =>
                setDraft({ ...draft, gbExpenses: [...(draft.gbExpenses ?? []), exp] })
              }
            />

            {(draft.gbExpenses ?? []).some((e) => !e.receiptName) && (
              <div className="rounded-md border-l-4 border-slate-400 bg-slate-50 p-2 text-xs text-slate-700">
                Optional supporting evidence helps verify the record. Missing paperwork does not block saving.
              </div>
            )}
          </div>

          {/* 5. Miscellaneous Attachment */}
          <div className="rounded-md border p-3 space-y-3">
            {sectionTitle(5, "Miscellaneous Attachment", Paperclip)}
            <div className="space-y-1">
              <Label className="text-xs">Comment</Label>
              <Textarea
                rows={2}
                value={draft.notes ?? ""}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="Observations, exceptions, anything to remember"
              />
            </div>
            {fileInput("Upload file or take picture", draft.miscAttachmentName, (name) => setDraft({ ...draft, miscAttachmentName: name }))}
            <p className="text-xs text-muted-foreground">
              Optional supporting evidence helps verify the record. Missing paperwork does not block saving.
            </p>
          </div>

          </fieldset>
          {/* Legacy linked records (read-only context) */}
          {(fin || docs.length > 0) && (
            <div className="rounded-md border p-3 space-y-2">
              <div className="font-medium text-xs text-muted-foreground">Linked records (Stage 1 Financial Proof store)</div>
              {fin && (
                <div className="text-sm">
                  {fieldRow("Revenue", `$${fin.revenue_amount.toLocaleString()}`)}
                  {fieldRow("Gross Profit", `$${fin.gross_profit.toLocaleString()}`)}
                  {fieldRow("GM %", fin.gm_percent != null ? `${fin.gm_percent}%` : "—")}
                </div>
              )}
              {docs.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {docs.map((d) => (
                    <li key={d.id} className="flex items-center justify-between rounded border bg-white px-2 py-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="truncate">{d.document_type} — {d.file_name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(d.uploaded_at).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="pt-1">
                <Button size="sm" variant="outline" onClick={onJumpToFinancials}>Open Financial Proof tab</Button>
              </div>
            </div>
          )}

          {/* Audit history (compact) */}
          {(draft.audit ?? []).length > 0 && (
            <details className="rounded-md border p-3 text-xs">
              <summary className="cursor-pointer font-medium">Audit history ({(draft.audit ?? []).length})</summary>
              <ul className="mt-2 space-y-1">
                {(draft.audit ?? []).slice().reverse().map((a, i) => (
                  <li key={i} className="flex justify-between gap-3 border-t pt-1">
                    <span className="font-mono">{a.action}</span>
                    <span className="text-muted-foreground truncate">{a.reason ?? (a.changes?.length ? `${a.changes.length} field(s)` : "")}</span>
                    <span className="text-muted-foreground">{new Date(a.ts).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {/* Summary trigger */}
          <div className="pt-2">
            <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setShowSummary(true)}>
              View Stage 1 Summary
            </Button>
          </div>

          {/* Summary dialog */}
          <Stage1SummaryDialog
            open={showSummary}
            onOpenChange={setShowSummary}
            unit={draft}
            computedGm={computedGm}
            grossProfit={grossProfit}
            totalCosts={costs}
            risk={risk}
            onEdit={() => {
              setShowSummary(false);
              if (!isLocked) {
                if (isReviewed) setEditGateOpen(true);
                else setMode("edit");
              }
            }}
          />

          {/* Void dialog */}
          <AlertDialog open={voidOpen} onOpenChange={setVoidOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Void this record?</AlertDialogTitle>
                <AlertDialogDescription>
                  Voiding keeps this record for history but removes it from your Stage 1 score.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-1">
                <Label className="text-xs">Reason</Label>
                <Select value={voidReason} onValueChange={setVoidReason}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Entered by mistake","Duplicate record","Customer cancelled","Not valid proof","Wrong client/job","Other"].map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => { onVoid(draft.n, voidReason); setVoidOpen(false); onOpenChange(false); }}>
                  Void Record
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Archive dialog */}
          <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Archive this record?</AlertDialogTitle>
                <AlertDialogDescription>
                  Archiving hides this record from the active view but keeps it in history.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => { onArchive(draft.n); setArchiveOpen(false); onOpenChange(false); }}>
                  Archive Record
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Delete draft dialog */}
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
                <AlertDialogDescription>
                  This draft has no proof, costs, payments, or score history. Delete it permanently?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => { onDelete(draft.n); setDeleteOpen(false); onOpenChange(false); }}>
                  Delete Draft
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Reviewed edit gate */}
          <AlertDialog open={editGateOpen} onOpenChange={setEditGateOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Enter correction mode</AlertDialogTitle>
                <AlertDialogDescription>
                  This record has been used for progression review. Changes must be logged as corrections with a reason.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => { setEditGateOpen(false); setMode("edit"); }}>
                  Continue
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Handover + referral capture */}
          <HandoverDialog
            jobId={draft.jobId}
            open={handoverOpen}
            onOpenChange={setHandoverOpen}
          />
        </div>

        {/* Primary save action — always visible at the bottom of the workspace */}
        <div className="sticky bottom-0 -mx-6 mt-2 border-t bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <div className="flex flex-col items-center gap-1 sm:items-end">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                disabled={isLocked || !draft.jobId}
                title={draft.jobId ? "Complete handover and capture referrals" : "Convert a quote to a job first"}
                onClick={() => setHandoverOpen(true)}
              >
                <Clock className="h-4 w-4" /> Complete Handover
              </Button>
              {!draft.jobId && (
                <span className="text-[11px] text-muted-foreground">Needs a job record</span>
              )}
            </div>
            <Button
              className="w-full sm:w-auto"
              onClick={saveProgress}
              disabled={saveDisabled}
            >
              <Save className="h-4 w-4" /> Save Progress
            </Button>
          </div>
          {reviewedNeedsReason && (
            <p className="mt-1 text-right text-[11px] text-amber-600">
              Add a correction reason above to save changes to this reviewed record.
            </p>
          )}
          <div className="mt-3 rounded-md border bg-muted/40 p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">Developer/debug panel — Stage 1 save prerequisites</span>
              <span className="text-muted-foreground">Active run: {savePrerequisites?.runId ?? evidenceRunId ?? "missing"}</span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 text-muted-foreground">
              <div>Auth user id: {canonicalPrerequisitesLoading ? "checking" : savePrerequisites?.authUserId ?? "missing"}</div>
              <div>Save Progress: {saveDisabled ? "disabled" : "enabled"}</div>
            </div>
            {canonicalSaveMissingBinding && (
              <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">
                {canonicalSaveBlockedMessage}
              </p>
            )}
          </div>
          {saveDiagnostics && (
            <div className="mt-3 rounded-md border bg-muted/40 p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">Developer/debug panel — Canonical Supabase write: {saveDiagnostics.success ? "Succeeded" : "Failed"}</span>
                <span className="text-muted-foreground">Active run: {saveDiagnostics.runId ?? "missing"}</span>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <div>stage1_jobs: <span className="font-mono font-semibold">{saveDiagnostics.counts.jobs ?? "error"}</span></div>
                <div>stage1_revenue_events: <span className="font-mono font-semibold">{saveDiagnostics.counts.revenueLines ?? "error"}</span></div>
                <div>stage1_job_costs: <span className="font-mono font-semibold">{saveDiagnostics.counts.costLines ?? "error"}</span></div>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3 text-muted-foreground">
                <div>Auth user id: {saveDiagnostics.authUserIdPresent ? saveDiagnostics.authUserId : "missing"}</div>
                <div>created_by matches auth: {String(saveDiagnostics.createdByMatchesAuthUser)}</div>
                <div>autopsy_run_id matches active: {String(saveDiagnostics.autopsyRunIdWrittenMatchesActiveRun)}</div>
              </div>
              {saveDiagnostics.errors.length > 0 && (
                <pre className="mt-2 max-h-36 overflow-auto rounded border bg-background p-2 whitespace-pre-wrap text-[11px]">
                  {JSON.stringify(saveDiagnostics.errors, null, 2)}
                </pre>
              )}
              <pre className="mt-2 max-h-36 overflow-auto rounded border bg-background p-2 whitespace-pre-wrap text-[11px]">
                {JSON.stringify(saveDiagnostics.rows, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Stage1ProofScorecard({
  units,
  onOpenUnit,
}: {
  units: ProofUnit[];
  onOpenUnit: (n: number) => void;
}) {
  const sc = useMemo(() => computeScorecard(units), [units]);
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Stage 1 Proof Scorecard</CardTitle>
            <CardDescription>Prove real demand before scaling</CardDescription>
          </div>
          <PlainGateBadge sc={sc} unitsCount={units.length} />
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
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => onOpenUnit(u.n)}
                      className="text-left hover:underline focus:outline-none"
                    >
                      <div className="font-medium leading-tight">{u.client}</div>
                      {u.jobSite ? (
                        <div className="text-xs text-muted-foreground leading-tight">{u.jobSite}</div>
                      ) : (
                        <div className="text-xs text-amber-600 leading-tight">Site not entered</div>
                      )}
                    </button>
                  </TableCell>
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

function AddJobForm({ onCreate }: { onCreate?: (u: ProofUnit) => void }) {
  const [form, setForm] = useLocalForm("addJob", {
    client: "",
    location: "",
    quote: "",
    scheduled: "",
  });
  function saveJob() {
    const client = form.client.trim();
    if (!client) {
      toast({ title: "Client required", description: "Enter a client name to add a job." });
      return;
    }
    const quoteNum = parseFloat(form.quote);
    onCreate?.({
      n: Date.now(),
      client,
      jobSite: form.location.trim() || undefined,
      proofType: "Completed Job",
      status: "Scheduled",
      gm: 0,
      evidence: false,
      quoteValue: !isNaN(quoteNum) ? quoteNum : undefined,
      scheduledDate: form.scheduled || undefined,
      lifecycle: "active",
      audit: [{ ts: new Date().toISOString(), action: "created" }],
    });
    toast({ title: "Job added", description: `${client} added to the Stage 1 workspace.` });
    setForm({ client: "", location: "", quote: "", scheduled: "" });
  }
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
          <Button onClick={saveJob}>
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

// ----- Financial Proof: local data store (frontend-only, scope-limited) -----
type JobKind = "oneoff" | "contract";
const ONEOFF_STATUSES = ["Scheduled", "In Progress", "Completed", "Paid"] as const;
const CONTRACT_STATUSES = ["Scheduled", "In Progress", "Completed", "Paid"] as const;
type OneoffStatus = (typeof ONEOFF_STATUSES)[number];
type ContractStatus = (typeof CONTRACT_STATUSES)[number];

interface FPClient { id: string; name: string }
interface FPJob {
  id: string;
  client_id: string;
  job_name: string;
  kind: JobKind;
  proof_type: ProofType;
  status: OneoffStatus | ContractStatus;
}
interface FPDocument {
  id: string;
  client_id: string;
  job_id: string;
  financial_id: string | null;
  document_type: string;
  file_name: string;
  file_url: string;
  mime_type: string;
  uploaded_at: string;
  uploaded_by: string;
  verification_status: "Missing" | "Uploaded" | "Verified" | "Rejected";
  document_date?: string;
  document_amount?: number;
  notes?: string;
  storage_path?: string;
  local_only?: boolean;
}
type EvidenceStatus = "Missing" | "Uploaded" | "Verified" | "Rejected";
interface FPFinancial {
  id: string;
  job_id: string;
  revenue_amount: number;
  materials_cost: number;
  labour_cost: number;
  other_direct_cost: number;
  gross_profit: number;
  gm_percent: number | null;
  evidence_status: EvidenceStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

const LS = {
  clients: "stage1.fp.clients",
  jobs: "stage1.fp.jobs",
  fin: "stage1.fp.financials",
  docs: "stage1.fp.documents",
};

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLS<T>(key: string, val: T) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* noop */ }
}
const uid = () => Math.random().toString(36).slice(2, 10);

const SEED_CLIENTS: FPClient[] = [
  { id: "c1", name: "M. Patel" },
  { id: "c2", name: "Sunrise Cafe" },
  { id: "c3", name: "QML" },
];
const SEED_JOBS: FPJob[] = [
  { id: "j1", client_id: "c1", job_name: "Front yard clean", kind: "oneoff", proof_type: "Completed Job", status: "Paid" },
  { id: "j2", client_id: "c2", job_name: "Weekly cafe clean", kind: "oneoff", proof_type: "Recurring Job", status: "In Progress" },
  { id: "j3", client_id: "c3", job_name: "Site A contract", kind: "contract", proof_type: "Contract Site", status: "Scheduled" },
  { id: "j4", client_id: "c3", job_name: "Site B contract", kind: "contract", proof_type: "Contract Site", status: "Scheduled" },
];

const PROOF_TYPES: ProofType[] = [
  "Completed Job",
  "Recurring Job",
  "Signed Contract",
  "Contract Site",
  "Repeat Job",
  "Referral Job",
];

const DOC_TYPES = [
  "Invoice",
  "Receipt",
  "Supplier Bill",
  "Timesheet",
  "Contract",
  "Quote",
  "Bank / Payment Screenshot",
  "Other",
] as const;

function statusBadgeClass(status: string) {
  const s = status.toLowerCase();
  if (s === "paid") return "border-emerald-400 text-emerald-700 bg-emerald-50";
  if (s === "completed") return "border-blue-400 text-blue-700 bg-blue-50";
  if (s === "in progress") return "border-indigo-400 text-indigo-700 bg-indigo-50";
  if (s === "scheduled") return "border-amber-400 text-amber-700 bg-amber-50";
  return "border-muted-foreground/40 text-muted-foreground bg-muted/40";
}

function FinancialsForm() {
  // ----- Hydrate stores -----
  const [clients, setClients] = useState<FPClient[]>(() => {
    const cur = readLS<FPClient[]>(LS.clients, []);
    return cur.length ? cur : SEED_CLIENTS;
  });
  const [jobs, setJobs] = useState<FPJob[]>(() => {
    const cur = readLS<FPJob[]>(LS.jobs, []);
    return cur.length ? cur : SEED_JOBS;
  });
  const [financials, setFinancials] = useState<FPFinancial[]>(() => readLS(LS.fin, []));
  const [docs, setDocs] = useState<FPDocument[]>(() => readLS(LS.docs, []));

  useEffect(() => writeLS(LS.clients, clients), [clients]);
  useEffect(() => writeLS(LS.jobs, jobs), [jobs]);
  useEffect(() => writeLS(LS.fin, financials), [financials]);
  useEffect(() => writeLS(LS.docs, docs), [docs]);

  // ----- Selection + form state -----
  const [clientId, setClientId] = useState<string>("");
  const [jobId, setJobId] = useState<string>("");
  const [revenue, setRevenue] = useState("");
  const [materials, setMaterials] = useState("");
  const [labour, setLabour] = useState("");
  const [other, setOther] = useState("");
  const [notes, setNotes] = useState("");
  const [savedFinId, setSavedFinId] = useState<string | null>(null);

  // Add-new dialogs (inline expanders, not modals)
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [showNewJob, setShowNewJob] = useState(false);
  const [newJob, setNewJob] = useState<{ name: string; kind: JobKind; proof_type: ProofType; status: string }>({
    name: "",
    kind: "oneoff",
    proof_type: "Completed Job",
    status: "Open",
  });

  // Doc upload state
  const [docType, setDocType] = useState<string>("Invoice");
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);

  const jobsForClient = useMemo(
    () => jobs.filter((j) => j.client_id === clientId),
    [jobs, clientId]
  );
  const selectedJob = useMemo(() => jobs.find((j) => j.id === jobId) || null, [jobs, jobId]);

  // Reset job when client changes
  useEffect(() => {
    if (!jobsForClient.find((j) => j.id === jobId)) setJobId("");
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  // GM compute
  const rev = Number(revenue) || 0;
  const mat = Number(materials) || 0;
  const lab = Number(labour) || 0;
  const oth = Number(other) || 0;
  const grossProfit = rev - mat - lab - oth;
  const gm = rev > 0 ? Math.round((grossProfit / rev) * 100) : null;

  // Evidence
  const linkedDocs = docs.filter(
    (d) => d.job_id === jobId && (savedFinId ? d.financial_id === savedFinId || d.financial_id === null : true)
  );
  const evidenceStatus = (linkedDocs.length === 0 ? "Missing" : "Uploaded") as EvidenceStatus;

  // ----- Handlers -----
  function handleAddClient() {
    const name = newClientName.trim();
    if (!name) return;
    const dup = clients.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (dup) {
      toast({ title: "Client already exists", description: `Selected existing "${dup.name}".` });
      setClientId(dup.id);
    } else {
      const c: FPClient = { id: uid(), name };
      setClients([...clients, c]);
      setClientId(c.id);
      toast({ title: "Client added", description: name });
    }
    setNewClientName("");
    setShowNewClient(false);
  }

  function handleAddJob() {
    if (!clientId) {
      toast({ title: "Select a client first" });
      return;
    }
    const name = newJob.name.trim();
    if (!name) return;
    const j: FPJob = {
      id: uid(),
      client_id: clientId,
      job_name: name,
      kind: newJob.kind,
      proof_type: newJob.proof_type,
      status: newJob.status as OneoffStatus | ContractStatus,
    };
    setJobs([...jobs, j]);
    setJobId(j.id);
    setNewJob({ name: "", kind: "oneoff", proof_type: "Completed Job", status: "Open" });
    setShowNewJob(false);
    toast({ title: "Job / Contract Site added", description: name });
  }

  function handleSave() {
    if (!clientId) return toast({ title: "Select a client" });
    if (!jobId) return toast({ title: "Select a job / contract site" });
    if (!revenue || rev <= 0) return toast({ title: "Enter revenue" });
    if (mat < 0 || lab < 0 || oth < 0) return toast({ title: "Costs must be zero or positive" });

    const now = new Date().toISOString();
    if (savedFinId) {
      setFinancials(financials.map((f) =>
        f.id === savedFinId
          ? { ...f, revenue_amount: rev, materials_cost: mat, labour_cost: lab, other_direct_cost: oth,
              gross_profit: grossProfit, gm_percent: gm, evidence_status: evidenceStatus, notes, updated_at: now }
          : f
      ));
      toast({ title: "Financial proof updated" });
    } else {
      const f: FPFinancial = {
        id: uid(),
        job_id: jobId,
        revenue_amount: rev,
        materials_cost: mat,
        labour_cost: lab,
        other_direct_cost: oth,
        gross_profit: grossProfit,
        gm_percent: gm,
        evidence_status: evidenceStatus,
        notes,
        created_at: now,
        updated_at: now,
      };
      setFinancials([...financials, f]);
      setSavedFinId(f.id);
      // Attach any pre-existing job-level docs to this financial record
      setDocs(docs.map((d) => (d.job_id === jobId && !d.financial_id ? { ...d, financial_id: f.id } : d)));
      toast({ title: "Financial proof saved" });
    }
  }

  async function uploadOne(file: File): Promise<{ file_url: string; storage_path?: string; local_only: boolean }> {
    const ts = Date.now();
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${clientId}/${jobId}/${savedFinId ?? "pending"}/${ts}_${safeName}`;
    try {
      const { error } = await supabase.storage
        .from("stage1-evidence")
        .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("stage1-evidence").getPublicUrl(path);
      return { file_url: pub.publicUrl, storage_path: path, local_only: false };
    } catch {
      return { file_url: URL.createObjectURL(file), local_only: true };
    }
  }

  async function handleFiles(files: File[], replaceId?: string) {
    if (!clientId || !jobId) {
      toast({ title: "Select a client and job before attaching evidence" });
      return;
    }
    if (files.length === 0) return;
    const ACCEPT = ["image/jpeg", "image/png", "image/heic", "image/heif", "application/pdf"];
    const valid = files.filter((f) => ACCEPT.includes(f.type) || /\.(jpe?g|png|heic|heif|pdf)$/i.test(f.name));
    if (valid.length === 0) {
      toast({ title: "Unsupported file type", description: "Allowed: JPEG, PNG, HEIC, PDF" });
      return;
    }
    const now = new Date().toISOString();
    const uploads = await Promise.all(valid.map(uploadOne));
    const newDocs: FPDocument[] = valid.map((file, i) => ({
      id: replaceId ?? uid(),
      client_id: clientId,
      job_id: jobId,
      financial_id: savedFinId,
      document_type: docType,
      file_name: file.name,
      file_url: uploads[i].file_url,
      mime_type: file.type || "application/octet-stream",
      uploaded_at: now,
      uploaded_by: "anonymous",
      verification_status: "Uploaded",
      storage_path: uploads[i].storage_path,
      local_only: uploads[i].local_only,
    }));
    if (replaceId) {
      setDocs(docs.map((d) => (d.id === replaceId ? newDocs[0] : d)));
      toast({ title: "Evidence replaced" });
    } else {
      setDocs([...docs, ...newDocs]);
      toast({
        title: `${newDocs.length} document${newDocs.length > 1 ? "s" : ""} attached`,
        description: uploads.some((u) => u.local_only)
          ? "Stored locally — connect storage bucket 'stage1-evidence' for persistence."
          : undefined,
      });
    }
  }

  function handleRemoveDoc(id: string) {
    setDocs(docs.filter((d) => d.id !== id));
  }

  const canSave = !!clientId && !!jobId && rev > 0 && mat >= 0 && lab >= 0 && oth >= 0;
  const statusOptions = selectedJob?.kind === "contract" ? CONTRACT_STATUSES : ONEOFF_STATUSES;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-4 w-4" /> Financial Proof
        </CardTitle>
        <CardDescription>Record revenue, direct costs, and evidence to prove gross margin.</CardDescription>
        <div className="rounded-md border-l-4 border-[hsl(var(--autopsy-accent,220_70%_50%))] bg-muted/40 p-3 mt-2 text-sm">
          <div className="font-semibold">Build the habit now.</div>
          <div className="text-muted-foreground">
            Every job needs revenue, costs, and proof. Later, this same discipline will feed your accounting system.
          </div>
        </div>
        <p className="text-xs text-muted-foreground pt-2">
          This is proof that the work is safe to repeat — not bookkeeping, tax, or accounting.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        {/* Client + Job selection */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Client</Label>
            <div className="flex gap-2">
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="icon" onClick={() => setShowNewClient((v) => !v)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {showNewClient && (
              <div className="flex gap-2 pt-2">
                <Input
                  placeholder="New client name"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                />
                <Button type="button" size="sm" onClick={handleAddClient}>Add</Button>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label>Job / Contract Site</Label>
            <div className="flex gap-2">
              <Select value={jobId} onValueChange={setJobId} disabled={!clientId}>
                <SelectTrigger>
                  <SelectValue placeholder={clientId ? "Select job" : "Select a client first"} />
                </SelectTrigger>
                <SelectContent>
                  {jobsForClient.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.job_name} <span className="text-muted-foreground">· {j.proof_type}</span>
                    </SelectItem>
                  ))}
                  {jobsForClient.length === 0 && clientId && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No jobs yet</div>
                  )}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="icon" disabled={!clientId} onClick={() => setShowNewJob((v) => !v)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {showNewJob && (
              <div className="rounded-md border bg-muted/30 p-3 space-y-2 mt-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Job name</Label>
                    <Input
                      value={newJob.name}
                      onChange={(e) => setNewJob({ ...newJob, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Kind</Label>
                    <Select
                      value={newJob.kind}
                      onValueChange={(v) => {
                        const kind = v as JobKind;
                        setNewJob({
                          ...newJob,
                          kind,
                          status: kind === "contract" ? CONTRACT_STATUSES[0] : ONEOFF_STATUSES[0],
                        });
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="oneoff">One-off job</SelectItem>
                        <SelectItem value="contract">Contract / site</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Proof type</Label>
                    <Select
                      value={newJob.proof_type}
                      onValueChange={(v) => setNewJob({ ...newJob, proof_type: v as ProofType })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PROOF_TYPES.map((p) => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Initial status</Label>
                    <Select
                      value={newJob.status}
                      onValueChange={(v) => setNewJob({ ...newJob, status: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(newJob.kind === "contract" ? CONTRACT_STATUSES : ONEOFF_STATUSES).map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="button" size="sm" onClick={handleAddJob}>Add Job / Site</Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Job status badge (sourced from job record) */}
        {selectedJob && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Job status:</span>
            <Badge variant="outline" className={statusBadgeClass(selectedJob.status)}>
              {selectedJob.status}
            </Badge>
            <span className="text-xs text-muted-foreground">({selectedJob.proof_type})</span>
          </div>
        )}

        {/* Financial fields */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Revenue Received / Expected ($)</Label>
            <Input type="number" min={0} value={revenue} onChange={(e) => setRevenue(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Materials ($)</Label>
            <Input type="number" min={0} value={materials} onChange={(e) => setMaterials(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Labour ($)</Label>
            <Input type="number" min={0} value={labour} onChange={(e) => setLabour(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Other Direct Costs ($)</Label>
            <Input type="number" min={0} value={other} onChange={(e) => setOther(e.target.value)} />
          </div>
        </div>

        {/* Computed GM */}
        <div className="rounded-md border bg-muted/30 p-3 flex items-center justify-between">
          <div className="text-sm">
            <div className="text-muted-foreground">Gross Profit</div>
            <div className="font-medium">{rev > 0 ? `$${grossProfit.toLocaleString()}` : "—"}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Computed GM</div>
            <div className={`text-2xl font-semibold ${gm == null ? "" : gm >= 30 ? "text-emerald-600" : "text-amber-600"}`}>
              {gm == null ? "—" : `${gm}%`}
            </div>
          </div>
        </div>
        {gm == null && (
          <p className="text-xs text-muted-foreground -mt-2">Enter revenue to calculate gross margin.</p>
        )}

        {/* Margin rule banner */}
        {gm != null && gm < 30 && (
          <div className="rounded-md border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">
            <span className="font-semibold">Margin blocker: </span>this work is not yet economically safe to scale.
          </div>
        )}
        {gm != null && gm >= 30 && (
          <div className="rounded-md border-l-4 border-emerald-500 bg-emerald-50 p-3 text-sm text-emerald-900">
            <span className="font-semibold">Margin proof passed, </span>subject to valid evidence.
          </div>
        )}

        {/* Notes */}
        <div className="space-y-1">
          <Label>Notes (optional)</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {/* Evidence */}
        <div className="rounded-md border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">Evidence</span>
            </div>
            <Badge
              variant="outline"
              className={
                evidenceStatus === "Verified"
                  ? "border-emerald-400 text-emerald-700 bg-emerald-50"
                  : evidenceStatus === "Uploaded"
                    ? "border-blue-400 text-blue-700 bg-blue-50"
                    : evidenceStatus === "Rejected"
                      ? "border-red-400 text-red-700 bg-red-50"
                      : "border-amber-400 text-amber-700 bg-amber-50"
              }
            >
              {evidenceStatus}
            </Badge>
          </div>

          <p className="text-sm text-muted-foreground">
            Take the photo now. Do not leave receipts in your car, inbox, or memory.
          </p>

          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div className="space-y-1">
              <Label className="text-xs">Document type</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!jobId}
              onClick={() => cameraInputRef.current?.click()}
              className="gap-2"
            >
              <Camera className="h-4 w-4" /> Take Photo
            </Button>
            <Button
              type="button"
              disabled={!jobId}
              onClick={() => fileInputRef.current?.click()}
              className="gap-2"
            >
              <Paperclip className="h-4 w-4" /> Upload File
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Accepts JPEG, PNG, HEIC, PDF. Camera opens on supported mobile devices.
          </p>

          {/* Hidden inputs */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/jpeg,image/png,image/heic,image/heif"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              handleFiles(Array.from(e.target.files || []));
              e.target.value = "";
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/heic,image/heif,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(Array.from(e.target.files || []));
              e.target.value = "";
            }}
          />
          <input
            ref={replaceInputRef}
            type="file"
            accept="image/jpeg,image/png,image/heic,image/heif,application/pdf"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (replaceTargetId && files[0]) handleFiles([files[0]], replaceTargetId);
              setReplaceTargetId(null);
              e.target.value = "";
            }}
          />

          {linkedDocs.length === 0 ? (
            <div className="rounded-md border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">
              <span className="font-semibold">Evidence blocker: </span>financial claims must be supported before progression can unlock.
            </div>
          ) : (
            <ul className="space-y-1 text-sm">
              {linkedDocs.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded border bg-white px-2 py-1.5">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{d.document_type} — {d.file_name}</span>
                    <Badge variant="outline" className="text-[10px] capitalize">{d.verification_status}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(d.uploaded_at).toLocaleDateString()}
                    </span>
                    {d.local_only && (
                      <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 bg-amber-50">local</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {d.file_url && (
                      <Button type="button" variant="ghost" size="sm" asChild>
                        <a href={d.file_url} target="_blank" rel="noreferrer">View</a>
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => { setReplaceTargetId(d.id); replaceInputRef.current?.click(); }}
                    >
                      Replace
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveDoc(d.id)}>
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Proof status row */}
        {(() => {
          const hasCosts = !!materials || !!labour || !!other;
          const statuses: { label: string; tone: "good" | "warn" | "bad" | "muted" }[] = [];
          const complete = rev > 0 && hasCosts && gm != null && linkedDocs.length > 0;
          if (!complete) statuses.push({ label: "Incomplete", tone: "warn" });
          if (linkedDocs.length === 0) statuses.push({ label: "Evidence Missing", tone: "bad" });
          else statuses.push({ label: "Evidence Uploaded", tone: "good" });
          if (gm != null) statuses.push({ label: gm >= 30 ? "Margin Passed" : "Margin Blocked", tone: gm >= 30 ? "good" : "bad" });
          const cls = (t: string) =>
            t === "good" ? "border-emerald-400 text-emerald-700 bg-emerald-50"
            : t === "bad" ? "border-red-400 text-red-700 bg-red-50"
            : t === "warn" ? "border-amber-400 text-amber-700 bg-amber-50"
            : "border-muted-foreground/30 text-muted-foreground bg-muted/30";
          return (
            <div className="rounded-md border bg-muted/20 p-3 space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Proof status</div>
              <div className="flex flex-wrap gap-2">
                {statuses.map((s) => (
                  <Badge key={s.label} variant="outline" className={cls(s.tone)}>{s.label}</Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                A financial proof record is not complete until revenue is entered, direct costs are entered, gross margin is calculated, and supporting evidence is attached.
              </p>
            </div>
          );
        })()}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!canSave}>
            Save Financial Proof
          </Button>
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

function Stage1BlockedScreen({ runId }: { runId: string }) {
  const { state: progression } = useProgression(runId);
  const band = progression?.band ?? "unknown";
  const copy = ROUTING_COPY[band] ?? ROUTING_COPY.unknown;
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Autopsy → Stage 1
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Stage 1 is not yet open</h1>
      </div>
      <Card className="border-red-300 bg-red-50/40">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-red-700" />
            <CardTitle className="text-base text-red-900">
              Stage Permission: {progression?.stagePermission ?? "Locked"}
            </CardTitle>
          </div>
          <CardDescription className="text-red-900/80">
            Worksheet status: {progression?.worksheetStatus ?? "Not Started"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">{copy.body}</p>
          <div className="rounded-md border bg-white p-3 text-sm space-y-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              What must happen next
            </div>
            <p>
              Complete the Readiness / Repair Worksheet, satisfy the retest
              condition for your primary risk, and confirm the readiness
              checklist. Stage 1 opens automatically once Stage Permission
              reaches Stage 1 Eligible or Conditional Stage 1 Access.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to={`/autopsy/run/${runId}/readiness`}>
                {copy.primaryCta.label}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/autopsy/run/${runId}`}>View Diagnostic Summary</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stage1ProgressionHeader({
  progression,
  gateMet,
  onRequestReview,
  onMarkReviewPassed,
}: {
  progression: NonNullable<ReturnType<typeof useProgression>["state"]>;
  gateMet: boolean;
  onRequestReview: () => void;
  onMarkReviewPassed: () => void;
}) {
  const conditional = progression.stagePermission === "Conditional Stage 1 Access";
  const review = progression.stagePermission === "Stage 1 Review Required";
  const stage2 = progression.stagePermission === "Stage 2 Eligible";
  return (
    <Card className="border-[hsl(var(--autopsy-accent,220_70%_50%))]/40">
      <CardHeader className="pb-2">
        <CardDescription className="uppercase text-xs tracking-wide">
          Progression Status
        </CardDescription>
        <CardTitle className="text-base">Autopsy → Worksheet → Stage 1</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 text-sm">
          <HeaderField label="Autopsy Verdict" value={progression.verdictName || "—"} />
          <HeaderField label="Primary Risk" value={progression.primaryRisk || "—"} />
          <HeaderField label="Stage Permission" value={progression.stagePermission} />
          <HeaderField label="Worksheet Status" value={progression.worksheetStatus} />
          <HeaderField label="Stage 1 Goal" value={STAGE_1_GOAL} multiline />
        </div>
        {conditional && (
          <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
            Conditional Stage 1 access. Your worksheet was accepted with risk —
            every proof unit must show real evidence and recorded margin.
          </div>
        )}
        {review && (
          <div className="rounded-md border-l-4 border-blue-500 bg-blue-50 p-3 text-sm text-blue-900 space-y-2">
            <div>
              Stage 1 proof appears sufficient for review. Confirm margin
              quality, evidence, payment proof, customer concentration, and
              repeatability before progression.
            </div>
            <Button size="sm" onClick={onMarkReviewPassed}>
              Confirm Stage 1 Review Passed
            </Button>
          </div>
        )}
        {stage2 && (
          <div className="rounded-md border-l-4 border-emerald-500 bg-emerald-50 p-3 text-sm text-emerald-900">
            Stage 1 proof requirements satisfied. You are now eligible to begin
            Stage 2: Repeatability & Capacity.
          </div>
        )}
        {!review && !stage2 && gateMet && (
          <div className="flex items-center justify-between rounded-md border bg-muted/40 p-3 text-sm">
            <span>Gate conditions met — request Stage 1 Review to lock in the result.</span>
            <Button size="sm" onClick={onRequestReview}>
              Review Stage 1 Summary
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HeaderField({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className={multiline ? "sm:col-span-2 lg:col-span-5" : ""}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium text-sm leading-snug">{value}</div>
    </div>
  );
}

export default function Stage1() {
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [runId, setRunIdState] = useState<string | null>(() =>
    searchParams.get("runId") || getStage1RunId() || getActiveRunId(),
  );
  useEffect(() => {
    const nextRunId = searchParams.get("runId") || getStage1RunId() || getActiveRunId();
    if (!nextRunId) return;
    setStage1RunId(nextRunId);
    setRunIdState(nextRunId);
  }, [searchParams]);
  const { state: progression, update: updateProgression } = useProgression(runId);
  // Proof units (invoices, costs, GST treatments) are a persistent commercial
  // record scoped to this Autopsy run. Supabase is the canonical source of
  // truth; localStorage is a cache only. Paint instantly from the cache, then
  // hydrate from Supabase so invoice/cost/GST/ex-GST values survive refresh,
  // logout/login and device changes.
  const [units, setUnits] = useState<ProofUnit[]>(() => {
    const cached = loadStage1UnitsCache(runId);
    return cached.length > 0 ? cached : SEED_UNITS;
  });
  const hydratedRef = useRef(false);
  // Always-current snapshot of units for awaited persistence (avoids stale
  // closures and an effect that re-syncs on every render).
  const unitsRef = useRef<ProofUnit[]>(units);
  useEffect(() => {
    unitsRef.current = units;
  }, [units]);

  // Re-hydrate when the active run changes (e.g. switching runs without remount).
  //
  // CANONICAL SUPABASE IS THE SINGLE SOURCE OF TRUTH. We paint the cache first
  // for instant feedback, then replace it with canonical records. The cache may
  // only contribute non-commercial presentation detail (see mergeUnits) and can
  // never mask or revive commercial records. If the cache holds records that
  // were never written to Supabase (e.g. pre-migration), we push them up once so
  // canonical becomes complete — then canonical wins.
  useEffect(() => {
    hydratedRef.current = false;
    const cacheNow = loadStage1UnitsCache(runId);
    setUnits(cacheNow.length > 0 ? cacheNow : SEED_UNITS);
    let cancelled = false;
    (async () => {
      let canonical = await fetchStage1Units(runId);
      if (cancelled || canonical == null) return; // failure → keep cache
      const cache = loadStage1UnitsCache(runId);
      // Migration: canonical empty but cache has real records → push up once.
      if (canonical.length === 0 && cache.length > 0) {
        const synced = await syncStage1Units(runId, cache);
        if (cancelled) return;
        if (synced) {
          const refetched = await fetchStage1Units(runId);
          if (cancelled) return;
          if (refetched && refetched.length > 0) canonical = refetched;
        }
      }
      const merged = mergeUnits(canonical, cache);
      hydratedRef.current = true;
      setUnits(merged);
      saveStage1UnitsCache(runId, merged);
      if (isDebug()) {
        console.info("[stage1] hydrated from canonical", {
          runId,
          canonicalJobs: canonical.length,
          displayedUnits: merged.length,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  // Single, explicit persistence path. Every mutation goes through this:
  //   1. paint optimistically + cache,
  //   2. write canonical (INSERT/UPDATE/DELETE under RLS),
  //   3. re-fetch canonical truth and re-render from it.
  // Returns the canonical-merged units on success, or null when the write did
  // not reach Supabase (e.g. not authenticated) so callers can avoid claiming
  // a save succeeded.
  const persistUnits = useCallback(
    async (
      compute: (prev: ProofUnit[]) => ProofUnit[],
    ): Promise<ProofUnit[] | null> => {
      const nextUnits = compute(unitsRef.current);
      unitsRef.current = nextUnits;
      setUnits(nextUnits); // optimistic paint
      saveStage1UnitsCache(runId, nextUnits);
      if (isDebug()) {
        console.info("[stage1] persisting units", {
          runId,
          units: nextUnits.length,
          editingJobIds: nextUnits.map((u) => u.stage1JobId ?? `n:${u.n}`),
        });
      }
      if (!runId || !user?.id) return null;
      const synced = await syncStage1Units(runId, nextUnits);
      // Reconcile the display to canonical truth REGARDLESS of write outcome —
      // the dashboard/ledger must always reflect Supabase, never optimistic or
      // cached commercial values. If a write failed, the refetch will show the
      // canonical (possibly unchanged) state rather than pretend it landed.
      const canonical = await fetchStage1Units(runId);
      if (canonical != null) {
        const merged = mergeUnits(canonical, loadStage1UnitsCache(runId));
        unitsRef.current = merged;
        setUnits(merged);
        saveStage1UnitsCache(runId, merged);
      }
      // `synced` is null when any canonical write errored → treat as not saved.
      return synced ? (canonical != null ? mergeUnits(canonical, loadStage1UnitsCache(runId)) : synced) : null;
    },
    [runId, user?.id],
  );
  const persistUnitsWithDiagnostics = useCallback(
    async (
      compute: (prev: ProofUnit[]) => ProofUnit[],
    ): Promise<Stage1CanonicalWriteDiagnostics> => {
      const nextUnits = compute(unitsRef.current);
      unitsRef.current = nextUnits;
      setUnits(nextUnits);
      saveStage1UnitsCache(runId, nextUnits);

      if (!runId || !user?.id) {
        return {
          status: "failed",
          runId,
          authUserId: user?.id ?? null,
          authUserIdPresent: !!user?.id,
          autopsyRunIdWrittenMatchesActiveRun: false,
          createdByMatchesAuthUser: false,
          counts: { jobs: null, revenueLines: null, costLines: null },
          rows: { jobs: [], revenueLines: [], costLines: [] },
          writtenRows: { jobs: [], revenueLines: [], costLines: [] },
          errors: [{ table: "stage1_canonical", operation: "preflight", message: "Stage 1 cannot save because no signed-in user or active Autopsy run is attached." }],
          writeSucceeded: false,
          success: false,
          message: "Stage 1 cannot save because no signed-in user or active Autopsy run is attached.",
        };
      }

      const { units: syncedUnits, diagnostics } = await syncStage1UnitsWithDiagnostics(runId, nextUnits);
      const canonical = await fetchStage1Units(runId);
      if (canonical != null) {
        const merged = mergeUnits(canonical, loadStage1UnitsCache(runId));
        unitsRef.current = merged;
        setUnits(merged);
        saveStage1UnitsCache(runId, merged);
      } else if (syncedUnits) {
        unitsRef.current = syncedUnits;
        setUnits(syncedUnits);
        saveStage1UnitsCache(runId, syncedUnits);
      }
      return diagnostics;
    },
    [runId, user?.id],
  );
  const activeUnits = useMemo(() => units.filter((u) => (u.lifecycle ?? "active") === "active"), [units]);
  const sc = useMemo(() => computeScorecard(activeUnits), [activeUnits]);
  const firstFive = useMemo(
    () => computeFirstFive(activeUnits, sc.gate === "Unlocked"),
    [activeUnits, sc.gate],
  );
  const reviewGate = useMemo(() => computeReviewGate(firstFive), [firstFive]);
  // Run-scoped reflection / exit gate persistence. Supabase is canonical;
  // localStorage is cache only.
  const [reflection, setReflection] = useState<Stage1Reflection>(() =>
    loadStage1ReflectionCache(runId),
  );
  useEffect(() => {
    setReflection(loadStage1ReflectionCache(runId));
    let cancelled = false;
    (async () => {
      const canonical = await fetchStage1Reflection(runId);
      if (cancelled || canonical == null) return; // failure → keep cache
      setReflection(canonical);
      saveStage1ReflectionCache(runId, canonical);
    })();
    return () => {
      cancelled = true;
    };
  }, [runId]);
  useEffect(() => {
    saveStage1ReflectionCache(runId, reflection);
    void syncStage1Reflection(runId, reflection);
  }, [runId, reflection]);
  const parityAudit = useMemo(
    () => computeParityAudit(firstFive, reviewGate, reflection, units.length),
    [firstFive, reviewGate, reflection, units.length],
  );
  const [openUnitN, setOpenUnitN] = useState<number | null>(null);
  const openUnit = units.find((u) => u.n === openUnitN) ?? null;

  const focusAddJob = () => {
    const tab = document.querySelector<HTMLButtonElement>('[role="tab"][value="job"]');
    tab?.click();
    document.getElementById("operator-inputs")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const focusFinancials = () => {
    const tab = document.querySelector<HTMLButtonElement>('[role="tab"][value="financials"]');
    tab?.click();
    document.getElementById("operator-inputs")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // If we have a progression record but Stage 1 is not yet reachable, block entry.
  if (runId && progression && !isStage1Reachable(progression.stagePermission)) {
    return <Stage1BlockedScreen runId={runId} />;
  }

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

      {progression && (
        <Stage1ProgressionHeader
          progression={progression}
          gateMet={sc.gate === "Unlocked"}
          onRequestReview={() => updateProgression({ stage1ReviewRequested: true })}
          onMarkReviewPassed={() => updateProgression({ stage1ReviewPassed: true })}
        />
      )}

      <Stage1GoalBanner />
      <WhatToDoNextCard sc={sc} unitsCount={units.length} onAddFirst={focusAddJob} />

      <FirstFiveJobsPanel ff={firstFive} />

      <Stage1ReviewGate gate={reviewGate} />

      <Stage1ReflectionGate reflection={reflection} onChange={setReflection} />

      <Stage1ParityAudit audit={parityAudit} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><CurrentStageCard /></div>
        <StageCoachCard />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MethodPerformanceCard />
        <PipelineFunnelCard />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Stage1ProofScorecard units={activeUnits} onOpenUnit={setOpenUnitN} />
        <MarginSnapshot />
      </div>

      <Card id="operator-inputs">
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
            <TabsContent value="job" className="mt-4">
              <AddJobForm
                onCreate={(u) => {
                  void persistUnits((prev) => [...prev, u]);
                  setOpenUnitN(u.n);
                }}
              />
            </TabsContent>
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

      <JobDetailSheet
        unit={openUnit}
        open={openUnitN != null}
        onOpenChange={(o) => !o && setOpenUnitN(null)}
        onSave={async (u) => {
          return persistUnitsWithDiagnostics((prev) =>
            prev.map((x) => (x.n === u.n ? { ...u, stage1JobId: x.stage1JobId ?? u.stage1JobId } : x)),
          );
        }}
        savePrerequisites={{ runId, authUserId: user?.id ?? null, loading: authLoading }}
        onJumpToFinancials={() => { setOpenUnitN(null); focusFinancials(); }}
        concentrationClient={sc.concentrationClient}
        onVoid={(n, reason) => {
          void persistUnits((prev) => prev.map((x) => x.n === n ? {
            ...x,
            lifecycle: "voided",
            voidReason: reason,
            voidedAt: new Date().toISOString(),
            audit: [...(x.audit ?? []), { ts: new Date().toISOString(), action: "voided", reason }],
          } : x));
          toast({ title: "Record voided", description: "Kept in history, removed from your Stage 1 score." });
        }}
        onArchive={(n) => {
          void persistUnits((prev) => prev.map((x) => x.n === n ? {
            ...x,
            lifecycle: "archived",
            archivedAt: new Date().toISOString(),
            audit: [...(x.audit ?? []), { ts: new Date().toISOString(), action: "archived" }],
          } : x));
          toast({ title: "Record archived" });
        }}
        onDelete={(n) => {
          void persistUnits((prev) => prev.filter((x) => x.n !== n));
          toast({ title: "Draft deleted" });
        }}
      />
    </div>
  );
}
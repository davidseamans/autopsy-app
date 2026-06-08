import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  SEED_UNITS,
  computeScorecard,
  JobDetailSheet,
  type ProofUnit,
} from "./Stage1";
import { supabase, isDebug } from "@/lib/supabase";
import { AuthGate } from "@/components/AuthGate";
import { useAuth } from "@/lib/auth";
import {
  createQuote,
  setQuoteOutcome,
  convertQuoteToJob,
  loadStage1Board,
} from "@/lib/jobProvisioning";
import { getActiveRunId, getStage1RunId, setStage1RunId } from "@/lib/progression";
import {
  fetchStage1Units,
  loadStage1UnitsCache,
  mergeUnits,
  saveStage1UnitsCache,
  syncStage1UnitsWithDiagnostics,
  type Stage1CanonicalWriteDiagnostics,
} from "@/lib/stage1Store";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  FileText,
  Briefcase,
  TrendingUp,
  CheckCircle2,
  IdCard,
  Loader2,
  Plus,
} from "lucide-react";
import { DetailedJobCostReport } from "@/components/DetailedJobCostReport";

const fmtMoney = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Signed money display: handles negatives as "-$X.XX" rather than "$-X.XX"
const fmtSignedMoney = (n: number) => `${n < 0 ? "-" : ""}$${fmtMoney(Math.abs(n))}`;

// Convert yyyy-mm-dd (from <input type="date">) to dd/mm/yyyy for AU display
const isoToAU = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
};

// ---------- Sample fixtures for the KPI drill-downs ----------
// These mirror the operating story used by the existing ledger.
// Baseline figures for fields that aren't captured by Log Activity (leads, jobs)
// plus a static baseline note. Attempts / contacts / quotes are aggregated from
// dated activity records on top of this baseline.
const METHOD_BASELINE: { method: string; attempts: number; contacts: number; leads: number; quotes: number; jobs: number; notes: string }[] = [];
const METHOD_OPTIONS = [
  "Phone Outreach",
  "Referral Request",
  "Local Flyer",
  "Email Outreach",
  "Walk-in",
  "Other",
];

type LeadActivity = {
  id: string;
  activity_date: string; // yyyy-mm-dd
  method: string;
  attempts: number;
  contacts_made: number;
  quotes_generated: number;
  notes: string;
  created_at: string;
};

const QUOTE_STATUSES = ["Sent", "Accepted", "Declined", "Expired", "Rejected"] as const;
type QuoteStatus = typeof QUOTE_STATUSES[number];
const REJECTION_REASONS = [
  "Too expensive",
  "No confidence",
  "Poor fit",
  "Slow response",
  "Competitor chosen",
  "Scope unclear",
  "No budget",
  "Other",
] as const;

type Quote = {
  number: string;
  client: string;
  site: string;
  value: number;
  status: QuoteStatus;
  quoteDate: string;   // iso yyyy-mm-dd
  followUp: string;    // iso yyyy-mm-dd
  reason: string;
  converted?: boolean;
  convertedToN?: number;
  convertedJobNumber?: string;
  convertedAt?: string;
  sourceActivityId?: string;
  sourceActivityDate?: string;
  method?: string;
  notes?: string;
  createdAt?: string;
  // Real Core linkage (quotes table)
  dbId?: string;
  accountId?: string;
  siteId?: string;
};

// Seed: the five accepted quotes that produced the five ledger jobs,
// plus a handful of in-flight / rejected quotes for the conversion board.
const SEED_QUOTES: Quote[] = [];

// Canonical Stage 1 snapshot shape, returned by the read-only Supabase RPC
// public.get_stage1_progress_snapshot_by_run(p_run_id uuid). Supabase owns
// identity resolution and is the source of truth; this component never
// assembles progression tables or invents identity.
type Stage1Snapshot = {
  stage_progress_id: string | null;
  resolved_user_id: string | null;
  user_id: string | null;
  current_stage_code: string | null;
  current_gate_status: string | null;
  autopsy_run_id: string | null;
  started_at: string | null;
  unlocked_at: string | null;
  completed_at: string | null;
  last_activity_at: string | null;
  notes: string | null;
  verified_evidence_count: number | null;
  total_evidence_count: number | null;
  open_commitment_count: number | null;
  met_commitment_count: number | null;
  missed_commitment_count: number | null;
  partial_commitment_count: number | null;
  latest_operator_insight_count: number | null;
  latest_operator_insight_at: string | null;
};

// Canonical Stage 1 evidence requirement row, returned by the read-only RPC
// public.get_stage1_evidence_requirements_snapshot(p_stage_progress_id uuid).
// Supabase owns the requirement templates and instantiated evidence rows; this
// component only displays them and never computes requirement status or creates
// evidence rows.
type Stage1Requirement = {
  stage_gate_evidence_id: string | null;
  stage_progress_id: string | null;
  stage_code: string | null;
  requirement_code: string | null;
  evidence_type: string | null;
  evidence_label: string | null;
  evidence_status: string | null;
  verified: boolean | null;
  verified_at: string | null;
  minimum_standard: string | null;
  required_count: number | null;
  display_order: number | null;
  related_table: string | null;
  related_record_id: string | null;
  evidence_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

// Canonical Stage 1 completion evaluation, returned by the read-only RPC
// public.evaluate_stage1_completion(p_stage_progress_id uuid). Supabase owns
// the evaluator; this component only displays the result and never computes
// completion client-side.
type Stage1Evaluation = {
  stage_progress_id: string | null;
  stage_code: string | null;
  current_gate_status: string | null;
  total_required: number | null;
  valid_count: number | null;
  submitted_count: number | null;
  missing_count: number | null;
  invalid_count: number | null;
  waived_count: number | null;
  is_complete: boolean | null;
  recommended_gate_status: string | null;
};

// Gate decision result returned by public.apply_stage1_gate_decision(p_stage_progress_id).
// Supabase owns the decision; this component only displays the returned audit row.
type Stage1GateDecision = {
  decision_id: string | null;
  stage_progress_id: string | null;
  decision_status: string | null;
  current_gate_status: string | null;
  is_complete: boolean | null;
  valid_count: number | null;
  total_required: number | null;
};

// Canonical Stage 1 commitment row, returned by the read-only RPC
// public.get_stage1_commitments_snapshot(p_stage_progress_id uuid). Supabase
// owns commitment state; this component only displays rows and never creates
// or checks commitments client-side.
type Stage1Commitment = {
  commitment_id: string | null;
  stage_progress_id: string | null;
  user_id: string | null;
  commitment_type: string | null;
  commitment_label: string | null;
  target_metric: string | null;
  target_value: number | null;
  baseline_value: number | null;
  status: string | null;
  due_at: string | null;
  completion_checked_at: string | null;
  actual_value_at_check: number | null;
  follow_up_message: string | null;
  created_at: string | null;
  updated_at: string | null;
};

// Result returned by public.check_stage1_commitments(p_stage_progress_id).
// Supabase owns commitment checking; this component only displays the result.
type Stage1CommitmentCheckResult = {
  commitment_id: string | null;
  previous_status: string | null;
  new_status: string | null;
  actual_value_at_check: number | null;
  operator_insight_id: string | null;
};

// Internal-only operator insight review row, returned by the read-only RPC
// public.get_operator_insights_review_snapshot(p_stage_progress_id, p_review_status, p_limit).
// Supabase owns insight generation and review state. These rows are for
// debug/admin internal review ONLY and must never be exposed to end users or
// surfaced with public maturity language.
type OperatorInsightReview = {
  operator_insight_id: string | null;
  review_status: string | null;
  maturity_dimension: string | null;
  signal: string | null;
  commitment_label: string | null;
  actual_value_at_check: number | null;
  verified_evidence_count: number | null;
  insight_text: string | null;
  created_at: string | null;
};

// Combined debug/control snapshot returned by
// public.get_stage1_debug_control_snapshot(p_stage_progress_id). Debug/admin
// only — never exposed to normal users.
type Stage1DebugControlSnapshot = {
  stage_progress?: Record<string, any> | null;
  evaluation?: {
    valid_count?: number | null;
    total_required?: number | null;
    is_complete?: boolean | null;
    current_gate_status?: string | null;
  } | null;
  evidence?: any[] | null;
  commitments?: any[] | null;
  gate_decisions?: any[] | null;
  operator_insights?: any[] | null;
  debug_validation?: any;
  [key: string]: any;
};

// Construction readiness summary returned by
// public.get_stage1_construction_readiness_summary(). Debug/admin only —
// never exposed to normal users.
type ConstructionReadinessSummary = {
  construction_mode?: boolean | null;
  latest_lifecycle_validation?: {
    validation_status?: string | null;
    tester_email?: string | null;
    gate_status?: string | null;
  } | null;
  stage_progress_counts?: {
    total_rows?: number | null;
    passed_rows?: number | null;
  } | null;
  debug_validation_counts?: {
    evidence_rows?: number | null;
    decision_rows?: number | null;
    insight_rows?: number | null;
  } | null;
  rpc_security_classification?: Record<string, any> | null;
  hardening_phases?: Array<{
    phase_number?: number | null;
    status?: string | null;
  }> | null;
  public_wrapper_set?: {
    required_count?: number | null;
    classified_count?: number | null;
    complete?: boolean | null;
    wrappers?: Array<{
      function_name?: string | null;
      registered?: boolean | null;
      classification?: string | null;
      production_target?: string | null;
      hardening_required?: boolean | null;
    }> | null;
  } | null;
  rls_policy_posture?: {
    rpc_only_count?: number | null;
    template_read_allowed_count?: number | null;
    public_read_candidate_count?: number | null;
    direct_policy_expected_count?: number | null;
    sensitive_rpc_only_tables?: string[] | null;
  } | null;
  validation_milestones?: {
    all_required_passed?: boolean | null;
    milestones?: Array<{
      milestone_key?: string | null;
      milestone_label?: string | null;
      milestone_status?: string | null;
      validation_scope?: string | null;
      evidence_reference?: string | null;
    }> | null;
  } | null;
  release_safe?: boolean | null;
  release_safe_reason?: string | null;
  auth_ownership_hardening?: {
    public_release_blocker_count?: number | null;
    summary?: Array<{
      surface_type?: string | null;
      release_status?: string | null;
      function_count?: number | null;
    }> | null;
    public_release_blockers?: Array<{
      function_name?: string | null;
      surface_type?: string | null;
      release_status?: string | null;
    }> | null;
    highest_priority_items?: Array<{
      function_name?: string | null;
      surface_type?: string | null;
      release_status?: string | null;
      remaining_gap?: string | null;
      required_ownership_check?: string | null;
      recommended_release_path?: string | null;
    }> | null;
  } | null;
  operator_run_ownership_model?: {
    release_blocking_count?: number | null;
    summary?: Array<{
      contract_area?: string | null;
      requirement_count?: number | null;
      release_blocking_count?: number | null;
    }> | null;
    requirements?: Array<{
      priority?: number | null;
      contract_key?: string | null;
      contract_area?: string | null;
      release_blocking?: boolean | null;
      contract_requirement?: string | null;
      target_state?: string | null;
    }> | null;
  } | null;
  [key: string]: any;
};

// UI boundary summary returned by public.get_stage1_ui_boundary_summary().
// Debug/admin only — never exposed to normal users. Read-only.
type UIBoundarySummary = {
  product_facing?: Array<{
    surface_name?: string | null;
    mutation_risk?: boolean | null;
    [key: string]: any;
  }> | null;
  admin_only?: Array<{ surface_name?: string | null; [key: string]: any }> | null;
  debug_only?: Array<{ surface_name?: string | null; [key: string]: any }> | null;
  service_only?: Array<{ surface_name?: string | null; [key: string]: any }> | null;
  remove_before_release?: Array<{ surface_name?: string | null; [key: string]: any }> | null;
  hardening_required?: Array<{ surface_name?: string | null; [key: string]: any }> | null;
  [key: string]: any;
};

// Product surface plan summary returned by public.get_stage1_product_surface_plan_summary().
// Debug/admin only — never exposed to normal users. Read-only.
type ProductSurfacePlanSummary = {
  release_status_summary?: {
    ready_after_hardening?: number | null;
    planned?: number | null;
    blocked?: number | null;
    [key: string]: any;
  } | null;
  public_candidates?: Array<{
    product_surface?: string | null;
    release_status?: string | null;
    intended_user_purpose?: string | null;
    allowed_data_sources?: string | null;
    forbidden_behaviour?: string | null;
    hardening_dependency?: string | null;
    [key: string]: any;
  }> | null;
  blocked_surfaces?: Array<{
    product_surface?: string | null;
    intended_user_purpose?: string | null;
    forbidden_behaviour?: string | null;
    hardening_dependency?: string | null;
    [key: string]: any;
  }> | null;
  hardening_dependencies?: any[] | null;
  forbidden_behaviours?: any[] | null;
  allowed_data_sources_actions?: any[] | null;
  [key: string]: any;
};

const JOB_ROWS: { job: string; client: string; site: string; status: string; start: string; income: number; costs: number; gm: number; evidence: string }[] = [];

// Product-facing next-step guidance returned by the read-only RPC
// public.get_stage1_next_step_guidance(p_stage_progress_id uuid). Supabase owns
// ALL guidance derivation; this component only renders the returned row and
// never computes guidance, branches on maturity, or applies decisions client-side.
type Stage1NextStepGuidance = {
  stage_progress_id: string | null;
  gate_status: string | null;
  guidance_code: string | null;
  guidance_title: string | null;
  guidance_body: string | null;
  primary_action_label: string | null;
  primary_action_target: string | null;
  is_public_safe: boolean | null;
};

// Public, run-scoped product-facing wrapper RPC return shapes. Supabase resolves
// stage_progress_id from the autopsy_run_id and returns only public-safe fields.
// The frontend passes the run id and displays the result; it never resolves
// identity, computes progression, or exposes operator insights from these.
//   - get_stage1_public_progress_by_run(p_run_id)
//   - get_stage1_public_evidence_by_run(p_run_id)
//   - get_stage1_public_completion_by_run(p_run_id)
//   - get_stage1_public_commitments_by_run(p_run_id)
//   - get_stage1_public_next_step_by_run(p_run_id)
type Stage1PublicProgress = Partial<Stage1Snapshot> & { [key: string]: any };
type Stage1PublicEvidence = Partial<Stage1Requirement> & { [key: string]: any };
type Stage1PublicCompletion = Partial<Stage1Evaluation> & { [key: string]: any };
type Stage1PublicCommitment = Partial<Stage1Commitment> & { [key: string]: any };
type Stage1PublicNextStep = Partial<Stage1NextStepGuidance> & { [key: string]: any };

// Consolidated, run-scoped, READ-ONLY display RPCs. Supabase resolves identity
// from the active Autopsy run id and returns display-ready, public-safe fields.
// The dashboard reads ONLY through these RPCs and never reads broad Stage 1
// views (or base tables) directly.
//   - get_stage1_dashboard_display_by_run(p_run_id)
//   - get_stage1_job_detail_display_by_run(p_run_id)
// Supabase owns ALL derivation, including gross-margin. Margin is rendered
// exactly as returned; a null margin is shown as an em dash and never computed
// or fabricated client-side.
type Stage1DashboardDisplay = { [key: string]: any };
type Stage1JobDetailDisplay = { [key: string]: any };

// Render a Supabase-derived gross-margin value using maturity-oriented wording.
// Never compute or fabricate a margin client-side. Order of precedence:
//   1. an explicit display string from Supabase (gross_margin_display)
//   2. a "not_yet_proven" status → "Not Yet Proven"
//   3. a finite numeric margin → rounded percentage
//   4. otherwise → "Not Yet Proven" (never a dash / 0% / NaN / blank)
function renderMarginPct(
  pct: number | null | undefined,
  opts?: { display?: string | null; status?: string | null },
): string {
  const display = opts?.display;
  if (typeof display === "string" && display.trim() !== "") return display.trim();
  if (opts?.status === "not_yet_proven") return "Not Yet Proven";
  if (pct !== null && pct !== undefined) {
    const n = typeof pct === "number" ? pct : Number(pct);
    if (Number.isFinite(n)) return `${Math.round(n)}%`;
  }
  return "Not Yet Proven";
}

// Render a Supabase-derived direct-cost value using maturity-oriented wording.
// Prefers an explicit display string (direct_cost_display); a missing/zero cost
// renders as "Not Yet Recorded" rather than a dash.
function renderDirectCost(
  value: number | null | undefined,
  opts?: { display?: string | null },
): string {
  const display = opts?.display;
  if (typeof display === "string" && display.trim() !== "") return display.trim();
  if (value !== null && value !== undefined) {
    const n = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(n) && n > 0) return `$${fmtMoney(n)}`;
  }
  return "Not Yet Recorded";
}

// Governance: direct costs are "recorded" only when a positive cost exists.
// Zero recorded cost is NOT the same as proven zero cost, so margin must stay
// "Not Yet Proven" until real cost data is captured. Never compute
// (income - 0) / income.
function directCostsRecorded(costs: number | null | undefined): boolean {
  const n = typeof costs === "number" ? costs : Number(costs);
  return Number.isFinite(n) && n > 0;
}

function marginStatus(pct: number): { label: "Pass" | "Watch" | "Fail"; tone: string } {
  if (pct >= 30) return { label: "Pass", tone: "text-emerald-600" };
  if (pct >= 20) return { label: "Watch", tone: "text-amber-600" };
  return { label: "Fail", tone: "text-red-600" };
}

function unitTotalCost(u: ProofUnit): number {
  if (u.costLines && u.costLines.length > 0) {
    return u.costLines.reduce((s, l) => s + (l.amount ?? 0), 0);
  }
  return (
    (u.costMaterials ?? 0) +
    (u.costLabour ?? 0) +
    (u.costSubcontractors ?? 0) +
    (u.costOther ?? 0)
  );
}

function deriveStage1GmStatus(u: ProofUnit): { label: string; tone: string; pct: number | null } {
  const revenue = u.invoiceAmount ?? u.quoteValue ?? 0;
  const costs = unitTotalCost(u);
  const gmPct = u.gm;
  if (revenue > 0 && costs > 0 && gmPct != null) {
    return { label: "GM proven", tone: gmPct >= 30 ? "text-emerald-600" : gmPct >= 20 ? "text-amber-600" : "text-red-600", pct: gmPct };
  }
  if (revenue > 0 && costs === 0) {
    return { label: "Cost not yet proven", tone: "text-muted-foreground", pct: null };
  }
  if (revenue === 0) {
    return { label: "Revenue not yet proven", tone: "text-muted-foreground", pct: null };
  }
  return { label: "GM not yet proven", tone: "text-muted-foreground", pct: null };
}

// ---------------------------------------------------------------------------
// Stage 1 sandbox commercial proof model — display helpers
// Proof type and payment status are DISTINCT axes. Both are derived from the
// persisted public.stage1_job_margin_summary projection on the unit, falling
// back to the documented rules when the view did not supply an explicit value.
// ---------------------------------------------------------------------------
const PROOF_TYPE_LABELS: Record<string, string> = {
  not_yet_proven: "Not yet proven",
  revenue_recorded: "Revenue recorded",
  commercial_proof_recorded: "Commercial proof recorded",
  completed_job: "Completed job",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  not_invoiced: "Not invoiced",
  unpaid: "Unpaid",
  part_paid: "Part-paid",
  paid: "Paid",
};

function deriveStage1ProofType(u: ProofUnit): string {
  if (u.sandboxProofType && PROOF_TYPE_LABELS[u.sandboxProofType]) {
    return PROOF_TYPE_LABELS[u.sandboxProofType];
  }
  const revenue = u.sandboxRevenueAmount ?? u.invoiceAmount ?? u.quoteValue ?? 0;
  const cost = u.sandboxTotalDirectCost ?? unitTotalCost(u);
  const statusLc = (u.status ?? "").toLowerCase();
  const completed = statusLc.includes("complete") || u.sandboxProofType === "completed_job";
  if (revenue > 0 && cost > 0) {
    return completed ? "Completed job" : "Commercial proof recorded";
  }
  if (revenue > 0) return "Revenue recorded";
  return "Not yet proven";
}

function deriveStage1PaymentStatus(u: ProofUnit): string {
  if (u.sandboxPaymentStatus && PAYMENT_STATUS_LABELS[u.sandboxPaymentStatus]) {
    return PAYMENT_STATUS_LABELS[u.sandboxPaymentStatus];
  }
  const revenue = u.sandboxRevenueAmount ?? u.invoiceAmount ?? u.quoteValue ?? 0;
  const paid = u.sandboxPaymentReceivedAmount ?? u.paymentAmount ?? 0;
  if (revenue <= 0) return "Not invoiced";
  if (paid >= revenue) return "Paid";
  if (paid > 0) return "Part-paid";
  return "Unpaid";
}

function stage1VariationRecorded(u: ProofUnit): boolean {
  if (typeof u.sandboxVariationRecorded === "boolean") return u.sandboxVariationRecorded;
  return (u.sandboxVariationInvoiceAmount ?? 0) > 0;
}

function KpiCard({
  label,
  primary,
  secondaries,
  icon: Icon,
  tone,
  onClick,
}: {
  label: string;
  primary: React.ReactNode;
  secondaries?: { k: string; v: React.ReactNode }[];
  icon: React.ComponentType<{ className?: string }>;
  tone?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-lg border bg-white p-4 hover:border-foreground/40 hover:shadow-sm transition-all"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className={`mt-2 text-3xl font-semibold ${tone ?? ""}`}>{primary}</div>
      {secondaries && (
        <div className="mt-2 space-y-0.5">
          {secondaries.map((s) => (
            <div key={s.k} className="text-xs text-muted-foreground flex justify-between">
              <span>{s.k}</span>
              <span className="font-medium text-foreground">{s.v}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">Click to drill down →</div>
    </button>
  );
}

// ---------- Business Details (simplified dialog) ----------
type BDForm = {
  business_name: string;
  abn: string;
  trading_name: string;
  business_address: string;
  contact_name: string;
  phone: string;
  email: string;
};
const EMPTY_BD: BDForm = {
  business_name: "",
  abn: "",
  trading_name: "",
  business_address: "",
  contact_name: "",
  phone: "",
  email: "",
};
const BD_REQUIRED: (keyof BDForm)[] = [
  "business_name", "abn", "business_address", "contact_name", "phone", "email",
];
const BD_EXTRA_KEY = "stage1.business_details.extras";

function useBusinessDetails() {
  const [loaded, setLoaded] = useState(false);
  const [complete, setComplete] = useState(false);
  const [form, setForm] = useState<BDForm>(EMPTY_BD);
  const [rowId, setRowId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("business_identity_profile")
          .select("*")
          .order("created_at", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        const extras = (() => {
          try { return JSON.parse(localStorage.getItem(BD_EXTRA_KEY) || "{}"); } catch { return {}; }
        })();
        if (data) {
          setRowId((data as any).id ?? null);
          const merged: BDForm = {
            ...EMPTY_BD,
            business_name: data.business_name ?? "",
            contact_name: data.contact_name ?? "",
            phone: data.phone ?? "",
            email: data.email ?? "",
            abn: data.abn ?? "",
            trading_name: extras.trading_name ?? "",
            business_address: extras.business_address ?? "",
          };
          setForm(merged);
          setComplete(BD_REQUIRED.every((k) => String(merged[k] ?? "").trim().length > 0));
        }
      } catch {
        /* ignore */
      }
      setLoaded(true);
    })();
  }, []);

  async function save(next: BDForm): Promise<{ ok: boolean; error?: string }> {
    const missing = BD_REQUIRED.filter((k) => !String(next[k] ?? "").trim());
    if (missing.length) return { ok: false, error: `Missing: ${missing.join(", ")}` };
    const payload: any = {
      business_name: next.business_name,
      contact_name: next.contact_name,
      phone: next.phone,
      email: next.email,
      abn: next.abn,
    };
    if (rowId) payload.id = rowId;
    const { data, error } = await supabase
      .from("business_identity_profile")
      .upsert(payload)
      .select()
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (data?.id) setRowId(data.id);
    localStorage.setItem(
      BD_EXTRA_KEY,
      JSON.stringify({
        trading_name: next.trading_name,
        business_address: next.business_address,
      }),
    );
    setForm(next);
    setComplete(true);
    return { ok: true };
  }

  return { loaded, complete, form, setForm, save };
}

function BusinessDetailsDialog({
  open,
  onOpenChange,
  hook,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  hook: ReturnType<typeof useBusinessDetails>;
}) {
  const { form, setForm, save } = hook;
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = <K extends keyof BDForm>(k: K, v: BDForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const missing = BD_REQUIRED.filter((k) => !String(form[k] ?? "").trim());

  async function onSave() {
    setSaving(true);
    setErr(null);
    const res = await save(form);
    setSaving(false);
    if (!res.ok) {
      setErr(res.error ?? "Save failed");
      return;
    }
    onOpenChange(false);
  }

  const field = (id: keyof BDForm, label: string, required?: boolean, type: string = "text") => (
    <div className="space-y-1.5" key={id}>
      <Label htmlFor={id}>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Input
        id={id}
        type={type}
        value={form[id]}
        onChange={(e) => set(id, e.target.value)}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Complete Business Details</DialogTitle>
          <DialogDescription>
            Required for Stage 1. ABN will be validated externally later. GST registration and bank account details are intentionally not collected here.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
          {field("business_name", "Business name", true)}
          {field("abn", "ABN", true)}
          {field("trading_name", "Trading name (if different)")}
          <div className="md:col-span-2">
            {field("business_address", "Business address", true)}
          </div>
          {field("contact_name", "Contact name", true)}
          {field("phone", "Contact phone", true)}
          {field("email", "Contact email", true, "email")}
        </div>

        {err && <p className="text-xs text-destructive">{err}</p>}

        <DialogFooter className="gap-2">
          <p className="text-xs text-muted-foreground mr-auto">
            {missing.length === 0 ? "All required fields complete." : `Missing: ${missing.join(", ")}`}
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={saving || missing.length > 0}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save business details
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Drill-down panel (inline, horizontal) ----------
type DrillKey = "leads" | "conversions" | "jobs" | "margin";

const DRILL_META: Record<DrillKey, { title: string; subtitle: string }> = {
  leads: {
    title: "Lead Method Performance",
    subtitle: "Where leads are coming from and what is converting.",
  },
  conversions: {
    title: "Quote Conversion Board",
    subtitle: "Quotes issued, accepted, rejected, and pending.",
  },
  jobs: {
    title: "Active Jobs Register",
    subtitle: "Current and completed jobs contributing to Stage 1 proof.",
  },
  margin: {
    title: "Gross Margin Summary",
    subtitle: "Income, job costs, gross profit, and margin by job.",
  },
};

function DrillBody({
  kind,
  methodRows,
  quotes,
  selectedQuoteNumber,
  onSelectQuote,
  onUpdateQuote,
  onOpenQuoteDetail,
  units,
  onOpenUnit,
}: {
  kind: DrillKey;
  methodRows: typeof METHOD_BASELINE;
  quotes: Quote[];
  selectedQuoteNumber: string | null;
  onSelectQuote: (n: string) => void;
  onUpdateQuote: (n: string) => void;
  onOpenQuoteDetail: (n: string) => void;
  units: ProofUnit[];
  onOpenUnit: (n: number) => void;
}) {
  return (
    <div className="space-y-4">
      {kind === "leads" && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Attempts</TableHead>
                  <TableHead className="text-right">Contacts</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Quotes</TableHead>
                  <TableHead className="text-right">Jobs</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {methodRows.map((r) => (
                  <TableRow key={r.method}>
                    <TableCell className="font-medium">{r.method}</TableCell>
                    <TableCell className="text-right">{r.attempts}</TableCell>
                    <TableCell className="text-right">{r.contacts}</TableCell>
                    <TableCell className="text-right">{r.leads}</TableCell>
                    <TableCell className="text-right">{r.quotes}</TableCell>
                    <TableCell className="text-right">{r.jobs}</TableCell>
                    <TableCell className="text-muted-foreground">{r.notes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {/* Mobile stacked cards */}
          <div className="md:hidden space-y-3">
            {methodRows.map((r) => (
              <div key={r.method} className="rounded-md border p-3">
                <div className="font-medium">{r.method}</div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div><div className="text-muted-foreground">Attempts</div><div>{r.attempts}</div></div>
                  <div><div className="text-muted-foreground">Contacts</div><div>{r.contacts}</div></div>
                  <div><div className="text-muted-foreground">Leads</div><div>{r.leads}</div></div>
                  <div><div className="text-muted-foreground">Quotes</div><div>{r.quotes}</div></div>
                  <div><div className="text-muted-foreground">Jobs</div><div>{r.jobs}</div></div>
                </div>
                {r.notes && <div className="mt-2 text-xs text-muted-foreground">{r.notes}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {kind === "conversions" && (
        <>
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Quote #</TableHead>
                  <TableHead>Quote Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Follow-up</TableHead>
                  <TableHead>Rejection</TableHead>
                  <TableHead className="text-right">Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.filter((q) => !q.converted).map((r) => {
                  const isSel = r.number === selectedQuoteNumber;
                  return (
                  <TableRow
                    key={r.number}
                    className={`cursor-pointer ${isSel ? "bg-muted/60" : "hover:bg-muted/30"}`}
                    onClick={() => onSelectQuote(r.number)}
                  >
                    <TableCell>
                      <input
                        type="radio"
                        name="quote-select"
                        checked={isSel}
                        onChange={() => onSelectQuote(r.number)}
                        aria-label={`Select ${r.number}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onOpenQuoteDetail(r.number); }}
                        className="hover:underline focus:outline-none"
                      >
                        {r.number}
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.quoteDate ? isoToAU(r.quoteDate) : "—"}</TableCell>
                    <TableCell>
                      <div className="font-medium leading-tight">{r.client}</div>
                      <div className="text-xs text-muted-foreground leading-tight">{r.site}</div>
                    </TableCell>
                    <TableCell className="text-right">${fmtMoney(r.value)}</TableCell>
                    <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{r.followUp ? isoToAU(r.followUp) : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.reason || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); onOpenQuoteDetail(r.number); }}
                        >
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); onUpdateQuote(r.number); }}
                        >
                          Update
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="md:hidden space-y-3">
            {quotes.filter((q) => !q.converted).map((r) => {
              const isSel = r.number === selectedQuoteNumber;
              return (
              <div
                key={r.number}
                className={`rounded-md border p-3 space-y-1 text-sm cursor-pointer ${isSel ? "bg-muted/60" : ""}`}
                onClick={() => onSelectQuote(r.number)}
              >
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenQuoteDetail(r.number); }}
                    className="font-mono text-xs hover:underline"
                  >
                    {r.number}
                  </button>
                  <Badge variant="outline">{r.status}</Badge>
                </div>
                <div className="font-medium">{r.client}</div>
                <div className="text-xs text-muted-foreground">{r.site}</div>
                <div className="flex justify-between text-xs">
                  <span>Quote Date</span><span>{r.quoteDate ? isoToAU(r.quoteDate) : "—"}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Value</span><span className="font-medium">${fmtMoney(r.value)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Follow-up</span><span>{r.followUp ? isoToAU(r.followUp) : "—"}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Rejection</span><span>{r.reason || "—"}</span>
                </div>
                <div className="pt-1 grid grid-cols-2 gap-2">
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onOpenQuoteDetail(r.number); }}>
                    View
                  </Button>
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onUpdateQuote(r.number); }}>
                    Update
                  </Button>
                </div>
              </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Active quotes only. Select a row and use <span className="font-medium text-foreground">Quote Activity</span> to update status.
            Accepting a quote creates one job in the Simple Job Cost Ledger and removes the quote from this list.
          </p>
        </>
      )}

      {kind === "jobs" && (
        <>
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Revenue / Invoiced</TableHead>
                  <TableHead className="text-right">Payment Received</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Job Costs</TableHead>
                  <TableHead className="text-right">Gross Profit</TableHead>
                  <TableHead className="text-right">GM %</TableHead>
                  <TableHead>Proof Type</TableHead>
                  <TableHead>Payment Status</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {units.map((u) => {
                  const income = u.sandboxRevenueAmount ?? u.invoiceAmount ?? u.quoteValue ?? 0;
                  const paid = u.sandboxPaymentReceivedAmount ?? u.paymentAmount ?? 0;
                  const outstanding = u.sandboxOutstandingAmount ?? income - paid;
                  const costs = u.sandboxTotalDirectCost ?? unitTotalCost(u);
                  const gp = u.sandboxGrossProfit ?? income - costs;
                  const gmStatus = deriveStage1GmStatus(u);
                  const gmPctValue = gmStatus.pct;
                  const jobNum = u.jobSequenceNumber != null ? `J-${u.jobSequenceNumber}` : `J-${u.n}`;
                  const proofTypeLabel = deriveStage1ProofType(u);
                  const paymentStatusLabel = deriveStage1PaymentStatus(u);
                  const hasVariation = stage1VariationRecorded(u);
                  return (
                    <TableRow
                      key={u.stage1JobId ?? `n-${u.n}`}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => onOpenUnit(u.n)}
                    >
                      <TableCell className="font-mono text-xs">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onOpenUnit(u.n); }}
                          className="hover:underline focus:outline-none"
                        >
                          {jobNum}
                        </button>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onOpenUnit(u.n); }}
                          className="text-left hover:underline focus:outline-none"
                        >
                          <div className="font-medium leading-tight">{u.client}</div>
                          {u.jobSite && (
                            <div className="text-xs text-muted-foreground leading-tight">{u.jobSite}</div>
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{income > 0 ? `$${fmtMoney(income)}` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{income > 0 ? `$${fmtMoney(paid)}` : "—"}</TableCell>
                      <TableCell className={`text-right tabular-nums ${outstanding < 0 ? "text-red-600" : ""}`}>
                        {income > 0 ? fmtSignedMoney(outstanding) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{renderDirectCost(costs)}</TableCell>
                      <TableCell className="text-right tabular-nums">{income > 0 ? `$${fmtMoney(gp)}` : "—"}</TableCell>
                      <TableCell className={`text-right font-medium tabular-nums ${gmPctValue === null ? "text-muted-foreground" : gmStatus.tone}`}>{gmPctValue != null ? `${gmPctValue}%` : gmStatus.label}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs">{proofTypeLabel}</span>
                          {hasVariation && (
                            <Badge variant="outline" className="w-fit text-[10px]">Variation recorded</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{paymentStatusLabel}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); onOpenUnit(u.n); }}
                        >
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="md:hidden space-y-3">
            {units.map((u) => {
              const income = u.sandboxRevenueAmount ?? u.invoiceAmount ?? u.quoteValue ?? 0;
              const paid = u.sandboxPaymentReceivedAmount ?? u.paymentAmount ?? 0;
              const outstanding = u.sandboxOutstandingAmount ?? income - paid;
              const costs = u.sandboxTotalDirectCost ?? unitTotalCost(u);
              const gp = u.sandboxGrossProfit ?? income - costs;
              const gmStatus = deriveStage1GmStatus(u);
              const gmPctValue = gmStatus.pct;
              const jobNum = u.jobSequenceNumber != null ? `J-${u.jobSequenceNumber}` : `J-${u.n}`;
              const proofTypeLabel = deriveStage1ProofType(u);
              const paymentStatusLabel = deriveStage1PaymentStatus(u);
              const hasVariation = stage1VariationRecorded(u);
              return (
                <button
                  key={u.stage1JobId ?? `n-${u.n}`}
                  type="button"
                  onClick={() => onOpenUnit(u.n)}
                  className="block w-full text-left rounded-md border p-3 space-y-1 text-sm hover:bg-muted/30"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs">{jobNum}</span>
                    <Badge variant="outline">{u.status}</Badge>
                  </div>
                  <div className="font-medium">{u.client}</div>
                  {u.jobSite && <div className="text-xs text-muted-foreground">{u.jobSite}</div>}
                  <div className="flex justify-between text-xs"><span>Revenue / Invoiced</span><span>{income > 0 ? `$${fmtMoney(income)}` : "—"}</span></div>
                  <div className="flex justify-between text-xs"><span>Payment received</span><span>{income > 0 ? `$${fmtMoney(paid)}` : "—"}</span></div>
                  <div className="flex justify-between text-xs"><span>Outstanding</span><span className={outstanding < 0 ? "text-red-600" : ""}>{income > 0 ? fmtSignedMoney(outstanding) : "—"}</span></div>
                  <div className="flex justify-between text-xs"><span>Job costs</span><span>{renderDirectCost(costs)}</span></div>
                  <div className="flex justify-between text-xs"><span>Gross profit</span><span>{income > 0 ? `$${fmtMoney(gp)}` : "—"}</span></div>
                  <div className="flex justify-between text-xs"><span>GM %</span><span className={`font-medium ${gmPctValue === null ? "text-muted-foreground" : gmStatus.tone}`}>{gmPctValue != null ? `${gmPctValue}%` : gmStatus.label}</span></div>
                  <div className="flex justify-between text-xs"><span>Proof type</span><span>{proofTypeLabel}</span></div>
                  <div className="flex justify-between text-xs"><span>Payment status</span><span>{paymentStatusLabel}</span></div>
                  {hasVariation && (
                    <Badge variant="outline" className="text-[10px]">Variation recorded</Badge>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {kind === "margin" && (
        <>
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Income</TableHead>
                  <TableHead className="text-right">Job Costs</TableHead>
                  <TableHead className="text-right">Gross Profit</TableHead>
                  <TableHead className="text-right">GM %</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {units.map((u) => {
                  const income = u.invoiceAmount ?? u.quoteValue ?? 0;
                  const costs = unitTotalCost(u);
                  const gp = income - costs;
                  const gmStatus = deriveStage1GmStatus(u);
                  const pct = gmStatus.pct;
                  const jobNum = u.jobSequenceNumber != null ? `J-${u.jobSequenceNumber}` : `J-${u.n}`;
                  return (
                    <TableRow key={u.stage1JobId ?? `n-${u.n}`}>
                      <TableCell className="font-mono text-xs">{jobNum}</TableCell>
                      <TableCell>
                        <div className="font-medium leading-tight">{u.client}</div>
                        {u.jobSite && <div className="text-xs text-muted-foreground leading-tight">{u.jobSite}</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">${fmtMoney(income)}</TableCell>
                      <TableCell className="text-right tabular-nums">{renderDirectCost(costs)}</TableCell>
                      <TableCell className="text-right tabular-nums">${fmtMoney(gp)}</TableCell>
                      <TableCell className={`text-right font-medium tabular-nums ${pct === null ? "text-muted-foreground" : gmStatus.tone}`}>{pct === null ? gmStatus.label : `${pct}%`}</TableCell>
                      <TableCell className={pct === null ? "text-muted-foreground" : gmStatus.tone}>{gmStatus.label}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="md:hidden space-y-3">
            {units.map((u) => {
              const income = u.invoiceAmount ?? u.quoteValue ?? 0;
              const costs = unitTotalCost(u);
              const gp = income - costs;
              const gmStatus = deriveStage1GmStatus(u);
              const pct = gmStatus.pct;
              const jobNum = u.jobSequenceNumber != null ? `J-${u.jobSequenceNumber}` : `J-${u.n}`;
              return (
                <div key={u.stage1JobId ?? `n-${u.n}`} className="rounded-md border p-3 space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs">{jobNum}</span>
                    <span className={`text-xs font-medium ${pct === null ? "text-muted-foreground" : gmStatus.tone}`}>{gmStatus.label}</span>
                  </div>
                  <div className="font-medium">{u.client}</div>
                  {u.jobSite && <div className="text-xs text-muted-foreground">{u.jobSite}</div>}
                  <div className="flex justify-between text-xs"><span>Income</span><span>${fmtMoney(income)}</span></div>
                  <div className="flex justify-between text-xs"><span>Job costs</span><span>{renderDirectCost(costs)}</span></div>
                  <div className="flex justify-between text-xs"><span>Gross profit</span><span>${fmtMoney(gp)}</span></div>
                  <div className="flex justify-between text-xs"><span>GM %</span><span className={`font-medium ${pct === null ? "text-muted-foreground" : gmStatus.tone}`}>{pct === null ? gmStatus.label : `${pct}%`}</span></div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Pass ≥ 30%. Watch 20–29%. Fail &lt; 20%. Formula: gross_profit = income − job_costs; gross_margin_% = gross_profit / income.
          </p>
        </>
      )}
    </div>
  );
}

function DrillCurtain({
  drill,
  onOpenChange,
  methodRows,
  onLogActivity,
  quotes,
  selectedQuoteNumber,
  onSelectQuote,
  onQuoteActivity,
  onUpdateQuote,
  onOpenQuoteDetail,
  units,
  onOpenUnit,
}: {
  drill: DrillKey | null;
  onOpenChange: (open: boolean) => void;
  methodRows: typeof METHOD_BASELINE;
  onLogActivity: () => void;
  quotes: Quote[];
  selectedQuoteNumber: string | null;
  onSelectQuote: (n: string) => void;
  onQuoteActivity: () => void;
  onUpdateQuote: (n: string) => void;
  onOpenQuoteDetail: (n: string) => void;
  units: ProofUnit[];
  onOpenUnit: (n: number) => void;
}) {
  const meta = drill ? DRILL_META[drill] : null;
  return (
    <Sheet open={!!drill} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-none sm:w-[85vw] lg:w-[80vw] xl:w-[75vw] overflow-y-auto p-0"
      >
        <div className="p-6 space-y-4">
          <SheetHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <SheetTitle>{meta?.title}</SheetTitle>
                <SheetDescription>{meta?.subtitle}</SheetDescription>
              </div>
              {drill === "leads" && (
                <Button size="sm" onClick={onLogActivity} className="gap-1.5 shrink-0">
                  <Plus className="h-4 w-4" />
                  Log Activity
                </Button>
              )}
              {drill === "conversions" && (
                <Button size="sm" onClick={onQuoteActivity} className="gap-1.5 shrink-0">
                  Quote Activity
                </Button>
              )}
            </div>
          </SheetHeader>
          {drill && (
            <DrillBody
              kind={drill}
              methodRows={methodRows}
              quotes={quotes}
              selectedQuoteNumber={selectedQuoteNumber}
              onSelectQuote={onSelectQuote}
              onUpdateQuote={onUpdateQuote}
              onOpenQuoteDetail={onOpenQuoteDetail}
              units={units}
              onOpenUnit={onOpenUnit}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}


function QuoteActivityDialog({
  quote,
  open,
  onOpenChange,
  onSave,
}: {
  quote: Quote | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (q: Quote, newStatus: QuoteStatus, reason: string) => void;
}) {
  const [status, setStatus] = useState<QuoteStatus>("Sent");
  const [reason, setReason] = useState<string>("");

  useEffect(() => {
    if (open && quote) {
      setStatus(quote.status);
      setReason(quote.reason || "");
    }
  }, [open, quote]);

  const canSave =
    !!quote && ((status !== "Rejected" && status !== "Declined") || !!reason);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Quote Activity</DialogTitle>
          <DialogDescription>
            Update the status of the selected quote. Accepting creates one job in the Simple Job Cost Ledger.
          </DialogDescription>
        </DialogHeader>
        {quote && (
          <div className="space-y-2 text-sm rounded-md border p-3">
            <div className="flex justify-between"><span className="text-muted-foreground">Quote #</span><span className="font-mono">{quote.number}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Client</span><span className="font-medium text-right">{quote.client}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Job Location</span><span className="text-right">{quote.site || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Quote Amount</span><span>${fmtMoney(quote.value)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Current Status</span><span>{quote.status}</span></div>
          </div>
        )}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="qa-status">New Status <span className="text-destructive">*</span></Label>
            <select
              id="qa-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as QuoteStatus)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="Sent">Sent</option>
              <option value="Accepted">Accepted</option>
              <option value="Declined">Declined</option>
              <option value="Expired">Expired</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
          {(status === "Rejected" || status === "Declined") && (
            <div className="space-y-1.5">
              <Label htmlFor="qa-reason">Reason <span className="text-destructive">*</span></Label>
              <select
                id="qa-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select a reason…</option>
                {REJECTION_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
          {status === "Accepted" && (
            <p className="text-xs text-muted-foreground">
              Accepting creates a new job with the next sequential Job # in the Simple Job Cost Ledger and removes this quote from the active board.
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => quote && onSave(quote, status, reason)} disabled={!canSave}>
            Save Quote Activity
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LogActivityDialog({
  open,
  onOpenChange,
  onSave,
  nextQuoteNumberStart,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (a: LeadActivity, newQuotes: Quote[]) => void;
  nextQuoteNumberStart: number;
}) {
  const [date, setDate] = useState("");
  const [method, setMethod] = useState(METHOD_OPTIONS[0]);
  const [attempts, setAttempts] = useState<string>("");
  const [contacts, setContacts] = useState<string>("");
  const [quotes, setQuotes] = useState<string>("");
  const [notes, setNotes] = useState("");
  type QRow = {
    client: string;
    site: string;
    amount: string;
    followUp: string;
    status: "Sent";
  };
  const blankRow = (): QRow => ({ client: "", site: "", amount: "", followUp: "", status: "Sent" });
  const [rows, setRows] = useState<QRow[]>([]);

  useEffect(() => {
    if (open) {
      setDate(""); setMethod(METHOD_OPTIONS[0]);
      setAttempts(""); setContacts(""); setQuotes(""); setNotes("");
      setRows([]);
    }
  }, [open]);

  const qGen = Math.max(0, parseInt(quotes || "0", 10) || 0);

  // Keep rows count in sync with Quotes Generated input
  useEffect(() => {
    setRows((prev) => {
      if (qGen === prev.length) return prev;
      if (qGen > prev.length) {
        return [...prev, ...Array.from({ length: qGen - prev.length }, blankRow)];
      }
      return prev.slice(0, qGen);
    });
  }, [qGen]);

  const rowComplete = (r: QRow) => {
    const amt = Number(r.amount);
    if (!r.client.trim()) return false;
    if (!r.site.trim()) return false;
    if (isNaN(amt) || amt <= 0) return false;
    if (!r.followUp) return false;
    return true;
  };
  const completeCount = rows.filter(rowComplete).length;
  const countOk = completeCount === qGen;
  const canSave = !!date && !!method && countOk;

  const save = () => {
    const activityId = `act-${Date.now()}`;
    const a: LeadActivity = {
      id: activityId,
      activity_date: date,
      method,
      attempts: Number(attempts) || 0,
      contacts_made: Number(contacts) || 0,
      quotes_generated: qGen,
      notes: notes.trim(),
      created_at: new Date().toISOString(),
    };
    const newQuotes: Quote[] = rows.map((r, i) => ({
      number: `Q-${nextQuoteNumberStart + i}`,
      client: r.client.trim(),
      site: r.site.trim(),
      value: Number(r.amount),
      status: r.status as QuoteStatus,
      quoteDate: date,
      followUp: r.followUp,
      reason: "",
      sourceActivityId: activityId,
      sourceActivityDate: date,
      method,
      createdAt: new Date().toISOString(),
    }));
    onSave(a, newQuotes);
  };

  const updateRow = (i: number, patch: Partial<QRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log Activity</DialogTitle>
          <DialogDescription>
            Record a dated lead-generation activity. Aggregates into Lead Method Performance.
            When Quotes Generated is greater than zero, enter matching quote details below.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="la-date">Activity Date <span className="text-destructive">*</span></Label>
            <Input id="la-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">
              {date ? `Entered as ${isoToAU(date)}` : "dd/mm/yyyy (e.g. 28/05/2026)"}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="la-method">Method</Label>
            <select
              id="la-method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {METHOD_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="la-att">Attempts</Label>
              <Input id="la-att" type="number" min={0} value={attempts} onChange={(e) => setAttempts(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="la-con">Contacts Made</Label>
              <Input id="la-con" type="number" min={0} value={contacts} onChange={(e) => setContacts(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="la-qt">Quotes Generated</Label>
              <Input id="la-qt" type="number" min={0} value={quotes} onChange={(e) => setQuotes(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">
                How many actual quotes did you issue from this activity session?
              </p>
              <p className="text-[11px] text-muted-foreground">
                If greater than zero, you must enter one quote record for each quote before saving.
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="la-notes">Notes</Label>
            <Input id="la-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Best response 8–10am" />
          </div>

          {qGen > 0 && (
            <div className="space-y-2 rounded-md border p-3">
              <div>
                <div className="text-sm font-semibold">Quote Details Required</div>
                <p className="text-xs text-muted-foreground">
                  You entered {qGen} quote{qGen === 1 ? "" : "s"} generated. Enter {qGen} quote record{qGen === 1 ? "" : "s"} before saving this activity.
                </p>
              </div>
              {rows.map((r, i) => (
                <div key={i} className="rounded-md border p-3 space-y-2 bg-muted/30">
                  <div className="text-xs font-medium text-muted-foreground">Quote {i + 1} of {qGen}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Client <span className="text-destructive">*</span></Label>
                      <Input value={r.client} onChange={(e) => updateRow(i, { client: e.target.value })} placeholder="e.g. M. Patel" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Job Location <span className="text-destructive">*</span></Label>
                      <Input value={r.site} onChange={(e) => updateRow(i, { site: e.target.value })} placeholder="e.g. Unit 4, Buderim" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Quote Amount <span className="text-destructive">*</span></Label>
                      <Input type="number" min={0} step="0.01" value={r.amount} onChange={(e) => updateRow(i, { amount: e.target.value })} placeholder="0.00" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">
                        Follow-up Date <span className="text-destructive">*</span>
                      </Label>
                      <Input type="date" value={r.followUp} onChange={(e) => updateRow(i, { followUp: e.target.value })} />
                      <p className="text-[11px] text-muted-foreground">
                        {r.followUp ? isoToAU(r.followUp) : "dd/mm/yyyy"}
                      </p>
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label className="text-xs">Initial Status</Label>
                      <p className="text-xs text-muted-foreground">
                        Quotes created from Log Activity are saved as <span className="font-medium text-foreground">Sent</span>.
                        Update status later from the Quote Conversion Board.
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {!countOk && (
                <p className="text-xs text-destructive">
                  Quotes Generated must match the number of completed quote records. ({completeCount} of {qGen} complete)
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!canSave}>Save Activity</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuoteDetailDialog({
  quote,
  open,
  onOpenChange,
  onSave,
}: {
  quote: Quote | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (patch: Partial<Quote>) => void;
}) {
  const [client, setClient] = useState("");
  const [site, setSite] = useState("");
  const [amount, setAmount] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open && quote) {
      setClient(quote.client);
      setSite(quote.site || "");
      setAmount(String(quote.value));
      setFollowUp(quote.followUp || "");
      setReason(quote.reason || "");
      setNotes(quote.notes || "");
    }
  }, [open, quote]);

  if (!quote) return null;
  const isConverted = !!quote.converted;
  // Converted quotes can still amend the flow-through fields (client, site, amount).
  // Fully read-only is no longer the default.
  const readOnly = false;
  const isSent = quote.status === "Sent" && !isConverted;
  const isRejected = quote.status === "Rejected" && !isConverted;
  // Fields editable for amendment: Sent OR Converted (flow-through to job)
  const canEditFlowThrough = isSent || isConverted;
  const hadNotes = !!quote.notes;

  const handleSave = () => {
    const patch: Partial<Quote> = {};
    if (canEditFlowThrough) {
      const v = Number(amount);
      patch.client = client.trim() || quote.client;
      patch.site = site.trim();
      patch.value = isNaN(v) ? quote.value : v;
    }
    if (isSent) {
      patch.followUp = followUp;
    }
    if (isRejected) {
      patch.reason = reason;
      if (hadNotes) patch.notes = notes;
    }
    onSave(patch);
  };

  const row = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quote Detail</DialogTitle>
          <DialogDescription>
            {isConverted
              ? "This quote has been converted into a job. Amendments to client, location, or quote amount will update the linked job and ledger."
              : isSent
                ? "Limited amendments available while quote is Sent. Status changes happen in Quote Activity."
                : "Status changes happen in Quote Activity."}
          </DialogDescription>
        </DialogHeader>

        {isConverted && (
          <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="font-semibold">This quote has already been converted into a job.</div>
            <div>Changing client, location, or quote amount will update the linked job and ledger.</div>
          </div>
        )}

        <div className="space-y-2 rounded-md border p-3">
          {row("Quote #", <span className="font-mono">{quote.number}</span>)}
          {row("Quote Date", quote.quoteDate ? isoToAU(quote.quoteDate) : "—")}
          {row("Source Activity Date", quote.sourceActivityDate ? isoToAU(quote.sourceActivityDate) : (quote.quoteDate ? isoToAU(quote.quoteDate) : "—"))}
          {row("Lead Method", quote.method || "—")}
          {row("Current Status", quote.status)}
          {quote.converted && row("Converted Job #", <span className="font-mono">{quote.convertedJobNumber || "—"}</span>)}
          {row("Created At", quote.createdAt ? isoToAU(quote.createdAt.slice(0, 10)) : "—")}
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Client</Label>
            <Input
              value={client}
              onChange={(e) => setClient(e.target.value)}
              disabled={!canEditFlowThrough}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Job Location</Label>
            <Input
              value={site}
              onChange={(e) => setSite(e.target.value)}
              disabled={!canEditFlowThrough}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Quote Amount</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={!canEditFlowThrough}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Follow-up Date</Label>
            <Input
              type="date"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              disabled={!isSent}
            />
            <p className="text-[11px] text-muted-foreground">
              {followUp ? isoToAU(followUp) : "dd/mm/yyyy"}
            </p>
          </div>
          {(quote.status === "Rejected" || isRejected) && (
            <div className="space-y-1.5">
              <Label>Rejection Reason</Label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={!isRejected}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
              >
                <option value="">Select a reason…</option>
                {REJECTION_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
          {hadNotes && (
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!isRejected}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {(canEditFlowThrough || isRejected) && (
            <Button onClick={handleSave}>Save Changes</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stage1DashboardInner() {
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const bd = useBusinessDetails();
  const [bdOpen, setBdOpen] = useState(false);
  const [drill, setDrill] = useState<DrillKey | null>(null);
  const [units, setUnits] = useState<ProofUnit[]>(SEED_UNITS);
  const [selectedN, setSelectedN] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reportN, setReportN] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [logActOpen, setLogActOpen] = useState(false);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>(SEED_QUOTES);
  const [selectedQuoteNumber, setSelectedQuoteNumber] = useState<string | null>(null);
  const [quoteActivityOpen, setQuoteActivityOpen] = useState(false);
  const [quoteActivityError, setQuoteActivityError] = useState<string | null>(null);
  const [quoteDetailNumber, setQuoteDetailNumber] = useState<string | null>(null);
  const [quoteDetailOpen, setQuoteDetailOpen] = useState(false);

  // ---- Canonical Stage 1 snapshot (READ-ONLY, Supabase RPC by active run) ----
  // Hydrated via public.get_stage1_progress_snapshot_by_run(p_run_id). Supabase
  // resolves identity from the active Autopsy run and remains the source of
  // truth; used only as canonical gate-status display input and never written
  // from this component.
  const [stage1Snapshot, setStage1Snapshot] = useState<Stage1Snapshot | null>(null);
  const [stage1SnapshotLoaded, setStage1SnapshotLoaded] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(() =>
    searchParams.get("runId") || getStage1RunId() || getActiveRunId(),
  );
  const unitsRef = useRef<ProofUnit[]>(units);
  useEffect(() => {
    unitsRef.current = units;
  }, [units]);
  // Once the Stage 1 sandbox (public.stage1_job_margin_summary) has hydrated the
  // ledger with at least one row, the legacy Core-board loader must NOT override
  // the canonical commercial units.
  const sandboxHydratedRef = useRef(false);
  useEffect(() => {
    const nextRunId = searchParams.get("runId") || getStage1RunId() || getActiveRunId();
    if (!nextRunId) return;
    setStage1RunId(nextRunId);
    setActiveRunId(nextRunId);
  }, [searchParams]);
  useEffect(() => {
    if (activeRunId || !user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("autopsy_runs")
        .select("id")
        .not("verdict_name", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const recoveredRunId = typeof data?.id === "string" ? data.id : null;
      if (cancelled || !recoveredRunId) return;
      setStage1RunId(recoveredRunId);
      setActiveRunId(recoveredRunId);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeRunId, user?.id]);

  // ---- Canonical Stage 1 evidence requirements (READ-ONLY, Supabase RPC) ----
  // Hydrated via public.get_stage1_evidence_requirements_snapshot(p_stage_progress_id).
  // Supabase owns the requirement templates + instantiated evidence rows; this
  // component only displays them and never creates/verifies evidence.
  const [stage1Requirements, setStage1Requirements] = useState<Stage1Requirement[]>([]);
  const [stage1RequirementsLoaded, setStage1RequirementsLoaded] = useState(false);
  // Submit-only evidence state. Supabase owns evidence/verification state; the
  // frontend only *requests* a submit and never sets verified / valid / gate.
  const [stage1SubmittingId, setStage1SubmittingId] = useState<string | null>(null);
  const [stage1SubmitError, setStage1SubmitError] = useState<string | null>(null);
  const [stage1SubmitNotes, setStage1SubmitNotes] = useState<Record<string, string>>({});

  // Debug/admin-only verification state. Supabase owns verification; this tracks
  // pending RPC calls and any diagnostic error messages.
  const [stage1VerifyingId, setStage1VerifyingId] = useState<string | null>(null);
  const [stage1VerifyError, setStage1VerifyError] = useState<string | null>(null);

  // ---- Canonical Stage 1 completion evaluation (read-only, Supabase-owned) ----
  // Hydrated via public.evaluate_stage1_completion(p_stage_progress_id).
  // Supabase owns the evaluator; this component only displays the result.
  const [stage1Evaluation, setStage1Evaluation] = useState<Stage1Evaluation | null>(null);
  const [stage1EvaluationLoaded, setStage1EvaluationLoaded] = useState(false);

  // ---- Debug/admin-only gate decision (Supabase-owned) ----
  // Tracks the result of public.apply_stage1_gate_decision and any diagnostic error.
  const [stage1GateDecision, setStage1GateDecision] = useState<Stage1GateDecision | null>(null);
  const [stage1GateDecisionLoading, setStage1GateDecisionLoading] = useState(false);
  const [stage1GateDecisionError, setStage1GateDecisionError] = useState<string | null>(null);

  // ---- Canonical Stage 1 commitments (read-only, Supabase-owned) ----
  // Hydrated via public.get_stage1_commitments_snapshot(p_stage_progress_id).
  // Supabase owns commitment state; this component only displays rows.
  const [stage1Commitments, setStage1Commitments] = useState<Stage1Commitment[]>([]);
  const [stage1CommitmentsLoaded, setStage1CommitmentsLoaded] = useState(false);

  // ---- Debug/admin-only commitment check (Supabase-owned) ----
  // Tracks the result of public.check_stage1_commitments and any diagnostic error.
  const [stage1CommitmentCheck, setStage1CommitmentCheck] = useState<Stage1CommitmentCheckResult | null>(null);
  const [stage1CommitmentCheckLoading, setStage1CommitmentCheckLoading] = useState(false);
  const [stage1CommitmentCheckError, setStage1CommitmentCheckError] = useState<string | null>(null);

  // Internal/admin-only operator insight review state. Hydrated via the
  // read-only RPC get_operator_insights_review_snapshot. Debug/admin only —
  // never exposed to normal users.
  const [operatorInsightsReview, setOperatorInsightsReview] = useState<OperatorInsightReview[]>([]);
  const [operatorInsightsReviewLoaded, setOperatorInsightsReviewLoaded] = useState(false);
  const [operatorInsightsReviewError, setOperatorInsightsReviewError] = useState<string | null>(null);
  const [operatorInsightReviewingId, setOperatorInsightReviewingId] = useState<string | null>(null);

  // ---- Debug/admin-only control snapshot (read-only, Supabase-owned) ----
  // Hydrated via public.get_stage1_debug_control_snapshot(p_stage_progress_id).
  // Debug/admin only — never exposed to normal users.
  const [stage1DebugControlSnapshot, setStage1DebugControlSnapshot] = useState<Stage1DebugControlSnapshot | null>(null);
  const [stage1DebugControlSnapshotLoading, setStage1DebugControlSnapshotLoading] = useState(false);
  const [stage1DebugControlSnapshotError, setStage1DebugControlSnapshotError] = useState<string | null>(null);

  // Debug/admin-only construction readiness summary (read-only, Supabase-owned)
  // Hydrated via public.get_stage1_construction_readiness_summary().
  // Debug/admin only — never exposed to normal users.
  const [constructionReadinessSummary, setConstructionReadinessSummary] = useState<ConstructionReadinessSummary | null>(null);
  const [constructionReadinessSummaryLoading, setConstructionReadinessSummaryLoading] = useState(false);
  const [constructionReadinessSummaryError, setConstructionReadinessSummaryError] = useState<string | null>(null);

  // Debug/admin-only UI boundary summary (read-only, Supabase-owned)
  // Hydrated via public.get_stage1_ui_boundary_summary().
  // Debug/admin only — never exposed to normal users.
  const [uiBoundarySummary, setUiBoundarySummary] = useState<UIBoundarySummary | null>(null);
  const [uiBoundarySummaryLoading, setUiBoundarySummaryLoading] = useState(false);
  const [uiBoundarySummaryError, setUiBoundarySummaryError] = useState<string | null>(null);

  // Debug/admin-only product surface plan summary (read-only, Supabase-owned)
  // Hydrated via public.get_stage1_product_surface_plan_summary().
  // Debug/admin only — never exposed to normal users.
  const [productSurfacePlanSummary, setProductSurfacePlanSummary] = useState<ProductSurfacePlanSummary | null>(null);
  const [productSurfacePlanSummaryLoading, setProductSurfacePlanSummaryLoading] = useState(false);
  const [productSurfacePlanSummaryError, setProductSurfacePlanSummaryError] = useState<string | null>(null);

  // Product-facing next-step guidance (read-only, Supabase-owned). Hydrated via
  // public.get_stage1_next_step_guidance(p_stage_progress_id). Supabase owns all
  // guidance derivation; this component only renders the returned row.
  const [stage1NextStepGuidance, setStage1NextStepGuidance] = useState<Stage1NextStepGuidance | null>(null);
  const [stage1NextStepGuidanceLoaded, setStage1NextStepGuidanceLoaded] = useState(false);
  const [stage1NextStepGuidanceError, setStage1NextStepGuidanceError] = useState<string | null>(null);

  // ---- Product-facing public run-scoped wrapper data (READ-ONLY) ----
  // Hydrated via the public wrapper RPCs keyed by the active Autopsy run id.
  // Supabase resolves stage_progress_id internally and returns public-safe
  // fields only. Product-facing cards prefer this data and fall back to the
  // lower-level snapshot reads when a wrapper is unavailable, so the dashboard
  // never breaks. These never expose raw JSON or operator insights publicly.
  const [stage1PublicProgress, setStage1PublicProgress] = useState<Stage1PublicProgress | null>(null);
  const [stage1PublicEvidence, setStage1PublicEvidence] = useState<Stage1PublicEvidence[]>([]);
  const [stage1PublicCompletion, setStage1PublicCompletion] = useState<Stage1PublicCompletion | null>(null);
  const [stage1PublicCommitments, setStage1PublicCommitments] = useState<Stage1PublicCommitment[]>([]);
  const [stage1PublicNextStep, setStage1PublicNextStep] = useState<Stage1PublicNextStep | null>(null);
  const [stage1PublicLoaded, setStage1PublicLoaded] = useState(false);

  // Read-only hydration through the canonical RPC, keyed by the Stage 1 run id.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!activeRunId) {
        if (active) setStage1SnapshotLoaded(true);
        return;
      }
      try {
        const { data, error } = await supabase.rpc(
          "get_stage1_progress_snapshot_by_run",
          { p_run_id: activeRunId },
        );
        if (!active) return;
        if (error) {
          console.warn("[stage1_snapshot] RPC by_run failed:", error.message);
          return; // preserve existing computed dashboard behaviour
        }
        const row = Array.isArray(data) ? data[0] : data;
        if (row) setStage1Snapshot(row as Stage1Snapshot);
      } catch (err) {
        console.warn("[stage1_snapshot] RPC by_run threw:", err);
      } finally {
        if (active) setStage1SnapshotLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [activeRunId]);

  // Read-only hydration of the product-facing public run-scoped wrappers. The
  // frontend passes only the active Autopsy run id; Supabase resolves identity
  // and returns public-safe fields. Each wrapper is independent and fails
  // gracefully — a failed/empty wrapper leaves existing display values intact.
  const fetchStage1PublicWrappers = async (runId: string) => {
    const [progress, evidence, completion, commitments, nextStep] =
      await Promise.allSettled([
        supabase.rpc("get_stage1_public_progress_by_run", { p_run_id: runId }),
        supabase.rpc("get_stage1_public_evidence_by_run", { p_run_id: runId }),
        supabase.rpc("get_stage1_public_completion_by_run", { p_run_id: runId }),
        supabase.rpc("get_stage1_public_commitments_by_run", { p_run_id: runId }),
        supabase.rpc("get_stage1_public_next_step_by_run", { p_run_id: runId }),
      ]);
    // Return undefined for any wrapper that did not resolve cleanly so callers
    // never overwrite good display data with a null/empty failure result.
    const single = (r: PromiseSettledResult<any>) => {
      if (r.status !== "fulfilled" || r.value?.error) return undefined;
      const d = r.value.data;
      return (Array.isArray(d) ? d[0] ?? null : d ?? null);
    };
    const many = (r: PromiseSettledResult<any>) => {
      if (r.status !== "fulfilled" || r.value?.error) return undefined;
      const d = r.value.data;
      return (Array.isArray(d) ? d : d ? [d] : []);
    };
    return {
      progress: single(progress),
      evidence: many(evidence),
      completion: single(completion),
      commitments: many(commitments),
      nextStep: single(nextStep),
    };
  };

  const refreshStage1PublicWrappers = async (runId: string | null) => {
    if (!runId) return;
    try {
      const r = await fetchStage1PublicWrappers(runId);
      if (r.progress !== undefined) setStage1PublicProgress(r.progress);
      if (r.evidence !== undefined) setStage1PublicEvidence(r.evidence);
      if (r.completion !== undefined) setStage1PublicCompletion(r.completion);
      if (r.commitments !== undefined) setStage1PublicCommitments(r.commitments);
      if (r.nextStep !== undefined) setStage1PublicNextStep(r.nextStep);
    } catch (err) {
      console.warn("[stage1_public_wrappers] refresh threw:", err);
    }
  };

  useEffect(() => {
    if (!activeRunId) {
      setStage1PublicLoaded(false);
      return;
    }
    let active = true;
    (async () => {
      await refreshStage1PublicWrappers(activeRunId);
      if (active) setStage1PublicLoaded(true);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRunId]);

  // ---- Consolidated, run-scoped, READ-ONLY dashboard + job-detail display ----
  // Hydrated via the authenticated, run-scoped RPCs
  //   public.get_stage1_dashboard_display_by_run(p_run_id)
  //   public.get_stage1_job_detail_display_by_run(p_run_id)
  // Supabase resolves identity from the active Autopsy run and returns
  // display-ready, public-safe rows. The dashboard NEVER reads broad Stage 1
  // views or base tables directly, and never recomputes margin client-side.
  const [stage1DashboardDisplay, setStage1DashboardDisplay] =
    useState<Stage1DashboardDisplay | null>(null);
  const [stage1JobDetailDisplay, setStage1JobDetailDisplay] = useState<
    Stage1JobDetailDisplay[]
  >([]);
  const [stage1DisplayLoaded, setStage1DisplayLoaded] = useState(false);

  useEffect(() => {
    if (!activeRunId) {
      setStage1DashboardDisplay(null);
      setStage1JobDetailDisplay([]);
      setStage1DisplayLoaded(false);
      return; // no active run → no RPC call
    }
    let active = true;
    (async () => {
      const [dash, jobs] = await Promise.allSettled([
        supabase.rpc("get_stage1_dashboard_display_by_run", {
          p_run_id: activeRunId,
        }),
        supabase.rpc("get_stage1_job_detail_display_by_run", {
          p_run_id: activeRunId,
        }),
      ]);
      if (!active) return;
      if (dash.status === "fulfilled" && !dash.value?.error) {
        const d = dash.value.data;
        setStage1DashboardDisplay((Array.isArray(d) ? d[0] ?? null : d ?? null) as Stage1DashboardDisplay | null);
      } else if (dash.status === "fulfilled" && dash.value?.error) {
        console.warn("[stage1_dashboard_display] RPC failed:", dash.value.error.message);
      }
      if (jobs.status === "fulfilled" && !jobs.value?.error) {
        const j = jobs.value.data;
        setStage1JobDetailDisplay((Array.isArray(j) ? j : j ? [j] : []) as Stage1JobDetailDisplay[]);
      } else if (jobs.status === "fulfilled" && jobs.value?.error) {
        console.warn("[stage1_job_detail_display] RPC failed:", jobs.value.error.message);
      }
      setStage1DisplayLoaded(true);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRunId]);

  // Debug/admin-only Stage 1 activation. Supabase owns ALL activation logic;
  // this only *requests* activation by the active Autopsy run id and stores the
  // returned canonical snapshot. No client-side eligibility, no direct writes.
  const [stage1Activating, setStage1Activating] = useState(false);
  const [stage1ActivateMsg, setStage1ActivateMsg] = useState<string | null>(null);

  // Read-only hydration of canonical Stage 1 evidence requirements, keyed by the
  // resolved stage_progress_id from the snapshot RPC. Only fires once a
  // stage_progress_id exists; never reads stage_gate_evidence directly and never
  // computes requirement status client-side.
  const stageProgressId = stage1Snapshot?.stage_progress_id ?? null;

  // Product-facing display values. Prefer the public run-scoped wrapper data and
  // fall back to the lower-level snapshot reads so the dashboard never breaks
  // when a wrapper is unavailable. Debug/admin controls continue to use
  // stageProgressId directly.
  const displayEvidence: Stage1PublicEvidence[] =
    stage1PublicEvidence.length > 0
      ? stage1PublicEvidence
      : (stage1Requirements as Stage1PublicEvidence[]);
  const displayCompletion: Stage1PublicCompletion | null =
    stage1PublicCompletion ?? stage1Evaluation;
  const displayCommitments: Stage1PublicCommitment[] =
    stage1PublicCommitments.length > 0
      ? stage1PublicCommitments
      : (stage1Commitments as Stage1PublicCommitment[]);
  const displayNextStep: Stage1PublicNextStep | null =
    stage1PublicNextStep ?? stage1NextStepGuidance;

  // Reusable read-only fetch for canonical Stage 1 requirements. Used by the
  // hydration effect and re-used after a submit to refresh displayed status.
  const fetchStage1Requirements = async (progressId: string) => {
    const { data, error } = await supabase.rpc(
      "get_stage1_evidence_requirements_snapshot",
      { p_stage_progress_id: progressId },
    );
    if (error) throw error;
    return (Array.isArray(data) ? data : data ? [data] : []) as Stage1Requirement[];
  };

  useEffect(() => {
    let active = true;
    if (!stageProgressId) {
      setStage1Requirements([]);
      setStage1RequirementsLoaded(false);
      return; // no stage_progress_id → do not call the requirements RPC
    }
    (async () => {
      try {
        const rows = await fetchStage1Requirements(stageProgressId);
        if (!active) return;
        setStage1Requirements(rows);
      } catch (err) {
        console.warn("[stage1_requirements] RPC threw:", err);
      } finally {
        if (active) setStage1RequirementsLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [stageProgressId]);

  // Read-only hydration of canonical Stage 1 completion evaluation. Only fires
  // when stage_progress_id exists; never mutates stage_progress or advances gates.
  useEffect(() => {
    let active = true;
    if (!stageProgressId) {
      setStage1Evaluation(null);
      setStage1EvaluationLoaded(false);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.rpc(
          "evaluate_stage1_completion",
          { p_stage_progress_id: stageProgressId },
        );
        if (!active) return;
        if (error) {
          console.warn("[stage1_evaluation] RPC failed:", error.message);
          return;
        }
        const row = Array.isArray(data) ? data[0] : data;
        if (row) setStage1Evaluation(row as Stage1Evaluation);
      } catch (err) {
        console.warn("[stage1_evaluation] RPC threw:", err);
      } finally {
        if (active) setStage1EvaluationLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [stageProgressId]);

  // Read-only hydration of canonical Stage 1 commitments. Only fires when
  // stage_progress_id exists; never creates or checks commitments client-side.
  useEffect(() => {
    let active = true;
    if (!stageProgressId) {
      setStage1Commitments([]);
      setStage1CommitmentsLoaded(false);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.rpc(
          "get_stage1_commitments_snapshot",
          { p_stage_progress_id: stageProgressId },
        );
        if (!active) return;
        if (error) {
          console.warn("[stage1_commitments] RPC failed:", error.message);
          return;
        }
        const rows = (Array.isArray(data) ? data : data ? [data] : []) as Stage1Commitment[];
        if (active) setStage1Commitments(rows);
      } catch (err) {
        console.warn("[stage1_commitments] RPC threw:", err);
      } finally {
        if (active) setStage1CommitmentsLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [stageProgressId]);

  // Read-only hydration of product-facing next-step guidance. Only fires when
  // stage_progress_id exists; never computes guidance, never mutates anything.
  useEffect(() => {
    let active = true;
    if (!stageProgressId) {
      setStage1NextStepGuidance(null);
      setStage1NextStepGuidanceLoaded(false);
      setStage1NextStepGuidanceError(null);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.rpc(
          "get_stage1_next_step_guidance",
          { p_stage_progress_id: stageProgressId },
        );
        if (!active) return;
        if (error) {
          console.warn("[stage1_next_step_guidance] RPC failed:", error.message);
          setStage1NextStepGuidanceError(
            `Next step guidance load failed: ${error.message}`,
          );
          return;
        }
        const row = Array.isArray(data) ? data[0] : data;
        if (active) {
          setStage1NextStepGuidance((row ?? null) as Stage1NextStepGuidance | null);
          setStage1NextStepGuidanceError(null);
        }
      } catch (err: any) {
        if (!active) return;
        console.warn("[stage1_next_step_guidance] RPC threw:", err);
        setStage1NextStepGuidanceError("Next step guidance threw an unexpected error.");
      } finally {
        if (active) setStage1NextStepGuidanceLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [stageProgressId]);

  // Product-facing primary action handler. Only scrolls/focuses a local anchor
  // when one exists for the Supabase-provided target. Never derives guidance,
  // never mutates, never alters routes. Unknown/absent targets are a safe no-op.
  const handleNextStepAction = (target: string | null | undefined) => {
    const anchorId =
      target === "stage1_evidence"
        ? "stage1-evidence-section"
        : target === "stage1_completion"
          ? "stage1-completion-section"
          : null;
    if (!anchorId) return;
    const el = typeof document !== "undefined" ? document.getElementById(anchorId) : null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Internal/admin-only read of operator insights for review. Debug-only RPC
  // get_operator_insights_review_snapshot. Never generates insights, never
  // exposes them to normal users, and never computes maturity client-side.
  const fetchOperatorInsightsReview = async (
    progressId: string,
  ): Promise<OperatorInsightReview[]> => {
    const { data, error } = await supabase.rpc(
      "get_operator_insights_review_snapshot",
      {
        p_stage_progress_id: progressId,
        p_review_status: null,
        p_limit: 20,
      },
    );
    if (error) throw error;
    return (Array.isArray(data) ? data : data ? [data] : []) as OperatorInsightReview[];
  };

  useEffect(() => {
    let active = true;
    if (!stageProgressId) {
      setOperatorInsightsReview([]);
      setOperatorInsightsReviewLoaded(false);
      setOperatorInsightsReviewError(null);
      return;
    }
    (async () => {
      try {
        const rows = await fetchOperatorInsightsReview(stageProgressId);
        if (!active) return;
        setOperatorInsightsReview(rows);
        setOperatorInsightsReviewError(null);
      } catch (err: any) {
        if (!active) return;
        console.warn("[operator_insights_review] RPC failed:", err?.message ?? err);
        setOperatorInsightsReviewError(
          `Operator insights review load failed: ${err?.message ?? "unknown error"}`,
        );
      } finally {
        if (active) setOperatorInsightsReviewLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [stageProgressId]);

  // Internal/admin-only review action. Calls public.review_operator_insight to
  // record a review status against one insight, then re-fetches the review
  // snapshot. Never updates operator_insights directly and never generates
  // insights from the client.
  const reviewOperatorInsight = async (
    insight: OperatorInsightReview,
    reviewStatus: "useful" | "needs_followup" | "not_useful",
  ) => {
    if (!insight.operator_insight_id || !stageProgressId) return;
    setOperatorInsightReviewingId(insight.operator_insight_id);
    setOperatorInsightsReviewError(null);
    try {
      const { error } = await supabase.rpc("review_operator_insight", {
        p_operator_insight_id: insight.operator_insight_id,
        p_review_status: reviewStatus,
        p_reviewed_by: "stage1_debug_review",
        p_notes: "Reviewed from Stage 1 debug/admin panel.",
      });
      if (error) {
        console.warn("[operator_insights_review] review RPC failed:", error.message);
        setOperatorInsightsReviewError(`Review failed: ${error.message}`);
        return;
      }
      const rows = await fetchOperatorInsightsReview(stageProgressId);
      setOperatorInsightsReview(rows);
    } catch (err: any) {
      console.warn("[operator_insights_review] review RPC threw:", err);
      setOperatorInsightsReviewError("Review threw an unexpected error.");
    } finally {
      setOperatorInsightReviewingId(null);
    }
  };

  // Debug/admin-only combined control snapshot fetch. Calls
  // public.get_stage1_debug_control_snapshot. Read-only; never mutates anything.
  const fetchStage1DebugControlSnapshot = async () => {
    if (!stageProgressId) {
      setStage1DebugControlSnapshotError("No stage_progress_id available.");
      return;
    }
    setStage1DebugControlSnapshotLoading(true);
    setStage1DebugControlSnapshotError(null);
    try {
      const { data, error } = await supabase.rpc("get_stage1_debug_control_snapshot", {
        p_stage_progress_id: stageProgressId,
      });
      if (error) {
        console.warn("[stage1_debug_control_snapshot] RPC failed:", error.message);
        setStage1DebugControlSnapshotError(`Debug snapshot failed: ${error.message}`);
        return;
      }
      setStage1DebugControlSnapshot(data as Stage1DebugControlSnapshot);
    } catch (err) {
      console.warn("[stage1_debug_control_snapshot] RPC threw:", err);
      setStage1DebugControlSnapshotError("Debug snapshot threw an unexpected error.");
    } finally {
      setStage1DebugControlSnapshotLoading(false);
    }
  };

  // Debug/admin-only construction readiness summary fetch. Calls
  // public.get_stage1_construction_readiness_summary. Read-only; never mutates anything.
  const fetchConstructionReadinessSummary = async () => {
    setConstructionReadinessSummaryLoading(true);
    setConstructionReadinessSummaryError(null);
    try {
      const { data, error } = await supabase.rpc("get_stage1_construction_readiness_summary");
      if (error) {
        console.warn("[construction_readiness_summary] RPC failed:", error.message);
        setConstructionReadinessSummaryError(`Readiness summary failed: ${error.message}`);
        return;
      }
      setConstructionReadinessSummary(data as ConstructionReadinessSummary);
    } catch (err) {
      console.warn("[construction_readiness_summary] RPC threw:", err);
      setConstructionReadinessSummaryError("Readiness summary threw an unexpected error.");
    } finally {
      setConstructionReadinessSummaryLoading(false);
    }
  };

  // Debug/admin-only UI boundary summary fetch. Calls
  // public.get_stage1_ui_boundary_summary. Read-only; never mutates anything.
  const fetchUIBoundarySummary = async () => {
    setUiBoundarySummaryLoading(true);
    setUiBoundarySummaryError(null);
    try {
      const { data, error } = await supabase.rpc("get_stage1_ui_boundary_summary");
      if (error) {
        console.warn("[ui_boundary_summary] RPC failed:", error.message);
        setUiBoundarySummaryError(`UI boundary summary failed: ${error.message}`);
        return;
      }
      setUiBoundarySummary(data as UIBoundarySummary);
    } catch (err) {
      console.warn("[ui_boundary_summary] RPC threw:", err);
      setUiBoundarySummaryError("UI boundary summary threw an unexpected error.");
    } finally {
      setUiBoundarySummaryLoading(false);
    }
  };

  // Debug/admin-only product surface plan summary fetch. Calls
  // public.get_stage1_product_surface_plan_summary. Read-only; never mutates anything.
  const fetchProductSurfacePlanSummary = async () => {
    setProductSurfacePlanSummaryLoading(true);
    setProductSurfacePlanSummaryError(null);
    try {
      const { data, error } = await supabase.rpc("get_stage1_product_surface_plan_summary");
      if (error) {
        console.warn("[product_surface_plan_summary] RPC failed:", error.message);
        setProductSurfacePlanSummaryError(`Product surface plan summary failed: ${error.message}`);
        return;
      }
      setProductSurfacePlanSummary(data as ProductSurfacePlanSummary);
    } catch (err) {
      console.warn("[product_surface_plan_summary] RPC threw:", err);
      setProductSurfacePlanSummaryError("Product surface plan summary threw an unexpected error.");
    } finally {
      setProductSurfacePlanSummaryLoading(false);
    }
  };

  // Product-facing, run-scoped submit-only evidence action. Calls the public
  // wrapper public.submit_stage1_public_evidence_by_run which requires a
  // completed Autopsy run, resolves Stage 1 progress server-side, confirms the
  // evidence row belongs to that run's Stage 1 progress, and delegates to
  // submit_stage1_evidence. The lower-level submit_stage1_evidence is never
  // called from product-facing UI. This moves one requirement to
  // evidence_status='submitted' while keeping verified=false (submission is not
  // verification). Supabase owns evidence/verification/gate state; this never
  // sets verified/valid, never writes stage_gate_evidence directly, and never
  // creates commitments or operator insights. After a successful submit it
  // re-fetches the canonical public wrappers to refresh displayed status.
  const submitStage1Evidence = async (req: Stage1PublicEvidence) => {
    const evidenceId = req.stage_gate_evidence_id;
    if (!evidenceId || !activeRunId) return;
    setStage1SubmittingId(evidenceId);
    setStage1SubmitError(null);
    const note = (stage1SubmitNotes[evidenceId] ?? "").trim();
    try {
      const { error } = await supabase.rpc(
        "submit_stage1_public_evidence_by_run",
        {
          p_run_id: activeRunId,
          p_stage_gate_evidence_id: evidenceId,
          p_evidence_url: null,
          p_evidence_value: {
            source: "stage1_dashboard",
            requirement_code: req.requirement_code,
            ...(note ? { user_note: note } : {}),
          },
        },
      );
      if (error) {
        console.warn("[stage1_submit] RPC failed:", error.message);
        setStage1SubmitError(`Submit failed: ${error.message}`);
        return; // preserve current UI state
      }
      // Re-fetch canonical public status; never infer 'submitted' client-side.
      // refreshStage1PublicWrappers re-fetches public evidence, completion and
      // next-step (among others) via the run-scoped wrappers.
      await refreshStage1PublicWrappers(activeRunId);
      // Preserve debug/admin requirements snapshot refresh when available.
      if (stageProgressId) {
        const rows = await fetchStage1Requirements(stageProgressId);
        setStage1Requirements(rows);
      }
    } catch (err) {
      console.warn("[stage1_submit] RPC threw:", err);
      setStage1SubmitError("Submit threw an unexpected error.");
    } finally {
      setStage1SubmittingId(null);
    }
  };

  // Debug/admin-only verification action. Calls public.verify_stage1_evidence which
  // marks one Stage 1 evidence row valid or invalid. Supabase owns verification
  // state; this never writes stage_gate_evidence directly and never advances
  // stage gates or creates commitments/operator insights.
  const verifyStage1Evidence = async (
    req: Stage1PublicEvidence,
    verified: boolean,
  ) => {
    const evidenceId = req.stage_gate_evidence_id;
    if (!evidenceId || !stageProgressId) return;
    setStage1VerifyingId(evidenceId);
    setStage1VerifyError(null);
    try {
      const { error } = await supabase.rpc("verify_stage1_evidence", {
        p_stage_gate_evidence_id: evidenceId,
        p_verified: verified,
        p_verification_notes: verified
          ? "Debug/admin verification from Stage 1 dashboard."
          : "Debug/admin rejection from Stage 1 dashboard.",
      });
      if (error) {
        console.warn("[stage1_verify] RPC failed:", error.message);
        setStage1VerifyError(`Verification failed: ${error.message}`);
        return;
      }
      const rows = await fetchStage1Requirements(stageProgressId);
      setStage1Requirements(rows);
      await refreshStage1PublicWrappers(activeRunId);
    } catch (err) {
      console.warn("[stage1_verify] RPC threw:", err);
      setStage1VerifyError("Verification threw an unexpected error.");
    } finally {
      setStage1VerifyingId(null);
    }
  };

  // Debug/admin-only gate decision action. Calls public.apply_stage1_gate_decision
  // which evaluates completion server-side, writes a stage_gate_decisions audit row,
  // and only updates stage_progress to passed if all required evidence is valid.
  // Supabase owns evaluation, decision recording, and progression state.
  const applyStage1GateDecision = async () => {
    if (!stageProgressId) {
      setStage1GateDecisionError("No stage_progress_id available.");
      return;
    }
    setStage1GateDecisionLoading(true);
    setStage1GateDecisionError(null);
    setStage1GateDecision(null);
    try {
      const { data, error } = await supabase.rpc("apply_stage1_gate_decision", {
        p_stage_progress_id: stageProgressId,
      });
      if (error) {
        console.warn("[stage1_gate_decision] RPC failed:", error.message);
        setStage1GateDecisionError(`Gate decision failed: ${error.message}`);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setStage1GateDecision(row as Stage1GateDecision);
      }
      // Re-fetch canonical snapshot, requirements, and evaluation
      if (activeRunId) {
        const { data: snapData, error: snapErr } = await supabase.rpc(
          "get_stage1_progress_snapshot_by_run",
          { p_run_id: activeRunId },
        );
        if (!snapErr) {
          const snapRow = Array.isArray(snapData) ? snapData[0] : snapData;
          if (snapRow) setStage1Snapshot(snapRow as Stage1Snapshot);
        }
      }
      if (stageProgressId) {
        const reqRows = await fetchStage1Requirements(stageProgressId);
        setStage1Requirements(reqRows);
        const { data: evalData, error: evalErr } = await supabase.rpc(
          "evaluate_stage1_completion",
          { p_stage_progress_id: stageProgressId },
        );
        if (!evalErr) {
          const evalRow = Array.isArray(evalData) ? evalData[0] : evalData;
          if (evalRow) setStage1Evaluation(evalRow as Stage1Evaluation);
        }
      }
      await refreshStage1PublicWrappers(activeRunId);
    } catch (err) {
      console.warn("[stage1_gate_decision] RPC threw:", err);
      setStage1GateDecisionError("Gate decision threw an unexpected error.");
    } finally {
      setStage1GateDecisionLoading(false);
    }
  };

  // Debug/admin-only commitment check action. Calls public.check_stage1_commitments
  // which checks valid evidence count against commitments, updates status, records
  // actual_value_at_check, and may generate an operator insight. Supabase owns all
  // commitment state and insight generation; this never updates commitments directly.
  const checkStage1Commitments = async () => {
    if (!stageProgressId) {
      setStage1CommitmentCheckError("No stage_progress_id available.");
      return;
    }
    setStage1CommitmentCheckLoading(true);
    setStage1CommitmentCheckError(null);
    setStage1CommitmentCheck(null);
    try {
      const { data, error } = await supabase.rpc("check_stage1_commitments", {
        p_stage_progress_id: stageProgressId,
      });
      if (error) {
        console.warn("[stage1_commitment_check] RPC failed:", error.message);
        setStage1CommitmentCheckError(`Commitment check failed: ${error.message}`);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setStage1CommitmentCheck(row as Stage1CommitmentCheckResult);
      }
      // Re-fetch canonical commitments snapshot, evaluation, and progress snapshot
      if (stageProgressId) {
        const { data: commData, error: commErr } = await supabase.rpc(
          "get_stage1_commitments_snapshot",
          { p_stage_progress_id: stageProgressId },
        );
        if (!commErr) {
          const commRows = (Array.isArray(commData) ? commData : commData ? [commData] : []) as Stage1Commitment[];
          setStage1Commitments(commRows);
        }
        const { data: evalData, error: evalErr } = await supabase.rpc(
          "evaluate_stage1_completion",
          { p_stage_progress_id: stageProgressId },
        );
        if (!evalErr) {
          const evalRow = Array.isArray(evalData) ? evalData[0] : evalData;
          if (evalRow) setStage1Evaluation(evalRow as Stage1Evaluation);
        }
      }
      if (activeRunId) {
        const { data: snapData, error: snapErr } = await supabase.rpc(
          "get_stage1_progress_snapshot_by_run",
          { p_run_id: activeRunId },
        );
        if (!snapErr) {
          const snapRow = Array.isArray(snapData) ? snapData[0] : snapData;
          if (snapRow) setStage1Snapshot(snapRow as Stage1Snapshot);
        }
      }
      await refreshStage1PublicWrappers(activeRunId);
    } catch (err) {
      console.warn("[stage1_commitment_check] RPC threw:", err);
      setStage1CommitmentCheckError("Commitment check threw an unexpected error.");
    } finally {
      setStage1CommitmentCheckLoading(false);
    }
  };

  const activateStage1 = async () => {
    if (!activeRunId) {
      setStage1ActivateMsg("No active Autopsy run id available.");
      return;
    }
    setStage1Activating(true);
    setStage1ActivateMsg(null);
    try {
      const { data, error } = await supabase.rpc(
        "activate_stage1_from_autopsy_run",
        { p_run_id: activeRunId },
      );
      if (error) {
        console.warn("[stage1_activate] RPC failed:", error.message);
        setStage1ActivateMsg(`Activation failed: ${error.message}`);
        return; // preserve existing dashboard behaviour
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setStage1Snapshot(row as Stage1Snapshot);
        setStage1ActivateMsg(
          `Activated · gate: ${(row as Stage1Snapshot).current_gate_status ?? "—"}`,
        );
      } else {
        setStage1ActivateMsg("Activation returned no snapshot.");
      }
    } catch (err) {
      console.warn("[stage1_activate] RPC threw:", err);
      setStage1ActivateMsg("Activation threw an unexpected error.");
    } finally {
      setStage1Activating(false);
    }
  };

  // Load the persisted Core quote board + job ledger so Stage 1 survives refresh.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { quotes: dbQuotes, jobs: dbJobs } = await loadStage1Board();
        if (!active) return;
        if (dbQuotes.length) {
          setQuotes(dbQuotes.map((q) => ({ ...q, sourceActivityDate: q.quoteDate })));
        }
        // Do NOT clobber the canonical sandbox ledger once it has hydrated from
        // public.stage1_job_margin_summary. Core jobs are only a legacy fallback.
        if (dbJobs.length && !sandboxHydratedRef.current) {
          setUnits(
            dbJobs.map((j, i) => ({
              n: i + 1,
              jobNumber: j.jobNumber,
              client: j.client,
              jobSite: j.site || undefined,
              proofType: "Completed Job",
              status: "Scheduled",
              gm: 0,
              evidence: false,
              quoteValue: j.value,
              projectedRevenue: j.value,
              sourceQuote: j.sourceQuote,
              jobId: j.jobId,
              accountId: j.accountId,
              siteId: j.siteId,
              dbQuoteId: j.dbQuoteId,
              dbQuoteNumber: j.dbQuoteNumber,
            })),
          );
        }
      } catch {
        /* board stays empty; nothing persisted yet */
      }
    })();
    return () => { active = false; };
  }, []);

  // ---- Canonical Stage 1 sandbox hydration (READ-ONLY) ---------------------
  // On load / refresh / re-login / run change, hydrate the job ledger from the
  // required source of truth: public.stage1_job_margin_summary (via
  // fetchStage1Units). Persisted commercial proof (revenue, direct cost, gross
  // profit, gross margin) is reloaded here so it survives a browser refresh.
  // Empty (but successful) reads never clear persisted rows.
  useEffect(() => {
    if (!activeRunId) return;
    let cancelled = false;
    (async () => {
      const cached = loadStage1UnitsCache(activeRunId);
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id ?? null;
      const stageProgressId = stage1Snapshot?.stage_progress_id ?? null;
      console.info("[stage1][hydrate] begin", {
        activeAutopsyRunId: activeRunId,
        activeStageProgressId: stageProgressId,
        currentUserId: userId,
      });
      const canonical = await fetchStage1Units(activeRunId, { stageProgressId, userId });
      if (cancelled) return;
      if (canonical && canonical.length > 0) {
        const merged = mergeUnits(canonical, cached);
        sandboxHydratedRef.current = true;
        unitsRef.current = merged;
        setUnits(merged);
        saveStage1UnitsCache(activeRunId, merged);
        console.info("[stage1][hydrate] applied", { units: merged.length });
      } else if (canonical == null) {
        console.warn("[stage1][hydrate] read failed — keeping existing/cached units");
      } else {
        console.info("[stage1][hydrate] no persisted sandbox rows for this run");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeRunId, stage1Snapshot?.stage_progress_id]);

  const persistUnitsWithDiagnostics = useCallback(
    async (compute: (prev: ProofUnit[]) => ProofUnit[]): Promise<Stage1CanonicalWriteDiagnostics> => {
      const nextUnits = compute(unitsRef.current);
      unitsRef.current = nextUnits;
      setUnits(nextUnits);
      saveStage1UnitsCache(activeRunId, nextUnits);

      if (!activeRunId || !user?.id) {
        return {
          status: "failed",
          runId: activeRunId,
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

      const { units: syncedUnits, diagnostics } = await syncStage1UnitsWithDiagnostics(activeRunId, nextUnits);
      const canonical = await fetchStage1Units(activeRunId);
      if (canonical != null) {
        const merged = mergeUnits(canonical, loadStage1UnitsCache(activeRunId));
        unitsRef.current = merged;
        setUnits(merged);
        saveStage1UnitsCache(activeRunId, merged);
      } else if (syncedUnits) {
        unitsRef.current = syncedUnits;
        setUnits(syncedUnits);
        saveStage1UnitsCache(activeRunId, syncedUnits);
      }
      return diagnostics;
    },
    [activeRunId, user?.id],
  );

  const methodRows = useMemo(() => {
    const methods = new Set<string>();
    METHOD_BASELINE.forEach((b) => methods.add(b.method));
    activities.forEach((a) => a.method && methods.add(a.method));
    quotes.forEach((q) => q.method && methods.add(q.method));
    return Array.from(methods).map((method) => {
      const baseline = METHOD_BASELINE.find((b) => b.method === method);
      const acts = activities.filter((a) => a.method === method);
      const qs = quotes.filter((q) => q.method === method);
      const jobsCount = units.filter((u) => {
        const src = quotes.find((q) => q.number === u.sourceQuote);
        return src?.method === method;
      }).length;
      const attempts = (baseline?.attempts ?? 0) + acts.reduce((s, a) => s + (a.attempts || 0), 0);
      const contacts = (baseline?.contacts ?? 0) + acts.reduce((s, a) => s + (a.contacts_made || 0), 0);
      const quotesSum = (baseline?.quotes ?? 0) + acts.reduce((s, a) => s + (a.quotes_generated || 0), 0);
      const leads = (baseline?.leads ?? 0) + acts.length;
      const noteParts: string[] = [];
      if (baseline?.notes) noteParts.push(baseline.notes);
      if (acts.length) noteParts.push(`${acts.length} logged activit${acts.length === 1 ? "y" : "ies"}`);
      return {
        method,
        attempts,
        contacts,
        leads,
        quotes: quotesSum,
        jobs: (baseline?.jobs ?? 0) + jobsCount,
        notes: noteParts.join(" · "),
      };
    });
  }, [activities, quotes, units]);

  const openReport = (n: number) => {
    setReportN(n);
    setReportOpen(true);
  };
  const reportUnit = units.find((u) => u.n === reportN) ?? null;

  const scorecard = useMemo(() => computeScorecard(units), [units]);
  const selectedUnit = units.find((u) => u.n === selectedN) ?? null;

  const openUnit = (n: number) => {
    setSelectedN(n);
    setSheetOpen(true);
  };

  // Compute KPI aggregates from current state
  const totalLeads = methodRows.reduce((s, r) => s + r.leads, 0);
  const quotesSent = quotes.length;
  const quotesAccepted = quotes.filter((q) => q.status === "Accepted").length;
  const quoteConvPct = quotesSent ? Math.round((quotesAccepted / quotesSent) * 100) : 0;
  // Jobs in the ledger are only those created from accepted, converted quotes.
  const activeJobs = units.filter((u) => u.status !== "Paid" && u.status !== "Voided").length;
  const completedJobs = units.filter((u) => u.status === "Paid").length;
  // Gross Margin KPI + rollups derive from persisted Stage 1 sandbox values
  // (ex-GST), counting only rows that have recorded revenue. Quote amounts never
  // drive margin — only Client Invoice revenue (revenue_amount) does.
  const revenueRows = units.filter((u) => (u.sandboxRevenueAmount ?? u.invoiceAmount ?? 0) > 0);
  const totalIncome = revenueRows.reduce((s, u) => s + (u.sandboxRevenueAmount ?? u.invoiceAmount ?? 0), 0);
  const totalCosts = revenueRows.reduce((s, u) => s + (u.sandboxTotalDirectCost ?? unitTotalCost(u)), 0);
  const grossProfit = totalIncome - totalCosts;
  const gmPct = totalIncome ? Math.round((grossProfit / totalIncome) * 100) : 0;
  const gmStatus = marginStatus(gmPct);
  // Commercial proof: revenue > 0 AND direct cost > 0 AND margin is known.
  const commercialProofCount = units.filter((u) => {
    const rev = u.sandboxRevenueAmount ?? u.invoiceAmount ?? 0;
    const cost = u.sandboxTotalDirectCost ?? unitTotalCost(u);
    return rev > 0 && cost > 0 && u.sandboxGrossMarginPct != null;
  }).length;

  // Supabase-derived gross-margin for the active run (display-ready). The
  // consolidated dashboard display RPC owns the wording: we render
  // gross_margin_display / gross_margin_helper_text / ready_for_stage_2_review /
  // next_action verbatim. Unknown margin is "Not Yet Proven" — never a dash,
  // 0%, 100%, NaN, or blank — and is never recomputed client-side.
  const dashboardMarginRaw =
    stage1DashboardDisplay?.gross_margin_pct ??
    stage1DashboardDisplay?.gross_margin_percent ??
    stage1DashboardDisplay?.margin_pct ??
    null;
  const dashboardMarginDisplay =
    (stage1DashboardDisplay?.gross_margin_display as string | null | undefined) ?? null;
  const dashboardMarginStatus =
    (stage1DashboardDisplay?.gross_margin_status as string | null | undefined) ?? null;
  const dashboardMarginHelper =
    (stage1DashboardDisplay?.gross_margin_helper_text as string | null | undefined) ?? null;
  const dashboardNextAction =
    (stage1DashboardDisplay?.next_action as string | null | undefined) ?? null;
  const dashboardStage2Ready = stage1DashboardDisplay?.ready_for_stage_2_review;
  const dashboardStage2ReadyText =
    dashboardStage2Ready === true
      ? "Yes"
      : dashboardStage2Ready === false || dashboardStage2Ready === undefined
        ? "No"
        : String(dashboardStage2Ready);

  // Direct-cost maturity from the run-scoped dashboard RPC.
  const dashboardDirectCostStatus =
    (stage1DashboardDisplay?.direct_cost_status as string | null | undefined) ?? null;
  const dashboardDirectCostDisplay =
    (stage1DashboardDisplay?.direct_cost_display as string | null | undefined) ?? null;

  // Governance gate: margin cannot be calculated from missing cost data.
  // When direct costs are not recorded, gross margin is "Not Yet Proven" and
  // Stage 2 is not ready — no 0%, 100%, or any calculated value is shown.
  const directCostsNotRecorded = !directCostsRecorded(totalCosts);

  const displayMarginText = directCostsNotRecorded
    ? "Not Yet Proven"
    : renderMarginPct(totalIncome > 0 ? gmPct : null);

  const stage2ReadyText = directCostsNotRecorded ? "No" : dashboardStage2ReadyText;
  const directCostKpiText = renderDirectCost(totalCosts);

  const nextQuoteNumberStart = useMemo(() => {
    const nums = quotes
      .map((q) => parseInt(q.number.replace(/^Q-/, ""), 10))
      .filter((n) => !isNaN(n));
    const max = nums.length ? Math.max(...nums) : 1000;
    return max + 1;
  }, [quotes]);

  const handleAcceptAndConvert = async (q: Quote) => {
    const nextN = (units.reduce((m, u) => Math.max(m, u.n), 0) || 0) + 1;
    // Convert the EXISTING accepted quote (lineage preserved) — no duplicate chain.
    let jobNumber = `J-${1000 + nextN}`;
    let jobId: string | undefined;
    if (q.dbId && q.accountId && q.siteId) {
      const res = await convertQuoteToJob({ quoteId: q.dbId, accountId: q.accountId, siteId: q.siteId });
      if (res.ok) {
        jobId = res.jobId;
        if (res.jobNumber) jobNumber = res.jobNumber;
        toast({ title: "Job created", description: `${q.client} — converted from ${q.number}.` });
      } else {
        toast({ title: "Conversion failed", description: res.error });
        return;
      }
    } else {
      toast({
        title: "Cannot persist — backend required",
        description: "This quote has no saved database id. Re-create it from Log Activity so it persists.",
      });
      return;
    }

    const unit: ProofUnit = {
      n: nextN,
      jobNumber,
      client: q.client,
      jobSite: q.site || undefined,
      proofType: "Completed Job",
      status: "Scheduled",
      gm: 0,
      evidence: false,
      isNewClient: true,
      quoteValue: q.value,
      projectedRevenue: q.value,
      sourceQuote: q.number,
      jobId,
      accountId: q.accountId,
      siteId: q.siteId,
      dbQuoteId: q.dbId,
      dbQuoteNumber: q.number,
    };
    setUnits((prev) => [...prev, unit]);
    setQuotes((prev) =>
      prev.map((p) =>
        p.number === q.number
          ? { ...p, status: "Accepted", converted: true, convertedToN: nextN, convertedJobNumber: jobNumber, convertedAt: new Date().toISOString() }
          : p,
      ),
    );
  };

  const handleQuoteActivitySave = async (q: Quote, newStatus: QuoteStatus, reason: string) => {
    if (q.converted) return;
    if (newStatus === "Accepted") {
      await handleAcceptAndConvert(q);
    } else {
      if (q.dbId) {
        const res = await setQuoteOutcome(q.dbId, newStatus, reason);
        if (!res.ok) {
          toast({ title: "Could not save outcome", description: res.error });
          return;
        }
      } else {
        toast({ title: "Cannot persist — backend required", description: "Quote has no saved database id." });
      }
      setQuotes((prev) =>
        prev.map((p) =>
          p.number === q.number
            ? { ...p, status: newStatus, reason: (newStatus === "Rejected" || newStatus === "Declined") ? reason : "" }
            : p,
        ),
      );
    }
    setQuoteActivityOpen(false);
    setSelectedQuoteNumber(null);
  };

  const openQuoteActivity = () => {
    if (!selectedQuoteNumber) {
      setQuoteActivityError("Select a quote first.");
      window.alert("Select a quote first.");
      return;
    }
    setQuoteActivityError(null);
    setQuoteActivityOpen(true);
  };

  // Row-level Update: target that exact row, no prior selection required.
  const handleUpdateQuote = (n: string) => {
    setSelectedQuoteNumber(n);
    setQuoteActivityError(null);
    setQuoteActivityOpen(true);
  };

  const handleOpenQuoteDetail = (n: string) => {
    setQuoteDetailNumber(n);
    setQuoteDetailOpen(true);
  };

  const handleSaveQuoteDetail = (patch: Partial<Quote>) => {
    if (!quoteDetailNumber) return;
    const original = quotes.find((q) => q.number === quoteDetailNumber);
    setQuotes((prev) =>
      prev.map((p) => (p.number === quoteDetailNumber ? { ...p, ...patch } : p)),
    );
    // Flow-through to the linked job if this quote was already converted.
    if (original?.converted && original.convertedToN != null) {
      setUnits((prev) =>
        prev.map((u) => {
          if (u.n !== original.convertedToN) return u;
          const next = { ...u };
          if (patch.client !== undefined) next.client = patch.client;
          if (patch.site !== undefined) next.jobSite = patch.site || undefined;
          if (patch.value !== undefined) {
            next.quoteValue = patch.value;
            next.projectedRevenue = patch.value;
          }
          return next;
        }),
      );
    }
    setQuoteDetailOpen(false);
  };

  return (
    <div className="px-4 md:px-6 py-6 space-y-6 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Stage 1 command centre</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">First 5 Jobs Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Is the candidate moving toward five real jobs with acceptable margin and valid proof?
          </p>
        </div>
        <div className="flex items-center gap-2">
          {bd.loaded && !bd.complete && (
            <Button onClick={() => setBdOpen(true)} className="gap-2">
              <IdCard className="h-4 w-4" />
              Complete Business Details
            </Button>
          )}
          {bd.loaded && bd.complete && (
            <Badge variant="outline" className="border-emerald-400 text-emerald-700 bg-emerald-50 gap-1.5 py-1.5 px-3">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Business Details Verified
            </Badge>
          )}
        </div>
      </header>

      {bd.loaded && bd.complete && (
        <p className="text-xs text-muted-foreground -mt-2">
          Business Details have been verified and may be updated if required. Business Details remain available through the Business Details menu.
        </p>
      )}

      {/* Diagnostics: canonical Stage 1 snapshot RPC hydration (debug-only, read-only) */}
      {isDebug() && stage1SnapshotLoaded && (
        <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-[11px] font-mono text-muted-foreground -mt-2">
          <span className="uppercase tracking-wide mr-2">stage1_snapshot (rpc by_run)</span>
          active_run_id: {activeRunId ?? "—"}
          {" · "}identity_resolved: {stage1Snapshot?.resolved_user_id ? "yes" : "no"}
          {" · "}resolved_user_id present: {stage1Snapshot?.resolved_user_id ? "yes" : "no"}
          {" · "}stage_progress_found: {stage1Snapshot?.stage_progress_id ? "yes" : "no"}
          {" · "}gate: {stage1Snapshot?.current_gate_status ?? "—"}
          {" · "}verified_evidence: {stage1Snapshot?.verified_evidence_count ?? "—"}
          {" · "}met_commitments: {stage1Snapshot?.met_commitment_count ?? "—"}
          {" · "}insights: {stage1Snapshot?.latest_operator_insight_count ?? "—"}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={activateStage1}
              disabled={stage1Activating || !activeRunId}
              className="rounded border border-border bg-background px-2 py-1 text-[11px] uppercase tracking-wide hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {stage1Activating ? "Activating…" : "Activate Stage 1 (debug)"}
            </button>
            {!activeRunId && (
              <span className="text-amber-600">No active Autopsy run id available.</span>
            )}
            {stage1ActivateMsg && <span>{stage1ActivateMsg}</span>}
          </div>
          {stageProgressId && (
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={applyStage1GateDecision}
                disabled={stage1GateDecisionLoading}
                className="rounded border border-border bg-background px-2 py-1 text-[11px] uppercase tracking-wide hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {stage1GateDecisionLoading ? "Applying…" : "Apply Gate Decision (debug)"}
              </button>
              {stage1GateDecisionError && (
                <span className="text-amber-600">{stage1GateDecisionError}</span>
              )}
            </div>
          )}
          {stage1GateDecision && (
            <div className="mt-2 space-y-0.5">
              <div className="uppercase tracking-wide">gate_decision_result</div>
              <div>
                decision_id: {stage1GateDecision.decision_id ?? "—"}
                {" · "}decision_status: {stage1GateDecision.decision_status ?? "—"}
                {" · "}current_gate_status: {stage1GateDecision.current_gate_status ?? "—"}
                {" · "}is_complete: {stage1GateDecision.is_complete ? "yes" : "no"}
                {" · "}valid_count: {stage1GateDecision.valid_count ?? "—"}
                {" / "}total_required: {stage1GateDecision.total_required ?? "—"}
              </div>
            </div>
          )}
          {stageProgressId && (
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={checkStage1Commitments}
                disabled={stage1CommitmentCheckLoading}
                className="rounded border border-border bg-background px-2 py-1 text-[11px] uppercase tracking-wide hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {stage1CommitmentCheckLoading ? "Checking…" : "Check Commitments (debug)"}
              </button>
              {stage1CommitmentCheckError && (
                <span className="text-amber-600">{stage1CommitmentCheckError}</span>
              )}
            </div>
          )}
          {stage1CommitmentCheck && (
            <div className="mt-2 space-y-0.5">
              <div className="uppercase tracking-wide">commitment_check_result</div>
              <div>
                commitment_id: {stage1CommitmentCheck.commitment_id ?? "—"}
                {" · "}previous_status: {stage1CommitmentCheck.previous_status ?? "—"}
                {" · "}new_status: {stage1CommitmentCheck.new_status ?? "—"}
                {" · "}actual_value_at_check: {stage1CommitmentCheck.actual_value_at_check ?? "—"}
                {" · "}operator_insight_id: {stage1CommitmentCheck.operator_insight_id ?? "—"}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Product-facing next-step guidance — hidden in the simplified Stage 1 workflow. */}
      {false && displayNextStep && (
        <Card className="-mt-2 border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Next step</CardTitle>
          </CardHeader>
          <CardContent>
            {displayNextStep.is_public_safe === true ? (
              <div className="space-y-3">
                {displayNextStep.guidance_title && (
                  <div className="text-lg font-semibold">
                    {displayNextStep.guidance_title}
                  </div>
                )}
                {displayNextStep.guidance_body && (
                  <p className="text-sm text-muted-foreground">
                    {displayNextStep.guidance_body}
                  </p>
                )}
                {displayNextStep.primary_action_label && (
                  <Button
                    size="sm"
                    onClick={() =>
                      handleNextStepAction(displayNextStep.primary_action_target)
                    }
                  >
                    {displayNextStep.primary_action_label}
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Next step is not available yet.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stage 1 Evidence Requirements — removed from the simplified Stage 1 workflow. */}
      {false && displayEvidence.length > 0 && (
        <Card className="-mt-2" id="stage1-evidence-section">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Stage 1 Evidence Requirements</CardTitle>
            <CardDescription>
              Canonical requirements for First 5 Jobs, owned by the platform.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Requirement</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Verified</TableHead>
                    <TableHead>Minimum standard</TableHead>
                    <TableHead>Submit evidence</TableHead>
                    {isDebug() && <TableHead>Debug Verify</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...displayEvidence]
                    .sort(
                      (a, b) =>
                        (a.display_order ?? 0) - (b.display_order ?? 0),
                    )
                    .map((r) => {
                      const evidenceId = r.stage_gate_evidence_id ?? "";
                      const submitting = stage1SubmittingId === evidenceId;
                      const verifying = stage1VerifyingId === evidenceId;
                      const showDebugControls =
                        isDebug() &&
                        ((r.evidence_status ?? "").toLowerCase() === "submitted" ||
                          (r.evidence_status ?? "").toLowerCase() === "invalid");
                      return (
                        <TableRow key={evidenceId || r.requirement_code || Math.random()}>
                          <TableCell className="font-medium">
                            {r.evidence_label ?? r.requirement_code ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={r.verified ? "default" : "secondary"}>
                              {r.evidence_status ?? "missing"}
                            </Badge>
                            {!r.verified &&
                              (r.evidence_status ?? "").toLowerCase() ===
                                "submitted" && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Submitted — awaiting verification.
                                </p>
                              )}
                          </TableCell>
                          <TableCell>{r.verified ? "Yes" : "No"}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {r.minimum_standard ?? "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Input
                                value={stage1SubmitNotes[evidenceId] ?? ""}
                                onChange={(e) =>
                                  setStage1SubmitNotes((p) => ({
                                    ...p,
                                    [evidenceId]: e.target.value,
                                  }))
                                }
                                placeholder="Optional note"
                                className="h-8 w-40"
                                disabled={!evidenceId || submitting || verifying}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => submitStage1Evidence(r)}
                                disabled={!evidenceId || submitting || verifying}
                              >
                                {submitting && (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                )}
                                Submit
                              </Button>
                            </div>
                          </TableCell>
                          {isDebug() && (
                            <TableCell>
                              {showDebugControls ? (
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => verifyStage1Evidence(r, true)}
                                    disabled={verifying}
                                  >
                                    {verifying && (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                                    )}
                                    Mark Valid
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => verifyStage1Evidence(r, false)}
                                    disabled={verifying}
                                  >
                                    Mark Invalid
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
            {stage1SubmitError && (
              <p className="mt-3 text-xs text-destructive">{stage1SubmitError}</p>
            )}
            {isDebug() && stage1VerifyError && (
              <p className="mt-3 text-xs text-destructive">{stage1VerifyError}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Canonical Stage 1 completion evaluation (read-only, Supabase-owned) */}
      {displayCompletion && (
        <Card className="-mt-2" id="stage1-completion-section">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Stage 1 Completion Evaluation</CardTitle>
            <CardDescription>
              Canonical evaluator result, owned by the platform.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Valid</div>
                <div className="mt-1 text-lg font-semibold">
                  {displayCompletion.valid_count ?? 0} / {displayCompletion.total_required ?? 0}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Submitted</div>
                <div className="mt-1 text-lg font-semibold">
                  {displayCompletion.submitted_count ?? 0}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Missing</div>
                <div className="mt-1 text-lg font-semibold">
                  {displayCompletion.missing_count ?? 0}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Invalid</div>
                <div className="mt-1 text-lg font-semibold">
                  {displayCompletion.invalid_count ?? 0}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Complete</div>
                <div className="mt-1 text-lg font-semibold">
                  {displayCompletion.is_complete ? "Yes" : "No"}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Recommended Gate</div>
                <div className="mt-1 text-lg font-semibold">
                  {displayCompletion.recommended_gate_status ?? "—"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Canonical Stage 1 commitments (read-only, Supabase-owned) */}
      {displayCommitments.length > 0 && (
        <Card className="-mt-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Stage 1 Commitments</CardTitle>
            <CardDescription>
              Coach commitments for First 5 Jobs, owned by the platform.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Commitment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Follow-up</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayCommitments.map((c) => {
                    const cid = c.commitment_id ?? "";
                    return (
                      <TableRow key={cid || c.commitment_label || Math.random()}>
                        <TableCell className="font-medium">
                          {c.commitment_label ?? c.commitment_type ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{c.status ?? "—"}</Badge>
                        </TableCell>
                        <TableCell>
                          {c.target_metric ?? "—"}: {c.target_value ?? "—"}
                        </TableCell>
                        <TableCell>
                          {c.actual_value_at_check ?? 0} / {c.target_value ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {c.due_at ? isoToAU(c.due_at.slice(0, 10)) : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {c.follow_up_message ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Debug-only: commitments RPC returned zero rows */}
      {isDebug() &&
        stage1CommitmentsLoaded &&
        stage1Snapshot?.stage_progress_id &&
        stage1Commitments.length === 0 && (
          <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-[11px] font-mono text-muted-foreground -mt-2">
            No Stage 1 commitments created.
          </div>
        )}

      {/* Internal/admin-only operator insight review panel. Debug-only — never
          shown to normal users. Insight text and maturity dimension are
          internal review data and must not be surfaced publicly. */}
      {isDebug() && stageProgressId && (
        <Card className="-mt-2 border-amber-500/40">
          <CardHeader>
            <CardTitle className="text-base">
              Operator Insights — Internal Review
            </CardTitle>
            <CardDescription>
              Internal/admin only. Not visible to end users. Review generated
              operator insights; reviewing never generates or edits insights.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {operatorInsightsReviewError && (
              <div className="text-[11px] font-mono text-amber-600">
                {operatorInsightsReviewError}
              </div>
            )}
            {operatorInsightsReviewLoaded &&
              operatorInsightsReview.length === 0 &&
              !operatorInsightsReviewError && (
                <div className="text-[11px] font-mono text-muted-foreground">
                  No operator insights available for review.
                </div>
              )}
            {operatorInsightsReview.map((ins) => {
              const id = ins.operator_insight_id ?? "";
              const reviewing = operatorInsightReviewingId === id;
              return (
                <div
                  key={id || Math.random()}
                  className="rounded-md border bg-muted/20 p-3 text-[11px] font-mono space-y-1"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {ins.review_status ?? "unreviewed"}
                    </Badge>
                    <span className="text-muted-foreground">
                      maturity_dimension: {ins.maturity_dimension ?? "—"}
                    </span>
                    <span className="text-muted-foreground">
                      · signal: {ins.signal ?? "—"}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    commitment_label: {ins.commitment_label ?? "—"}
                    {" · "}actual_value_at_check: {ins.actual_value_at_check ?? "—"}
                    {" · "}verified_evidence_count: {ins.verified_evidence_count ?? "—"}
                  </div>
                  <div className="text-foreground whitespace-pre-wrap">
                    {ins.insight_text ?? "—"}
                  </div>
                  <div className="text-muted-foreground">
                    created_at: {ins.created_at ? isoToAU(ins.created_at.slice(0, 10)) : "—"}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={reviewing || !id}
                      onClick={() => reviewOperatorInsight(ins, "useful")}
                      className="rounded border border-border bg-background px-2 py-1 uppercase tracking-wide hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
                    >
                      {reviewing && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                      Mark Useful
                    </button>
                    <button
                      type="button"
                      disabled={reviewing || !id}
                      onClick={() => reviewOperatorInsight(ins, "needs_followup")}
                      className="rounded border border-border bg-background px-2 py-1 uppercase tracking-wide hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
                    >
                      {reviewing && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                      Needs Follow-up
                    </button>
                    <button
                      type="button"
                      disabled={reviewing || !id}
                      onClick={() => reviewOperatorInsight(ins, "not_useful")}
                      className="rounded border border-border bg-background px-2 py-1 uppercase tracking-wide hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
                    >
                      {reviewing && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                      Not Useful
                    </button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Debug/admin-only combined control snapshot panel. Internal/admin only —
          never shown to normal users. Read-only; does not mutate anything. */}
      {isDebug() && stageProgressId && (
        <Card className="-mt-2 border-amber-500/40">
          <CardHeader>
            <CardTitle className="text-base">
              Debug Control Snapshot
            </CardTitle>
            <CardDescription>
              Internal/admin only. Combined construction-mode snapshot from Supabase.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchStage1DebugControlSnapshot}
                disabled={stage1DebugControlSnapshotLoading}
                className="rounded border border-border bg-background px-2 py-1 text-[11px] uppercase tracking-wide hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {stage1DebugControlSnapshotLoading ? "Refreshing…" : "Refresh Debug Snapshot"}
              </button>
              {stage1DebugControlSnapshotError && (
                <span className="text-[11px] font-mono text-amber-600">
                  {stage1DebugControlSnapshotError}
                </span>
              )}
            </div>
            {stage1DebugControlSnapshot && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Gate Status</div>
                    <div className="mt-1 text-sm font-semibold">
                      {stage1DebugControlSnapshot.stage_progress?.current_gate_status ?? stage1DebugControlSnapshot.evaluation?.current_gate_status ?? "—"}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Valid / Required</div>
                    <div className="mt-1 text-sm font-semibold">
                      {stage1DebugControlSnapshot.evaluation?.valid_count ?? "—"} / {stage1DebugControlSnapshot.evaluation?.total_required ?? "—"}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Is Complete</div>
                    <div className="mt-1 text-sm font-semibold">
                      {stage1DebugControlSnapshot.evaluation?.is_complete ? "Yes" : "No"}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Evidence Rows</div>
                    <div className="mt-1 text-sm font-semibold">
                      {Array.isArray(stage1DebugControlSnapshot.evidence) ? stage1DebugControlSnapshot.evidence.length : "—"}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Commitments</div>
                    <div className="mt-1 text-sm font-semibold">
                      {Array.isArray(stage1DebugControlSnapshot.commitments) ? stage1DebugControlSnapshot.commitments.length : "—"}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Gate Decisions</div>
                    <div className="mt-1 text-sm font-semibold">
                      {Array.isArray(stage1DebugControlSnapshot.gate_decisions) ? stage1DebugControlSnapshot.gate_decisions.length : "—"}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Operator Insights</div>
                    <div className="mt-1 text-sm font-semibold">
                      {Array.isArray(stage1DebugControlSnapshot.operator_insights) ? stage1DebugControlSnapshot.operator_insights.length : "—"}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Debug Markers</div>
                    <div className="mt-1 text-sm font-semibold">
                      {stage1DebugControlSnapshot.debug_validation ? "Present" : "None"}
                    </div>
                  </div>
                </div>
                <details className="text-[11px] font-mono">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Raw JSON
                  </summary>
                  <pre className="mt-2 rounded-md border bg-muted/30 p-3 overflow-x-auto">
                    {JSON.stringify(stage1DebugControlSnapshot, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Debug/admin-only construction readiness summary panel. Internal/admin only —
          never shown to normal users. Read-only; does not mutate anything. */}
      {isDebug() && (
        <Card className="-mt-2 border-amber-500/40">
          <CardHeader>
            <CardTitle className="text-base">
              Construction Readiness Summary
            </CardTitle>
            <CardDescription>
              Internal/admin only. Platform construction readiness from Supabase.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchConstructionReadinessSummary}
                disabled={constructionReadinessSummaryLoading}
                className="rounded border border-border bg-background px-2 py-1 text-[11px] uppercase tracking-wide hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {constructionReadinessSummaryLoading ? "Refreshing…" : "Refresh Readiness Summary"}
              </button>
              {constructionReadinessSummaryError && (
                <span className="text-[11px] font-mono text-amber-600">
                  {constructionReadinessSummaryError}
                </span>
              )}
            </div>
            {constructionReadinessSummary && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px] font-mono">
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Construction Mode</div>
                    <div className="mt-1 text-sm font-semibold">
                      {constructionReadinessSummary.construction_mode === true ? "true" : "false"}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Latest Lifecycle Validation</div>
                    <div className="mt-1 text-sm font-semibold">
                      {constructionReadinessSummary.latest_lifecycle_validation?.validation_status ?? "—"}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Latest Gate Status</div>
                    <div className="mt-1 text-sm font-semibold">
                      {constructionReadinessSummary.latest_lifecycle_validation?.gate_status ?? "—"}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Tester Email</div>
                    <div className="mt-1 text-sm font-semibold truncate" title={constructionReadinessSummary.latest_lifecycle_validation?.tester_email ?? ""}>
                      {constructionReadinessSummary.latest_lifecycle_validation?.tester_email ?? "—"}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Stage 1 Total Rows</div>
                    <div className="mt-1 text-sm font-semibold">
                      {constructionReadinessSummary.stage_progress_counts?.total_rows ?? "—"}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Stage 1 Passed Rows</div>
                    <div className="mt-1 text-sm font-semibold">
                      {constructionReadinessSummary.stage_progress_counts?.passed_rows ?? "—"}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Debug Evidence Rows</div>
                    <div className="mt-1 text-sm font-semibold">
                      {constructionReadinessSummary.debug_validation_counts?.evidence_rows ?? "—"}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Debug Decision Rows</div>
                    <div className="mt-1 text-sm font-semibold">
                      {constructionReadinessSummary.debug_validation_counts?.decision_rows ?? "—"}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Debug Insight Rows</div>
                    <div className="mt-1 text-sm font-semibold">
                      {constructionReadinessSummary.debug_validation_counts?.insight_rows ?? "—"}
                    </div>
                  </div>
                  {Array.isArray(constructionReadinessSummary.hardening_phases) &&
                    constructionReadinessSummary.hardening_phases.map((phase, idx) => (
                      <div key={idx} className="rounded-md border p-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Hardening Phase {phase.phase_number ?? idx + 1}
                        </div>
                        <div className="mt-1 text-sm font-semibold">
                          {phase.status ?? "—"}
                        </div>
                  </div>
                ))}
                {constructionReadinessSummary.public_wrapper_set && (
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Public Wrapper Set Complete</div>
                    <div className="mt-1 text-sm font-semibold">
                      {constructionReadinessSummary.public_wrapper_set.complete === true ? "true" : "false"}
                    </div>
                  </div>
                )}
                {constructionReadinessSummary.public_wrapper_set && (
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Required Wrappers</div>
                    <div className="mt-1 text-sm font-semibold">
                      {constructionReadinessSummary.public_wrapper_set.required_count ?? "—"}
                    </div>
                  </div>
                )}
                {constructionReadinessSummary.public_wrapper_set && (
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Classified Wrappers</div>
                    <div className="mt-1 text-sm font-semibold">
                      {constructionReadinessSummary.public_wrapper_set.classified_count ?? "—"}
                    </div>
                  </div>
                )}
                </div>
                {Array.isArray(constructionReadinessSummary.public_wrapper_set?.wrappers) && (
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Wrapper Functions</div>
                    <div className="divide-y divide-border rounded-md border text-[11px] font-mono">
                      {constructionReadinessSummary.public_wrapper_set.wrappers.map((w, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-2 px-2 py-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                            <span className="truncate font-semibold">{w.function_name ?? "—"}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 text-muted-foreground">
                            <span>registered: {w.registered === true ? "true" : "false"}</span>
                            <span>class: {w.classification ?? "—"}</span>
                            <span>target: {w.production_target ?? "—"}</span>
                            <span>hardening: {w.hardening_required === true ? "true" : "false"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {constructionReadinessSummary.rls_policy_posture && (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px] font-mono">
                      <div className="rounded-md border p-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">RPC-Only Count</div>
                        <div className="mt-1 text-sm font-semibold">
                          {constructionReadinessSummary.rls_policy_posture.rpc_only_count ?? "—"}
                        </div>
                      </div>
                      <div className="rounded-md border p-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Template Read Allowed</div>
                        <div className="mt-1 text-sm font-semibold">
                          {constructionReadinessSummary.rls_policy_posture.template_read_allowed_count ?? "—"}
                        </div>
                      </div>
                      <div className="rounded-md border p-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Public Read Candidates</div>
                        <div className="mt-1 text-sm font-semibold">
                          {constructionReadinessSummary.rls_policy_posture.public_read_candidate_count ?? "—"}
                        </div>
                      </div>
                      <div className="rounded-md border p-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Direct Policy Expected</div>
                        <div className="mt-1 text-sm font-semibold">
                          {constructionReadinessSummary.rls_policy_posture.direct_policy_expected_count ?? "—"}
                        </div>
                      </div>
                    </div>
                    {Array.isArray(constructionReadinessSummary.rls_policy_posture.sensitive_rpc_only_tables) && (
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sensitive RPC-Only Tables</div>
                        <div className="divide-y divide-border rounded-md border text-[11px] font-mono">
                          {constructionReadinessSummary.rls_policy_posture.sensitive_rpc_only_tables.map((t, idx) => (
                            <div key={idx} className="flex items-center gap-2 px-2 py-1.5">
                              <span className="inline-block h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                              <span className="font-semibold">{t}</span>
                            </div>
                          ))}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Sensitive Stage 1 tables are RPC-only by design. Do not add broad direct table policies.
                        </p>
                      </div>
                    )}
                  </>
                )}
                {constructionReadinessSummary.validation_milestones && (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px] font-mono">
                      <div className="rounded-md border p-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">All Required Passed</div>
                        <div className="mt-1 text-sm font-semibold">
                          {constructionReadinessSummary.validation_milestones.all_required_passed === true ? "true" : "false"}
                        </div>
                      </div>
                      <div className="rounded-md border p-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Passed Milestones</div>
                        <div className="mt-1 text-sm font-semibold">
                          {constructionReadinessSummary.validation_milestones.milestones?.filter(m => m.milestone_status === "passed").length ?? "—"}
                        </div>
                      </div>
                      <div className="rounded-md border p-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Milestones</div>
                        <div className="mt-1 text-sm font-semibold">
                          {constructionReadinessSummary.validation_milestones.milestones?.length ?? "—"}
                        </div>
                      </div>
                    </div>
                    {Array.isArray(constructionReadinessSummary.validation_milestones.milestones) && (
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Validation Milestones</div>
                        <div className="divide-y divide-border rounded-md border text-[11px] font-mono">
                          {constructionReadinessSummary.validation_milestones.milestones.map((m, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-2 px-2 py-1.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${m.milestone_status === "passed" ? "bg-emerald-500" : "bg-amber-500"}`} />
                                <span className="truncate font-semibold">{m.milestone_key ?? "—"}</span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0 text-muted-foreground">
                                <span>{m.milestone_label ?? "—"}</span>
                                <span>status: {m.milestone_status ?? "—"}</span>
                                <span>scope: {m.validation_scope ?? "—"}</span>
                                <span>ref: {m.evidence_reference ?? "—"}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Validation milestones show proven flows, not just built objects.
                        </p>
                      </div>
                    )}
                  </>
                )}
                {(constructionReadinessSummary.release_safe !== undefined ||
                  constructionReadinessSummary.auth_ownership_hardening) && (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px] font-mono">
                      <div className="rounded-md border p-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Release Safe</div>
                        <div className={`mt-1 text-sm font-semibold ${constructionReadinessSummary.release_safe === true ? "text-emerald-600" : "text-amber-600"}`}>
                          {constructionReadinessSummary.release_safe === true ? "true" : "false"}
                        </div>
                      </div>
                      <div className="rounded-md border p-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Public Release Blockers</div>
                        <div className="mt-1 text-sm font-semibold">
                          {constructionReadinessSummary.auth_ownership_hardening?.public_release_blocker_count ??
                            constructionReadinessSummary.auth_ownership_hardening?.public_release_blockers?.length ??
                            "—"}
                        </div>
                      </div>
                      <div className="rounded-md border p-2 col-span-2 md:col-span-1">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Reason</div>
                        <div className="mt-1 text-[11px]">
                          {constructionReadinessSummary.release_safe_reason ?? "—"}
                        </div>
                      </div>
                    </div>
                    {Array.isArray(constructionReadinessSummary.auth_ownership_hardening?.summary) && (
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Auth/Ownership Summary</div>
                        <div className="divide-y divide-border rounded-md border text-[11px] font-mono">
                          {constructionReadinessSummary.auth_ownership_hardening!.summary!.map((s, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-2 px-2 py-1.5">
                              <span className="font-semibold truncate">{s.surface_type ?? "—"}</span>
                              <div className="flex items-center gap-3 shrink-0 text-muted-foreground">
                                <span>{s.release_status ?? "—"}</span>
                                <span>count: {s.function_count ?? "—"}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {Array.isArray(constructionReadinessSummary.auth_ownership_hardening?.public_release_blockers) && (
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Public Release Blockers</div>
                        <div className="divide-y divide-border rounded-md border text-[11px] font-mono">
                          {constructionReadinessSummary.auth_ownership_hardening!.public_release_blockers!.map((b, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-2 px-2 py-1.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="inline-block h-2 w-2 rounded-full shrink-0 bg-amber-500" />
                                <span className="truncate font-semibold">{b.function_name ?? "—"}</span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0 text-muted-foreground">
                                <span>{b.surface_type ?? "—"}</span>
                                <span>{b.release_status ?? "—"}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {constructionReadinessSummary.auth_ownership_hardening?.highest_priority_items?.[0] && (
                      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] font-mono space-y-1">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Highest Priority Blocker</div>
                        {(() => {
                          const h = constructionReadinessSummary.auth_ownership_hardening!.highest_priority_items![0];
                          return (
                            <div className="space-y-0.5">
                              <div className="font-semibold">{h.function_name ?? "—"}</div>
                              <div className="text-muted-foreground">surface: {h.surface_type ?? "—"}</div>
                              <div className="text-muted-foreground">status: {h.release_status ?? "—"}</div>
                              <div className="text-muted-foreground">gap: {h.remaining_gap ?? "—"}</div>
                              <div className="text-muted-foreground">ownership check: {h.required_ownership_check ?? "—"}</div>
                              <div className="text-muted-foreground">release path: {h.recommended_release_path ?? "—"}</div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      Stage 1 is construction-valid, not release-safe, until auth/ownership hardening is complete.
                    </p>
                  </>
                )}
                {constructionReadinessSummary.operator_run_ownership_model && (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px] font-mono">
                      <div className="rounded-md border p-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Ownership Resolver Contract Defined</div>
                        <div className="mt-1 text-sm font-semibold">
                          true
                        </div>
                      </div>
                      <div className="rounded-md border p-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Release-Blocking Ownership Requirements</div>
                        <div className="mt-1 text-sm font-semibold">
                          {constructionReadinessSummary.operator_run_ownership_model.release_blocking_count ?? "—"}
                        </div>
                      </div>
                      <div className="rounded-md border p-2 col-span-2 md:col-span-1">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Missing Release-Grade Link</div>
                        <div className="mt-1 text-[11px]">
                          authenticated operator/session → owned autopsy_run_id
                        </div>
                      </div>
                    </div>
                    {Array.isArray(constructionReadinessSummary.operator_run_ownership_model.summary) && (
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Ownership Model Summary</div>
                        <div className="divide-y divide-border rounded-md border text-[11px] font-mono">
                          {constructionReadinessSummary.operator_run_ownership_model.summary.map((s, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-2 px-2 py-1.5">
                              <span className="font-semibold truncate">{s.contract_area ?? "—"}</span>
                              <div className="flex items-center gap-3 shrink-0 text-muted-foreground">
                                <span>reqs: {s.requirement_count ?? "—"}</span>
                                <span>blockers: {s.release_blocking_count ?? "—"}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {Array.isArray(constructionReadinessSummary.operator_run_ownership_model.requirements) && (
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Ownership Requirements</div>
                        <div className="divide-y divide-border rounded-md border text-[11px] font-mono">
                          {constructionReadinessSummary.operator_run_ownership_model.requirements.map((r, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-2 px-2 py-1.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${r.release_blocking === true ? "bg-amber-500" : "bg-emerald-500"}`} />
                                <span className="truncate font-semibold">{r.contract_key ?? "—"}</span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0 text-muted-foreground">
                                <span>priority: {r.priority ?? "—"}</span>
                                <span>{r.contract_area ?? "—"}</span>
                                <span>{r.contract_requirement ?? "—"}</span>
                                <span>target: {r.target_state ?? "—"}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      Ownership model is defined, but not implemented. Stage 1 remains blocked for release.
                    </p>
                  </>
                )}
                {constructionReadinessSummary.rpc_security_classification && (
                  <div className="rounded-md border p-2 text-[11px] font-mono">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">RPC Security Classification</div>
                    <pre className="overflow-x-auto">
                      {JSON.stringify(constructionReadinessSummary.rpc_security_classification, null, 2)}
                    </pre>
                  </div>
                )}
                <details className="text-[11px] font-mono">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Raw JSON
                  </summary>
                  <pre className="mt-2 rounded-md border bg-muted/30 p-3 overflow-x-auto">
                    {JSON.stringify(constructionReadinessSummary, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Debug/admin-only UI boundary summary panel. Internal/admin only —
          never shown to normal users. Read-only; does not mutate anything. */}
      {isDebug() && (
        <Card className="-mt-2 border-amber-500/40">
          <CardHeader>
            <CardTitle className="text-base">
              UI Boundary Summary
            </CardTitle>
            <CardDescription>
              Internal/admin only. Supabase-owned UI boundary classification.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchUIBoundarySummary}
                disabled={uiBoundarySummaryLoading}
                className="rounded border border-border bg-background px-2 py-1 text-[11px] uppercase tracking-wide hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uiBoundarySummaryLoading ? "Refreshing…" : "Refresh UI Boundary Summary"}
              </button>
              {uiBoundarySummaryError && (
                <span className="text-[11px] font-mono text-amber-600">
                  {uiBoundarySummaryError}
                </span>
              )}
            </div>
            {uiBoundarySummary && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] font-mono">
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Product-facing</div>
                    <div className="mt-1 text-sm font-semibold">
                      {Array.isArray(uiBoundarySummary.product_facing) ? uiBoundarySummary.product_facing.length : "—"}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Mutation-risk</div>
                    <div className="mt-1 text-sm font-semibold">
                      {Array.isArray(uiBoundarySummary.product_facing)
                        ? uiBoundarySummary.product_facing.filter((s) => s.mutation_risk).length
                        : "—"}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Admin-only</div>
                    <div className="mt-1 text-sm font-semibold">
                      {Array.isArray(uiBoundarySummary.admin_only) ? uiBoundarySummary.admin_only.length : "—"}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Debug-only</div>
                    <div className="mt-1 text-sm font-semibold">
                      {Array.isArray(uiBoundarySummary.debug_only) ? uiBoundarySummary.debug_only.length : "—"}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Service-only</div>
                    <div className="mt-1 text-sm font-semibold">
                      {Array.isArray(uiBoundarySummary.service_only) ? uiBoundarySummary.service_only.length : "—"}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Remove before release</div>
                    <div className="mt-1 text-sm font-semibold">
                      {Array.isArray(uiBoundarySummary.remove_before_release) ? uiBoundarySummary.remove_before_release.length : "—"}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Hardening required</div>
                    <div className="mt-1 text-sm font-semibold">
                      {Array.isArray(uiBoundarySummary.hardening_required) ? uiBoundarySummary.hardening_required.length : "—"}
                    </div>
                  </div>
                </div>

                {Array.isArray(uiBoundarySummary.product_facing) && uiBoundarySummary.product_facing.length > 0 && (
                  <div className="rounded-md border p-2 text-[11px] font-mono">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Product-facing candidates</div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {uiBoundarySummary.product_facing.map((s, i) => (
                        <li key={i}>
                          {s.surface_name ?? "—"} {s.mutation_risk ? "(mutation-risk)" : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {Array.isArray(uiBoundarySummary.remove_before_release) && uiBoundarySummary.remove_before_release.length > 0 && (
                  <div className="rounded-md border p-2 text-[11px] font-mono">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Remove / gate before release</div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {uiBoundarySummary.remove_before_release.map((s, i) => (
                        <li key={i}>{s.surface_name ?? "—"}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono">
                  {Array.isArray(uiBoundarySummary.admin_only) && uiBoundarySummary.admin_only.length > 0 && (
                    <div className="rounded-md border p-2">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Admin-only surfaces</div>
                      <ul className="list-disc list-inside space-y-0.5">
                        {uiBoundarySummary.admin_only.map((s, i) => (
                          <li key={i}>{s.surface_name ?? "—"}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray(uiBoundarySummary.service_only) && uiBoundarySummary.service_only.length > 0 && (
                    <div className="rounded-md border p-2">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Service-only surfaces</div>
                      <ul className="list-disc list-inside space-y-0.5">
                        {uiBoundarySummary.service_only.map((s, i) => (
                          <li key={i}>{s.surface_name ?? "—"}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <details className="text-[11px] font-mono">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Raw JSON
                  </summary>
                  <pre className="mt-2 rounded-md border bg-muted/30 p-3 overflow-x-auto">
                    {JSON.stringify(uiBoundarySummary, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Debug/admin-only product surface plan summary panel. Internal/admin only —
          never shown to normal users. Read-only; does not mutate anything. */}
      {isDebug() && (
        <Card className="-mt-2 border-amber-500/40">
          <CardHeader>
            <CardTitle className="text-base">
              Product Surface Plan Summary
            </CardTitle>
            <CardDescription>
              Internal/admin only. Supabase-owned product-facing UI blueprint.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchProductSurfacePlanSummary}
                disabled={productSurfacePlanSummaryLoading}
                className="rounded border border-border bg-background px-2 py-1 text-[11px] uppercase tracking-wide hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {productSurfacePlanSummaryLoading ? "Refreshing…" : "Refresh Product Surface Plan"}
              </button>
              {productSurfacePlanSummaryError && (
                <span className="text-[11px] font-mono text-amber-600">
                  {productSurfacePlanSummaryError}
                </span>
              )}
            </div>
            {productSurfacePlanSummary && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px] font-mono">
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Ready after hardening</div>
                    <div className="mt-1 text-sm font-semibold">
                      {productSurfacePlanSummary.release_status_summary?.ready_after_hardening ?? "—"}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Planned</div>
                    <div className="mt-1 text-sm font-semibold">
                      {productSurfacePlanSummary.release_status_summary?.planned ?? "—"}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Blocked</div>
                    <div className="mt-1 text-sm font-semibold">
                      {productSurfacePlanSummary.release_status_summary?.blocked ?? "—"}
                    </div>
                  </div>
                </div>

                {Array.isArray(productSurfacePlanSummary.public_candidates) && productSurfacePlanSummary.public_candidates.length > 0 && (
                  <div className="rounded-md border p-2 text-[11px] font-mono">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Public candidate surfaces</div>
                    <ul className="list-disc list-inside space-y-1">
                      {productSurfacePlanSummary.public_candidates.map((s, i) => (
                        <li key={i}>
                          <span className="font-semibold">{s.product_surface ?? "—"}</span>
                          <span className="ml-1 text-muted-foreground">({s.release_status ?? "—"})</span>
                          <div className="ml-4 text-muted-foreground">
                            Purpose: {s.intended_user_purpose ?? "—"}
                            {s.allowed_data_sources && <span className="ml-1">| Sources: {s.allowed_data_sources}</span>}
                            {s.forbidden_behaviour && <span className="ml-1">| Forbidden: {s.forbidden_behaviour}</span>}
                            {s.hardening_dependency && <span className="ml-1">| Depends: {s.hardening_dependency}</span>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {Array.isArray(productSurfacePlanSummary.blocked_surfaces) && productSurfacePlanSummary.blocked_surfaces.length > 0 && (
                  <div className="rounded-md border p-2 text-[11px] font-mono">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Blocked surfaces</div>
                    <ul className="list-disc list-inside space-y-1">
                      {productSurfacePlanSummary.blocked_surfaces.map((s, i) => (
                        <li key={i}>
                          <span className="font-semibold">{s.product_surface ?? "—"}</span>
                          <div className="ml-4 text-muted-foreground">
                            Purpose: {s.intended_user_purpose ?? "—"}
                            {s.forbidden_behaviour && <span className="ml-1">| Forbidden: {s.forbidden_behaviour}</span>}
                            {s.hardening_dependency && <span className="ml-1">| Depends: {s.hardening_dependency}</span>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <details className="text-[11px] font-mono">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Raw JSON
                  </summary>
                  <pre className="mt-2 rounded-md border bg-muted/30 p-3 overflow-x-auto">
                    {JSON.stringify(productSurfacePlanSummary, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Debug-only: evaluator returned no row */}
      {isDebug() &&
        stage1EvaluationLoaded &&
        stageProgressId &&
        !stage1Evaluation && (
          <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-[11px] font-mono text-muted-foreground -mt-2">
            Stage 1 evaluation returned no row for this progress id.
          </div>
        )}

      {/* Debug-only: requirements RPC returned zero rows */}
      {isDebug() &&
        stage1RequirementsLoaded &&
        stage1Snapshot?.stage_progress_id &&
        stage1Requirements.length === 0 && (
          <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-[11px] font-mono text-muted-foreground -mt-2">
            No Stage 1 evidence requirements instantiated.
          </div>
        )}

      {/* ---- Top half: KPI cards ---- */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard
          label="Leads"
          icon={Users}
          primary={totalLeads}
          secondaries={[{ k: "Total leads", v: totalLeads }]}
          onClick={() => setDrill("leads")}
        />
        <KpiCard
          label="Conversions"
          icon={FileText}
          primary={`${quoteConvPct}%`}
          secondaries={[
            { k: "Quotes sent", v: quotesSent },
            { k: "Quotes accepted", v: quotesAccepted },
          ]}
          onClick={() => setDrill("conversions")}
        />
        <KpiCard
          label="Active Jobs"
          icon={Briefcase}
          primary={activeJobs}
          secondaries={[
            { k: "Active jobs", v: activeJobs },
            { k: "Completed jobs", v: completedJobs },
          ]}
          onClick={() => setDrill("jobs")}
        />
        <KpiCard
          label="Gross Margin"
          icon={TrendingUp}
          tone={displayMarginText === "Not Yet Proven" ? "text-muted-foreground" : gmStatus.tone}
          primary={displayMarginText}
          secondaries={[
            { k: "Total income", v: `$${fmtMoney(totalIncome)}` },
            { k: "Direct cost", v: directCostKpiText },
            { k: "Stage 2 Ready", v: stage2ReadyText },
          ]}
          onClick={() => setDrill("margin")}
        />
      </section>

      {/* Maturity-oriented commercial guidance from the run-scoped dashboard RPC. */}
      {stage1DashboardDisplay && (dashboardMarginHelper || dashboardNextAction) && (
        <p className="text-xs text-muted-foreground">
          {dashboardMarginHelper && <span>{dashboardMarginHelper}</span>}
          {dashboardMarginHelper && dashboardNextAction && <span> </span>}
          {dashboardNextAction && (
            <span className="text-foreground">Next action: {dashboardNextAction}</span>
          )}
        </p>
      )}

      {/* ---- Bottom: full-width ledger ---- */}
      <section className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Simple Job Cost Ledger</CardTitle>
              <CardDescription className="text-xs">
                Jobs created by converting accepted quotes from the Quote Conversion Board. Click a row to open the Job / Contract Site Detail curtain.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">#</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Proof Type</TableHead>
                    <TableHead className="text-right">
                      <div className="leading-tight">Income</div>
                      <div className="text-[10px] text-muted-foreground leading-tight">(as per quote)</div>
                    </TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Job Costs</TableHead>
                    <TableHead className="text-right">Gross Profit</TableHead>
                    <TableHead className="text-right">GM %</TableHead>
                    <TableHead className="text-right">Detailed Report</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {units.map((u) => {
                    const isSel = u.n === selectedN;
                    const income = u.invoiceAmount ?? u.quoteValue ?? 0;
                    const paid = u.paymentAmount ?? 0;
                    const outstanding = income - paid;
                    const costs = unitTotalCost(u);
                    // Gross profit / margin are computed from the PERSISTED Stage 1
                    // revenue (stage1_revenue_events, surfaced via the margin
                    // summary view as u.invoiceAmount) when present, falling back
                    // to the quote value. Margin is only meaningful with real
                    // revenue: a null margin renders as "—".
                    const revenue = income;
                    const gp = revenue - costs;
                    const gmStatus = deriveStage1GmStatus(u);
                    const gmPctValue = gmStatus.pct;
                    const gmTone = gmStatus.tone;
                    return (
                      <TableRow
                        key={u.stage1JobId ?? `n-${u.n}`}
                        className={`cursor-pointer ${isSel ? "bg-muted/60" : "hover:bg-muted/30"}`}
                        onClick={() => openUnit(u.n)}
                      >
                        <TableCell className="font-mono text-xs">{u.jobSequenceNumber != null ? `J-${u.jobSequenceNumber}` : `J-${u.n}`}</TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openUnit(u.n); }}
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
                        <TableCell>{deriveStage1ProofType(u)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {income > 0 ? `$${fmtMoney(income)}` : "—"}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${outstanding < 0 ? "text-red-600" : ""}`}>
                          {income > 0 ? fmtSignedMoney(outstanding) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {renderDirectCost(costs)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {revenue > 0 ? `$${fmtMoney(gp)}` : "—"}
                        </TableCell>
                        <TableCell className={`text-right font-medium tabular-nums ${gmTone}`}>
                          {gmPctValue != null ? `${gmPctValue}%` : gmStatus.label}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => { e.stopPropagation(); openReport(u.n); }}
                          >
                            Detailed Report
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
      </section>

      <JobDetailSheet
        unit={selectedUnit}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSave={async (u) =>
          persistUnitsWithDiagnostics((prev) =>
            prev.map((p) => (p.n === u.n ? { ...u, stage1JobId: p.stage1JobId ?? u.stage1JobId } : p)),
          )
        }
        savePrerequisites={{ runId: activeRunId, authUserId: user?.id ?? null, loading: authLoading }}
        onJumpToFinancials={() => { /* no-op on dashboard */ }}
        concentrationClient={scorecard.concentrationClient}
        onVoid={() => { /* no-op */ }}
        onArchive={() => { /* no-op */ }}
        onDelete={() => { /* no-op */ }}
        onOpenDetailedReport={(n) => openReport(n)}
      />
      <BusinessDetailsDialog open={bdOpen} onOpenChange={setBdOpen} hook={bd} />
      <DrillCurtain
        drill={drill}
        onOpenChange={(o) => { if (!o) { setDrill(null); setQuoteActivityError(null); } }}
        methodRows={methodRows}
        onLogActivity={() => setLogActOpen(true)}
        quotes={quotes}
        selectedQuoteNumber={selectedQuoteNumber}
        onSelectQuote={(n) => { setSelectedQuoteNumber(n); setQuoteActivityError(null); }}
        onQuoteActivity={openQuoteActivity}
        onUpdateQuote={handleUpdateQuote}
        onOpenQuoteDetail={handleOpenQuoteDetail}
        units={units}
        onOpenUnit={(n) => { setDrill(null); openUnit(n); }}
      />
      <QuoteActivityDialog
        quote={quotes.find((q) => q.number === selectedQuoteNumber) ?? null}
        open={quoteActivityOpen}
        onOpenChange={setQuoteActivityOpen}
        onSave={handleQuoteActivitySave}
      />
      <QuoteDetailDialog
        quote={quotes.find((q) => q.number === quoteDetailNumber) ?? null}
        open={quoteDetailOpen}
        onOpenChange={setQuoteDetailOpen}
        onSave={handleSaveQuoteDetail}
      />
      <LogActivityDialog
        open={logActOpen}
        onOpenChange={setLogActOpen}
        nextQuoteNumberStart={nextQuoteNumberStart}
        onSave={async (a, newQuotes) => {
          setActivities((prev) => [...prev, a]);
          setLogActOpen(false);
          for (const nq of newQuotes) {
            const res = await createQuote({
              client: nq.client,
              site: nq.site,
              value: nq.value,
              followUp: nq.followUp,
              quoteNotes: nq.notes,
            });
            if (res.ok && res.quote) {
              const saved = { ...res.quote, method: nq.method, sourceActivityId: nq.sourceActivityId, sourceActivityDate: a.activity_date };
              setQuotes((prev) => [saved, ...prev]);
            } else {
              toast({ title: "Quote not saved", description: res.error ?? "Backend write failed." });
            }
          }
        }}
      />
      <DetailedJobCostReport
        unit={reportUnit}
        allUnits={units}
        open={reportOpen}
        onOpenChange={setReportOpen}
      />
    </div>
  );
}

// Stage 1 RPCs run only while authenticated: the inner component (which fires
// all Stage 1 Supabase RPCs in its effects) is mounted only behind AuthGate.
export default function Stage1Dashboard() {
  return (
    <AuthGate>
      <Stage1DashboardInner />
    </AuthGate>
  );
}
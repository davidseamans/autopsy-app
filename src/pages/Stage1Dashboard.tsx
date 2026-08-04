Warning: truncated output (original token count: 55872)
Total output lines: 4735

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  SEED_UNITS,
  computeScorecard,
  JobDetailSheet,
  type ProofUnit,
} from "./Stage1";
import { supabase, isDebug } from "@/lib/supabase";
import { computeGstSplit } from "@/lib/gst";
import { AuthGate } from "@/components/AuthGate";
import { useAuth } from "@/lib/auth";
import {
  setQuoteOutcome,
  convertQuoteToJob,
  loadStage1Board,
} from "@/lib/jobProvisioning";
import { getActiveRunId, getStage1RunId, setStage1RunId } from "@/lib/progression";
import { fetchBusinessIdentity, type PublicBusinessProfile } from "@/lib/businessIdentity";
import { fetchStage1Onboarding } from "@/lib/stage1Onboarding";
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
  Compass,
  BookOpen,
  ShieldAlert,
} from "lucide-react";
import { DetailedJobCostReport } from "@/components/DetailedJobCostReport";
import { Stage1TourResume, Stage1WelcomeGuide } from "@/components/Stage1WelcomeGuide";

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
const DEMO_METHOD_BASELINE: typeof METHOD_BASELINE = [
  { method: "Referral Request", attempts: 12, contacts: 10, leads: 9, quotes: 4, jobs: 1, notes: "Introductions from established local contacts" },
  { method: "Phone Outreach", attempts: 30, contacts: 14, leads: 8, quotes: 3, jobs: 1, notes: "Targeted calls to nearby commercial premises" },
  { method: "Local Flyer", attempts: 250, contacts: 11, leads: 8, quotes: 3, jobs: 1, notes: "Focused distribution around selected business precincts" },
];
const METHOD_OPTIONS = [
  "Phone Outreach",
  "Customer Referral",
  "Personal Referral",
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
const DEMO_QUOTES: Quote[] = [
  { number: "Q-1001", client: "Riverstone Dental Centre", site: "Paddington, QLD", value: 2035, status: "Accepted", quoteDate: "2026-07-08", followUp: "", reason: "", converted: true, convertedToN: 1, convertedJobNumber: "J-1", method: "Referral Request" },
  { number: "Q-1002", client: "Milton Legal Chambers", site: "Milton, QLD", value: 2640, status: "Accepted", quoteDate: "2026-07-09", followUp: "", reason: "", converted: true, convertedToN: 2, convertedJobNumber: "J-2", method: "Phone Outreach" },
  { number: "Q-1003", client: "Newstead Allied Health", site: "Newstead, QLD", value: 1760, status: "Accepted", quoteDate: "2026-07-10", followUp: "", reason: "", converted: true, convertedToN: 3, convertedJobNumber: "J-3", method: "Local Flyer" },
  { number: "Q-1004", client: "Paddington Property Group", site: "Paddington, QLD", value: 1450, status: "Sent", quoteDate: "2026-07-11", followUp: "2026-07-22", reason: "", method: "Referral Request" },
  { number: "Q-1005", client: "Ashgrove Physio Centre", site: "Ashgrove, QLD", value: 1320, status: "Sent", quoteDate: "2026-07-11", followUp: "2026-07-23", reason: "", method: "Phone Outreach" },
  { number: "Q-1006", client: "West End Studios", site: "West End, QLD", value: 980, status: "Declined", quoteDate: "2026-07-12", followUp: "", reason: "Scope changed", method: "Local Flyer" },
  { number: "Q-1007", client: "Teneriffe Accountants", site: "Teneriffe, QLD", value: 2100, status: "Sent", quoteDate: "2026-07-13", followUp: "2026-07-24", reason: "", method: "Referral Request" },
  { number: "Q-1008", client: "Bulimba Veterinary Clinic", site: "Bulimba, QLD", value: 1680, status: "Sent", quoteDate: "2026-07-14", followUp: "2026-07-25", reason: "", method: "Phone Outreach" },
  { number: "Q-1009", client: "Spring Hill Medical Suites", site: "Spring Hill, QLD", value: 2860, status: "Declined", quoteDate: "2026-07-15", followUp: "", reason: "Timing", method: "Referral Request" },
  { number: "Q-1010", client: "Bowen Hills Design Co", site: "Bowen Hills, QLD", value: 1150, status: "Sent", quoteDate: "2026-07-16", followUp: "2026-07-26", reason: "", method: "Local Flyer" },
];

const DEMO_UNITS: ProofUnit[] = [
  { n: 1, jobNumber: "J-1", jobSequenceNumber: 1, client: "Riverstone Dental Centre", jobSite: "Sample premises, Paddington QLD", proofType: "Completed Job", status: "Completed", gm: 43, evidence: true, lifecycle: "active", sourceQuote: "Q-1001", quoteValue: 2035, quotedLabourHours: 20, quotedChargeOutRate: 90, quotedConsumablesBudget: 55, quotedCleanTypeLabel: "Initial or heavy clean", actualLabourHours: 19, invoiceAmount: 2035, invoiceDate: "2026-07-18", invoiceRef: "INV-1", invoiceStatus: "Sent", invoiceLines: [{ id: "demo-invoice-1", date: "2026-07-18", ref: "INV-1", description: "Final invoice generated from accepted quote Q-1001", amount: 2035, gstIncluded: true, gstTreatment: "gst_included", source: "quote_conversion", sourceQuoteId: "demo-q-1001" }], costMaterials: 85, costLabour: 950, costOther: 15, costLines: [{ id: "demo-cost-1", description: "Cleaning materials and consumables", amount: 85, gstIncluded: true, gstTreatment: "gst_included", date: "2026-07-18" }], paymentStatus: "Not Paid", sandboxRevenueAmount: 2035, sandboxOutstandingAmount: 2035, sandboxTotalDirectCost: 1050, sandboxGrossProfit: 985, sandboxGrossMarginPct: 48 },
  { n: 2, jobNumber: "J-2", jobSequenceNumber: 2, client: "Milton Legal Chambers", jobSite: "Sample premises, Milton QLD", proofType: "Recurring Job", status: "In Progress", gm: 45, evidence: true, lifecycle: "active", sourceQuote: "Q-1002", quoteValue: 2640, quotedLabourHours: 24, quotedChargeOutRate: 95, quotedConsumablesBudget: 65, actualLabourHours: 12, sandboxRevenueAmount: 2640, sandboxTotalDirectCost: 1320, sandboxGrossProfit: 1320, sandboxGrossMarginPct: 50 },
  { n: 3, jobNumber: "J-3", jobSequenceNumber: 3, client: "Newstead Allied Health", jobSite: "Sample premises, Newstead QLD", proofType: "Recurring Job", status: "Scheduled", gm: 43, evidence: true, lifecycle: "active", sourceQuote: "Q-1003", quoteValue: 1760, quotedLabourHours: 16, quotedChargeOutRate: 95, quotedConsumablesBudget: 45, scheduledDate: "2026-07-24", sandboxRevenueAmount: 1760, sandboxTotalDirectCost: 920, sandboxGrossProfit: 840, sandboxGrossMarginPct: 48 },
];

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
// Supabase owns public display derivation; dashboard financial rollups render
// from the current Stage 1 ledger rows.
type Stage1DashboardDisplay = { [key: string]: any };
type Stage1JobDetailDisplay = { [key: string]: any };

// Render a Supabase-derived direct-cost value compactly.
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
  return "—";
}

function marginTone35(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  return pct >= 35 ? "text-emerald-600" : "text-red-600";
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

// GST split for a unit's customer invoice. The user-entered amount is the
// GST-INCLUSIVE gross (source of truth). GST + ex-GST are derived from the GST
// treatment via computeGstSplit — never by multiplying ex-GST by 1.1.
function unitInvoiceSplit(u: ProofUnit): { inclusive: number; gst: number; exGst: number } {
  if (u.invoiceLines && u.invoiceLines.length > 0) {
    return u.invoiceLines.reduce(
      (acc, line) => {
        const split = computeGstSplit({
          inclusive: line.amount ?? 0,
          treatment: line.gstTreatment ?? (line.gstIncluded ? "gst_included" : "no_gst"),
          gstOverride: line.gstAmount,
          overridden: line.gstOverridden,
        });
        return {
          inclusive: acc.inclusive + split.inclusive,
          gst: acc.gst + split.gst,
          exGst: acc.exGst + split.exGst,
        };
      },
      { inclusive: 0, gst: 0, exGst: 0 },
    );
  }
  const split = computeGstSplit({
    inclusive: u.invoiceAmount ?? 0,
    treatment: u.invoiceGstTreatment ?? "no_gst",
    gstOverride: u.invoiceGstAmount,
    overridden: u.invoiceGstOverridden,
  });
  return { inclusive: split.inclusive, gst: split.gst, exGst: split.exGst };
}

// GST split for a unit's job costs. Each cost line stores a GST-inclusive gross;
// GST + ex-GST are derived from each line's GST treatment.
function unitCostSplit(u: ProofUnit): { inclusive: number; gst: number; exGst: number } {
  const lines = u.costLines ?? [];
  if (lines.length > 0) {
    return lines.reduce(
      (acc, l) => {
        const s = computeGstSplit({
          inclusive: l.amount ?? 0,
          treatment: l.gstTreatment ?? (l.gstIncluded ? "gst_included" : "no_gst"),
          gstOverride: l.gstAmount,
          overridden: l.gstOverridden,
        });
        return {
          inclusive: acc.inclusive + s.inclusive,
          gst: acc.gst + s.gst,
          exGst: acc.exGst + s.exGst,
        };
      },
      { inclusive: 0, gst: 0, exGst: 0 },
    );
  }
  const legacy =
    (u.costMaterials ?? 0) +
    (u.costLabour ?? 0) +
    (u.costSubcontractors ?? 0) +
    (u.costOther ?? 0);
  return { inclusive: legacy, gst: 0, exGst: legacy };
}

function unitPaymentTotal(u: ProofUnit): number {
  if (u.paymentLines && u.paymentLines.length > 0) {
    return u.paymentLines.reduce((sum, line) => sum + (line.amount ?? 0), 0);
  }
  return u.paymentAmount ?? 0;
}

function deriveStage1GmStatus(u: ProofUnit): { label: string; tone: string; pct: number | null } {
  const revenue = u.invoiceAmount ?? u.quoteValue ?? 0;
  const costs = unitTotalCost(u);
  const gmPct = u.gm;
  if (revenue > 0 && costs > 0 && gmPct != null) {
    return { label: "GM proven", tone: gmPct >= 30 ? "text-emerald-600" : gmPct >= 20 ? "text-amber-600" : "text-red-600", pct: gmPct };
  }
  if (revenue > 0 && costs === 0) {
    return { label: "—", tone: "text-muted-foreground", pct: null };
  }
  if (revenue === 0) {
    return { label: "—", tone: "text-muted-foreground", pct: null };
  }
  return { label: "—", tone: "text-muted-foreground", pct: null };
}

// ---------------------------------------------------------------------------
// Stage 1 payment-status display helper.
// ---------------------------------------------------------------------------
const PAYMENT_STATUS_LABELS: Record<string, string> = {
  not_invoiced: "—",
  unpaid: "Unpaid",
  part_paid: "Part-paid",
  paid: "Paid",
};

function deriveStage1PaymentStatus(u: ProofUnit): string {
  if (u.sandboxPaymentStatus && PAYMENT_STATUS_LABELS[u.sandboxPaymentStatus]) {
    return PAYMENT_STATUS_LABELS[u.sandboxPaymentStatus];
  }
  const revenue = u.sandboxRevenueAmount ?? u.invoiceAmount ?? u.quoteValue ?? 0;
  const paid = u.sandboxPaymentReceivedAmount ?? u.paymentAmount ?? 0;
  if (revenue <= 0) return "—";
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
  accent,
  tone,
  onClick,
  highlighted = false,
}: {
  label: string;
  primary: React.ReactNode;
  secondaries?: { k: string; v: React.ReactNode }[];
  icon: React.ComponentType<{ className?: string }>;
  accent: "blue" | "green" | "violet" | "amber";
  tone?: string;
  onClick?: () => void;
  highlighted?: boolean;
}) {
  const accentStyles = {
    blue: {
      card: "border-t-[#1769d4] bg-gradient-to-br from-white to-[#eef5ff]",
      label: "text-[#1769d4]",
      icon: "bg-[#e7f0ff] text-[#1769d4] ring-[#cfe0fb]",
    },
    green: {
      card: "border-t-[#218348] bg-gradient-to-br from-white to-[#edf8f1]",
      label: "text-[#218348]",
      icon: "bg-[#e5f6eb] text-[#218348] ring-[#ccebd7]",
    },
    violet: {
      card: "border-t-[#7351c8] bg-gradient-to-br from-white to-[#f2effb]",
      label: "text-[#7351c8]",
      icon: "bg-[#eee9fa] text-[#7351c8] ring-[#ddd3f4]",
    },
    amber: {
      card: "border-t-[#d46a16] bg-gradient-to-br from-white to-[#fff4e9]",
      label: "text-[#d46a16]",
      icon: "bg-[#fff0df] text-[#d46a16] ring-[#f5d8bc]",
    },
  }[accent];

  const content = (
    <>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold uppercase tracking-wide ${accentStyles.label}`}>{label}</span>
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${accentStyles.icon}`}>
          <Icon className="h-4 w-4" />
        </span>
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
      {onClick && (
        <div className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">Click to drill down →</div>
      )}
    </>
  );
  if (!onClick) {
    return (
      <div className={`text-left rounded-lg border border-t-[3px] p-4 shadow-sm ${accentStyles.card} ${highlighted ? "relative z-40 ring-4 ring-sky-400 ring-offset-4" : ""}`}>
        {content}
      </div>
    );
  }
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-lg border border-t-[3px] p-4 shadow-sm transition-all hover:shadow-md ${accentStyles.card} ${highlighted ? "relative z-40 ring-4 ring-sky-400 ring-offset-4" : ""}`}
    >
      {content}
    </button>
  );
}

// ---------- Business Details (server-verified gate) ----------
function useBusinessDetails(runId: string | null, isDemo: boolean) {
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState<PublicBusinessProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isDemo) {
      setLoaded(true);
      return;
    }
    if (!runId) {
      setLoaded(false);
      return;
    }
    let cancelled = false;
    setLoaded(false);
    setError(null);
    void fetchBusinessIdentity(runId)
      .then(({ profile: next }) => { if (!cancelled) setProfile(next); })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [isDemo, runId]);

  const canOperate = isDemo || profile?.verified === true;
  return { loaded, complete: canOperate, profile, error, canOperate };
}

function BusinessDetailsDialog({
  open,
  onOpenChange,
  runId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  runId: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Before you start First 5 Jobs</DialogTitle>
          <DialogDescription>
            Jane will keep this simple. We first need a complete business identity and an ABN that can be verified with ABN Lookup.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border p-4">
            <p className="font-medium">I already have an ABN</p>
            <p className="mt-1 text-sm text-muted-foreground">Enter your details, then we will check the ABN and GST status against the register.</p>
            {runId ? (
              <Button asChild className="mt-3">
                <Link to={`/business-setup?runId=${encodeURIComponent(runId)}`}>Enter Business Details</Link>
              </Button>
            ) : (
              <Button className="mt-3" disabled>Enter Business Details</Button>
            )}
          </div>
          <div className="rounded-lg border p-4">
            <p className="font-medium">I need to apply for an ABN</p>
            <p className="mt-1 text-sm text-muted-foreground">Use the official government guide. Applying is free. Come back here once the ABN is active.</p>
            <Button asChild variant="outline" className="mt-3">
              <a href="https://www.abr.gov.au/business-super-funds-charities/applying-abn" target="_blank" rel="noreferrer">Show me how to apply</a>
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Not now</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Drill-down panel (inline, horizontal) ----------
type DrillKey = "leads" | "conversions" | "jobs";

const DRILL_META: Record<DrillKey, { title: string; subtitle: string }> = {
  leads: {
    title: "Lead Method Performance",
    subtitle: "Where leads are coming from and the activity producing them.",
  },
  conversions: {
    title: "Quote Conversion Board",
    subtitle: "Quotes issued, accepted, rejected, and pending.",
  },
  jobs: {
    title: "Active Jobs Register",
    subtitle: "Current and completed jobs contributing to Stage 1 proof.",
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
  const [quoteFilter, setQuoteFilter] = useState<"all" | "sent" | "converted" | "rejected">("all");

  const filteredQuotes = useMemo(() => {
    switch (quoteFilter) {
      case "sent":
        return quotes.filter((q) => q.status === "Sent");
      case "converted":
        return quotes.filter((q) => q.converted);
      case "rejected":
        return quotes.filter((q) => q.status === "Rejected");
      default:
        return quotes;
    }
  }, [quotes, quoteFilter]);

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
                </TableRow>
              </TableHeader>
              <TableBody>
                {methodRows.map((r) => (
                  <TableRow key={r.method}>
                    <TableCell className="font-medium">{r.method}</TableCell>
                    <TableCell className="text-right">{r.attempts}</TableCell>
                    <TableCell className="text-right">{r.contacts}</TableCell>
                    <TableCell className="text-right">{r.leads}</TableCell>
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
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {kind === "conversions" && (
        <>
          <div className="flex items-center gap-3">
            <Label htmlFor="quote-filter" className="text-sm text-muted-foreground">Filter</Label>
            <select
              id="quote-filter"
              value={quoteFilter}
              onChange={(e) => setQuoteFilter(e.target.value as "all" | "sent" | "converted" | "rejected")}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="all">Show all quotes</option>
              <option value="sent">Sent</option>
              <option value="converted">Job Converted</option>
              <option value="rejected">Rejected</option>
            </select>
            <span className="text-xs text-muted-foreground ml-auto">{filteredQuotes.length} quote{filteredQuotes.length === 1 ? "" : "s"}</span>
          </div>
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
                {filteredQuotes.map((r) => {
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
            {filteredQuotes.map((r) => {
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
            Select a row and use <span className="font-medium text-foreground">Quote Activity</span> to update status.
            Accepting a quote creates one job in the Simple Job Cost Ledger.
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
                  const paymentStatusLabel = deriveStage1PaymentStatus(u);
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
  tourInteractive = false,
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
  tourInteractive?: boolean;
}) {
  const meta = drill ? DRILL_META[drill] : null;
  return (
    <Sheet open={!!drill} onOpenChange={onOpenChange} modal={!tourInteractive}>
      <SheetContent
        side="right"
        onInteractOutside={(event) => { if (tourInteractive) event.preventDefault(); }}
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
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (a: LeadActivity) => void;
}) {
  const [date, setDate] = useState("");
  const [method, setMethod] = useState(METHOD_OPTIONS[0]);
  const [attempts, setAttempts] = useState<string>("");
  const [contacts, setContacts] = useState<string>("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setDate(""); setMethod(METHOD_OPTIONS[0]);
      setAttempts(""); setContacts(""); setNotes("");
    }
  }, [open]);

  const canSave = !!date && !!method;

  const save = () => {
    const activityId = `act-${Date.now()}`;
    const a: LeadActivity = {
      id: activityId,
      activity_date: date,
      method,
      attempts: Number(attempts) || 0,
      contacts_made: Number(contacts) || 0,
      notes: notes.trim(),
      created_at: new Date().toISOString(),
    };
    onSave(a);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log Activity</DialogTitle>
          <DialogDescription>
            Record a dated lead-generation activity. Aggregates into Lead Method Performance.
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
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="la-att">Attempts</Label>
              <Input id="la-att" type="number" min={0} value={attempts} onChange={(e) => setAttempts(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="la-con">Contacts Made</Label>
              <Input id="la-con" type="number" min={0} value={contacts} onChange={(e) => setContacts(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="la-notes">Notes</Label>
            <Input id="la-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Best response 8–10am" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
      …25872 tokens truncated…ionReadinessSummary.latest_lifecycle_validation?.validation_status ?? "—"}
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
          accent="blue"
          primary={totalLeads}
          secondaries={[{ k: "Total leads", v: totalLeads }]}
          onClick={() => setDrill("leads")}
          highlighted={tourActive && tourStep === 1}
        />
        <KpiCard
          label="Conversions"
          icon={FileText}
          accent="green"
          primary={`${quoteConvPct}%`}
          secondaries={[
            { k: "Quotes sent", v: quotesSent },
            { k: "Quotes accepted", v: quotesAccepted },
            { k: "Quotes rejected", v: quotesRejected },
            { k: "Quotes outstanding", v: quotesOutstanding },
          ]}
          onClick={() => navigate(activeRunId ? `/stage-1/quotes?runId=${encodeURIComponent(activeRunId)}` : "/stage-1/quotes")}
          highlighted={tourActive && tourStep === 3}
        />
        <KpiCard
          label="Active Jobs"
          icon={Briefcase}
          accent="violet"
          primary={activeJobs}
          secondaries={[
            { k: "Active jobs", v: activeJobs },
            { k: "Completed jobs", v: completedJobs },
          ]}
          onClick={() => setDrill("jobs")}
          highlighted={tourActive && tourStep === 4}
        />
        <KpiCard
          label="Gross Margin"
          icon={TrendingUp}
          accent="amber"
          tone={displayMarginTone}
          primary={displayMarginText}
        />
      </section>

      {/* Visible developer error panel — never silently swallow a Supabase error. */}
      {ledgerError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          <div className="font-semibold">Stage 1 ledger failed to load</div>
          <div className="mt-1 font-mono break-all">Query source: {ledgerError.source}</div>
          <div className="mt-1 font-mono break-all">Supabase error: {ledgerError.message}</div>
          <div className="mt-1 font-mono break-all">
            Authenticated user id: {ledgerError.userId ?? "(none)"}
          </div>
        </div>
      )}

      {/* ---- Bottom: report switcher ---- */}
      <section className={`space-y-3 ${tourActive && (tourStep === 9 || tourStep === 10) ? "relative z-40 rounded-xl ring-4 ring-sky-400 ring-offset-4" : ""}`}>
          <Card className="overflow-hidden border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-[#f7faff] via-white to-[#f2f8f5] pb-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">
                    {ledgerView === "debtors" ? "Debtors / people who owe you money" : "Job Summary"}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Jobs created by converting accepted quotes from the Quote Conversion Board. Click a row to open the detailed report.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={ledgerView === "debtors" ? "default" : "outline"}
                    onClick={() => setLedgerView("debtors")}
                  >
                    Debtors / people who owe you money
                  </Button>
                  <Button
                    size="sm"
                    variant={ledgerView === "summary" ? "default" : "outline"}
                    onClick={() => setLedgerView("summary")}
                  >
                    Job Summary
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                {ledgerView === "debtors" ? (
                  <>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Job #</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead className="text-right">Total Invoices</TableHead>
                        <TableHead className="text-right">Total Payments Received</TableHead>
                        <TableHead className="text-right">Balance Owing</TableHead>
                        <TableHead className="text-right">No. of Days Since Last Payment</TableHead>
                        <TableHead className="text-right">Open</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledgerRows.length === 0 && ledgerLoading && !ledgerError ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" /> Loading Stage 1 jobs…
                        </span>
                      </TableCell>
                    </TableRow>
                  ) : ledgerRows.length === 0 && ledgerError ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-sm text-destructive">
                        Stage 1 ledger failed to load — see error panel above.
                      </TableCell>
                    </TableRow>
                  ) : units.length === 0 && !ledgerLoading && !ledgerError ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center">
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-foreground">
                            No Stage 1 jobs have been created for this Autopsy run yet.
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Your Autopsy handoff is active. Stage 1 will populate once jobs, quotes, or sandbox records are created.
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {ledgerFinancialRows.map((row) => {
                        const u = row.unit;
                        const isSel = u.n === selectedN;
                        return (
                          <TableRow
                            key={u.stage1JobId ?? u.jobId ?? `n-${u.n}`}
                            className={`cursor-pointer ${isSel ? "bg-muted/60" : "hover:bg-muted/30"}`}
                            onClick={() => openReport(u.n)}
                          >
                            <TableCell className="font-mono text-xs">{formatLedgerJobNumber(u)}</TableCell>
                            <TableCell>
                              <div className="font-medium leading-tight">{u.client}</div>
                              {u.jobSite ? (
                                <div className="text-xs text-muted-foreground leading-tight">{u.jobSite}</div>
                              ) : (
                                <div className="text-xs text-amber-600 leading-tight">Site not entered</div>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.invoicesIncGst !== 0 ? fmtSignedMoney(row.invoicesIncGst) : "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.paid !== 0 ? fmtSignedMoney(row.paid) : "—"}
                            </TableCell>
                            <TableCell className={`text-right tabular-nums ${row.outstanding < 0 ? "text-red-600" : ""}`}>
                              {row.invoicesIncGst !== 0 ? fmtSignedMoney(row.outstanding) : "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.daysSincePayment !== null ? row.daysSincePayment : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => { e.stopPropagation(); openReport(u.n); }}
                              >
                                Open
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="font-semibold">
                        <TableCell colSpan={2}>Totals</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtSignedMoney(ledgerTotals.totalInvoices)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtSignedMoney(ledgerTotals.totalPaid)}</TableCell>
                        <TableCell className={`text-right tabular-nums ${ledgerTotals.totalOutstanding < 0 ? "text-red-600" : ""}`}>
                          {fmtSignedMoney(ledgerTotals.totalOutstanding)}
                        </TableCell>
                        <TableCell />
                        <TableCell />
                      </TableRow>
                    </>
                  )}
                    </TableBody>
                  </>
                ) : (
                  <>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Job #</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead className="text-right">Revenue net of GST</TableHead>
                        <TableHead className="text-right">Job Costs net of GST</TableHead>
                        <TableHead className="text-right">Gross Margin</TableHead>
                        <TableHead className="text-right">Gross Margin %</TableHead>
                        <TableHead className="text-right">Open</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledgerRows.length === 0 && ledgerLoading && !ledgerError ? (
                        <TableRow>
                          <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" /> Loading Stage 1 jobs…
                            </span>
                          </TableCell>
                        </TableRow>
                      ) : ledgerRows.length === 0 && ledgerError ? (
                        <TableRow>
                          <TableCell colSpan={7} className="py-8 text-center text-sm text-destructive">
                            Stage 1 ledger failed to load — see error panel above.
                          </TableCell>
                        </TableRow>
                      ) : units.length === 0 && !ledgerLoading && !ledgerError ? (
                        <TableRow>
                          <TableCell colSpan={7} className="py-8 text-center">
                            <div className="space-y-1">
                              <div className="text-sm font-medium text-foreground">
                                No Stage 1 jobs have been created for this Autopsy run yet.
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Your Autopsy handoff is active. Stage 1 will populate once jobs, quotes, or sandbox records are created.
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        <>
                          {ledgerFinancialRows.map((row) => {
                            const u = row.unit;
                            const isSel = u.n === selectedN;
                            return (
                              <TableRow
                                key={u.stage1JobId ?? u.jobId ?? `n-${u.n}`}
                                className={`cursor-pointer ${isSel ? "bg-muted/60" : "hover:bg-muted/30"}`}
                                onClick={() => openReport(u.n)}
                              >
                                <TableCell className="font-mono text-xs">{formatLedgerJobNumber(u)}</TableCell>
                                <TableCell>
                                  <div className="font-medium leading-tight">{u.client}</div>
                                  {u.jobSite ? (
                                    <div className="text-xs text-muted-foreground leading-tight">{u.jobSite}</div>
                                  ) : (
                                    <div className="text-xs text-amber-600 leading-tight">Site not entered</div>
                                  )}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {row.revenueEx !== 0 ? fmtSignedMoney(row.revenueEx) : "—"}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {row.costEx !== 0 ? fmtSignedMoney(row.costEx) : "—"}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {row.grossMargin !== null ? fmtSignedMoney(row.grossMargin) : "—"}
                                </TableCell>
                                <TableCell className={`text-right font-medium tabular-nums ${marginTone35(row.gmPct)}`}>
                                  {row.gmPct !== null ? `${row.gmPct}%` : "—"}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => { e.stopPropagation(); openReport(u.n); }}
                                  >
                                    Open
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          <TableRow className="font-semibold">
                            <TableCell colSpan={2}>Totals</TableCell>
                            <TableCell className="text-right tabular-nums">${fmtMoney(ledgerTotals.totalRevenueEx)}</TableCell>
                            <TableCell className="text-right tabular-nums">${fmtMoney(ledgerTotals.totalCostEx)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {ledgerTotals.totalGrossMargin !== null ? `$${fmtMoney(ledgerTotals.totalGrossMargin)}` : "—"}
                            </TableCell>
                            <TableCell className={`text-right tabular-nums ${marginTone35(ledgerTotals.totalGmPct)}`}>
                              {ledgerTotals.totalGmPct !== null ? `${ledgerTotals.totalGmPct}%` : "—"}
                            </TableCell>
                            <TableCell />
                          </TableRow>
                          <TableRow>
                            <TableCell colSpan={3} className="font-medium">
                              General Business Costs (net of GST)
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              ${fmtMoney(ledgerTotals.totalGeneralBusinessCostsEx)}
                            </TableCell>
                            <TableCell />
                            <TableCell />
                            <TableCell />
                          </TableRow>
                        </>
                      )}
                    </TableBody>
                  </>
                )}
              </Table>
            </CardContent>
          </Card>
      </section>

      <JobDetailSheet
        unit={selectedUnit}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSave={async (u) => {
          if (!requireBusinessRegistration("record job transactions")) return;
          return persistUnitsWithDiagnostics((prev) =>
            prev.map((p) => (p.n === u.n ? { ...u, stage1JobId: p.stage1JobId ?? u.stage1JobId } : p)),
          );
        }}
        savePrerequisites={{ runId: activeRunId, authUserId: user?.id ?? null, loading: authLoading }}
        onJumpToFinancials={() => { /* no-op on dashboard */ }}
        concentrationClient={scorecard.concentrationClient}
        onVoid={() => { /* no-op */ }}
        onArchive={() => { /* no-op */ }}
        onDelete={() => { /* no-op */ }}
        onOpenDetailedReport={(n) => openReport(n)}
      />
      <BusinessDetailsDialog open={bdOpen} onOpenChange={setBdOpen} runId={activeRunId} />
      <DrillCurtain
        drill={drill}
        onOpenChange={(o) => { if (!o) { setDrill(null); setQuoteActivityError(null); } }}
        methodRows={methodRows}
        onLogActivity={() => { if (requireBusinessRegistration("log lead activity")) setLogActOpen(true); }}
        quotes={quotes}
        selectedQuoteNumber={selectedQuoteNumber}
        onSelectQuote={(n) => { setSelectedQuoteNumber(n); setQuoteActivityError(null); }}
        onQuoteActivity={openQuoteActivity}
        onUpdateQuote={handleUpdateQuote}
        onOpenQuoteDetail={handleOpenQuoteDetail}
        units={units}
        onOpenUnit={(n) => {
          setDrill(null);
          if (isDemo) window.setTimeout(() => openReport(n), 350);
          else openUnit(n);
        }}
        tourInteractive={isDemo || tourActive}
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
        onSave={(a) => {
          if (!requireBusinessRegistration("log lead activity")) return;
          setActivities((prev) => [...prev, a]);
          setLogActOpen(false);
        }}
      />
      <DetailedJobCostReport
        unit={reportUnit}
        runId={activeRunId}
        open={reportOpen}
        onOpenChange={setReportOpen}
        onSave={async (u) => {
          if (!requireBusinessRegistration("record job transactions")) return;
          return persistUnitsWithDiagnostics((prev) =>
            prev.map((p) => (p.n === u.n ? { ...u, stage1JobId: p.stage1JobId ?? u.stage1JobId } : p)),
          );
        }}
        tourInteractive={isDemo || tourActive}
        readOnly={isDemo}
      />
      {tourActive ? <Stage1WelcomeGuide mode={tourMode === "jobs" ? "jobs" : "dashboard"} initialStep={initialTourStep} autoPlay={tourAutoPlay} onClose={closeTour} onStepChange={handleTourStepChange} onJourneyBack={tourMode === "jobs" ? () => navigate("/stage-1/quote/demo-q-1004?demo=1&tour=document&step=2&autoplay=1") : undefined} onJourneyAction={tourMode === "jobs" ? undefined : () => navigate(isDemo ? "/stage-1/quotes?demo=1&tour=quotes&autoplay=1" : activeRunId ? `/stage-1/quotes?runId=${encodeURIComponent(activeRunId)}&tour=quotes&autoplay=1` : "/stage-1/quotes?tour=quotes&autoplay=1")} /> : null}
      {isDemo && !tourActive ? <Stage1TourResume onClick={() => { const next = new URLSearchParams(searchParams); next.set("tour", "1"); setSearchParams(next); }} /> : null}
    </div>
  );
}

// Stage 1 RPCs run only while authenticated: the inner component (which fires
// all Stage 1 Supabase RPCs in its effects) is mounted only behind AuthGate.
export default function Stage1Dashboard() {
  const [searchParams] = useSearchParams();
  if (searchParams.get("demo") === "1") {
    return <Stage1DashboardInner />;
  }
  return (
    <AuthGate>
      <Stage1DashboardInner />
    </AuthGate>
  );
}

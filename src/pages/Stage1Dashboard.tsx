import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  SEED_UNITS,
  computeScorecard,
  JobDetailSheet,
  type ProofUnit,
} from "./Stage1";
import { supabase, isDebug } from "@/lib/supabase";
import { getAuthorizedStage1Admission } from "@/lib/stage1Admission";
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
  Download,
} from "lucide-react";
import { DetailedJobCostReport } from "@/components/DetailedJobCostReport";
import { Stage1TourResume, Stage1WelcomeGuide } from "@/components/Stage1WelcomeGuide";
import { Stage1LeadMatrix } from "@/components/Stage1LeadMatrix";
import {
  createStage1LeadActivityWithContacts,
  loadStage1LeadActivities,
  loadStage1LeadRecords,
  type NewStage1LeadActivity,
  type NewStage1PotentialCustomer,
  type Stage1LeadActivity,
  type Stage1LeadRecord,
} from "@/lib/stage1Funnel";
import { downloadAccountantPack } from "@/lib/stage1AccountantPack";
import { downloadEvidenceFile, listRunEvidence } from "@/lib/stage1Evidence";
import { QboSandboxConnectionCard } from "@/components/QboSandboxConnectionCard";

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
  { method: "Referral Request", attempts: 0, contacts: 0, leads: 0, quotes: 4, jobs: 1, notes: "Introductions from established local contacts" },
  { method: "Customer Referral", attempts: 0, contacts: 0, leads: 0, quotes: 0, jobs: 0, notes: "Introductions from satisfied customers" },
  { method: "Personal Referral", attempts: 0, contacts: 0, leads: 0, quotes: 0, jobs: 0, notes: "Introductions from personal contacts" },
  { method: "Phone Outreach", attempts: 0, contacts: 0, leads: 0, quotes: 3, jobs: 1, notes: "Targeted calls to nearby commercial premises" },
  { method: "Local Flyer", attempts: 0, contacts: 0, leads: 0, quotes: 3, jobs: 1, notes: "Focused distribution around selected business precincts" },
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

const DEMO_LEAD_ACTIVITIES: Stage1LeadActivity[] = [
  { id: "demo-lead-1", activity_date: "2026-08-01", method: "Referral Request", attempts: 4, contacts_made: 4, leads_generated: 3, created_at: "2026-08-01T09:00:00Z" },
  { id: "demo-lead-2", activity_date: "2026-08-04", method: "Phone Outreach", attempts: 10, contacts_made: 4, leads_generated: 2, created_at: "2026-08-04T09:00:00Z" },
  { id: "demo-lead-3", activity_date: "2026-08-09", method: "Local Flyer", attempts: 80, contacts_made: 3, leads_generated: 2, created_at: "2026-08-09T09:00:00Z" },
  { id: "demo-lead-4", activity_date: "2026-08-12", method: "Customer Referral", attempts: 3, contacts_made: 3, leads_generated: 2, created_at: "2026-08-12T09:00:00Z" },
  { id: "demo-lead-5", activity_date: "2026-08-18", method: "Phone Outreach", attempts: 12, contacts_made: 5, leads_generated: 3, created_at: "2026-08-18T09:00:00Z" },
  { id: "demo-lead-6", activity_date: "2026-08-26", method: "Personal Referral", attempts: 4, contacts_made: 4, leads_generated: 3, created_at: "2026-08-26T09:00:00Z" },
];
const DEMO_LEAD_RECORDS: Stage1LeadRecord[] = DEMO_LEAD_ACTIVITIES.flatMap((activity) =>
  Array.from({ length: activity.leads_generated }, (_, index) => ({
    id: `${activity.id}-${index + 1}`,
    client_name: `Sample lead ${index + 1}`,
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    site_address: null,
    source: activity.method,
    status: "new",
    estimated_value: 0,
    next_action_at: null,
    notes: "Demonstration lead record",
    created_at: activity.created_at,
  })),
);

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
  { number: "Q-1004", client: "Paddington Property Group", site: "Paddington, QLD", value: 1496, status: "Sent", quoteDate: "2026-07-11", followUp: "2026-07-22", reason: "", method: "Referral Request" },
  { number: "Q-1005", client: "Ashgrove Physio Centre", site: "Ashgrove, QLD", value: 1320, status: "Sent", quoteDate: "2026-07-11", followUp: "2026-07-23", reason: "", method: "Phone Outreach" },
  { number: "Q-1006", client: "West End Studios", site: "West End, QLD", value: 980, status: "Declined", quoteDate: "2026-07-12", followUp: "", reason: "Scope changed", method: "Local Flyer" },
  { number: "Q-1007", client: "Teneriffe Accountants", site: "Teneriffe, QLD", value: 2100, status: "Sent", quoteDate: "2026-07-13", followUp: "2026-07-24", reason: "", method: "Referral Request" },
  { number: "Q-1008", client: "Bulimba Veterinary Clinic", site: "Bulimba, QLD", value: 1680, status: "Sent", quoteDate: "2026-07-14", followUp: "2026-07-25", reason: "", method: "Phone Outreach" },
  { number: "Q-1009", client: "Spring Hill Medical Suites", site: "Spring Hill, QLD", value: 2860, status: "Declined", quoteDate: "2026-07-15", followUp: "", reason: "Timing", method: "Referral Request" },
  { number: "Q-1010", client: "Bowen Hills Design Co", site: "Bowen Hills, QLD", value: 1150, status: "Sent", quoteDate: "2026-07-16", followUp: "2026-07-26", reason: "", method: "Local Flyer" },
];

const DEMO_UNITS: ProofUnit[] = [
  { n: 1, jobNumber: "J-1", jobSequenceNumber: 1, client: "Riverstone Dental Centre", jobSite: "Sample premises, Paddington QLD", proofType: "Completed Job", status: "Completed", gm: 43, evidence: true, lifecycle: "active", sourceQuote: "Q-1001", quoteValue: 2035, quotedLabourHours: 20, quotedChargeOutRate: 90, quotedConsumablesBudget: 35, quotedCleanTypeLabel: "Initial or heavy clean", actualLabourHours: 19, invoiceAmount: 2035, invoiceDate: "2026-07-18", invoiceRef: "INV-1", invoiceStatus: "Paid", invoiceLines: [{ id: "demo-invoice-1", date: "2026-07-18", ref: "INV-1", description: "Final invoice generated from accepted quote Q-1001", amount: 2035, gstIncluded: true, gstTreatment: "gst_included", source: "stage1_quote_conversion", sourceQuoteId: "demo-q-1001" }], costMaterials: 85, costLabour: 950, costOther: 15, costLines: [{ id: "demo-cost-1", description: "Cleaning materials and consumables", amount: 85, gstIncluded: true, gstTreatment: "gst_included", date: "2026-07-18" }], paymentStatus: "Paid", paymentDate: "2026-07-18", paymentAmount: 2035, paymentMethod: "Bank Transfer", paymentLines: [{ id: "demo-payment-1", date: "2026-07-18", client: "Riverstone Dental Centre", description: "Payment received in full", amount: 2035, method: "Bank Transfer" }], sandboxRevenueAmount: 2035, sandboxPaymentReceivedAmount: 2035, sandboxOutstandingAmount: 0, sandboxTotalDirectCost: 1050, sandboxGrossProfit: 985, sandboxGrossMarginPct: 48 },
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
  focusTarget,
}: {
  label: string;
  primary: React.ReactNode;
  secondaries?: { k: string; v: React.ReactNode }[];
  icon: React.ComponentType<{ className?: string }>;
  accent: "blue" | "green" | "violet" | "amber";
  tone?: string;
  onClick?: () => void;
  highlighted?: boolean;
  focusTarget?: string;
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
      <div data-hudson-focus={focusTarget} className={`text-left rounded-lg border border-t-[3px] p-4 shadow-sm ${accentStyles.card} ${highlighted ? "relative z-40 ring-4 ring-sky-400 ring-offset-4" : ""}`}>
        {content}
      </div>
    );
  }
  return (
    <button
      data-hudson-focus={focusTarget}
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
            Hudson will keep this simple. We first need a complete business identity and an ABN that can be verified with ABN Lookup.
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

function LeadSummary({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border bg-slate-50 p-3"><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold leading-tight">{value}</div></div>;
}

function DrillBody({
  kind,
  methodRows,
  activities,
  leads,
  stageStartedAt,
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
  activities: Stage1LeadActivity[];
  leads: Stage1LeadRecord[];
  stageStartedAt: string | null;
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <LeadSummary label="Total leads" value={methodRows.reduce((sum, row) => sum + row.leads, 0)} />
            <LeadSummary label="Methods used" value={methodRows.filter((row) => row.leads > 0 || row.attempts > 0).length} />
            <LeadSummary label="Total attempts" value={methodRows.reduce((sum, row) => sum + row.attempts, 0)} />
            <LeadSummary label="Best source" value={methodRows.slice().sort((a, b) => b.leads - a.leads)[0]?.method ?? "—"} />
          </div>
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
              <div key={r.method} className="w-full rounded-md border p-3 text-left">
                <div className="font-medium text-sky-700">{r.method}</div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div><div className="text-muted-foreground">Attempts</div><div>{r.attempts}</div></div>
                  <div><div className="text-muted-foreground">Contacts</div><div>{r.contacts}</div></div>
                  <div><div className="text-muted-foreground">Leads</div><div>{r.leads}</div></div>
                </div>
              </div>
            ))}
          </div>
          <Stage1LeadMatrix activities={activities} startedAt={stageStartedAt} methods={methodRows.map((row) => row.method)} />
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
  activities,
  leads,
  stageStartedAt,
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
  activities: Stage1LeadActivity[];
  leads: Stage1LeadRecord[];
  stageStartedAt: string | null;
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
        closeLabel="Close"
        side="right"
        onInteractOutside={(event) => { if (tourInteractive) event.preventDefault(); }}
        className="w-full sm:max-w-none sm:w-[85vw] lg:w-[80vw] xl:w-[75vw] overflow-y-auto p-0"
      >
        <div className="p-6 space-y-4">
          <SheetHeader className="pr-24">
            <div className="flex items-start justify-between gap-3">
              <div>
                <SheetTitle>{meta?.title}</SheetTitle>
                <SheetDescription>{meta?.subtitle}</SheetDescription>
              </div>
              {drill === "leads" && (
                <Button size="sm" onClick={onLogActivity} className="gap-1.5 shrink-0">
                  <Plus className="h-4 w-4" />
                  Log activity
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
              activities={activities}
              leads={leads}
              stageStartedAt={stageStartedAt}
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

type PotentialCustomerDraft = {
  clientName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  siteAddress: string;
};

const blankPotentialCustomer = (): PotentialCustomerDraft => ({
  clientName: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  siteAddress: "",
});

function LogLeadActivityDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (activity: NewStage1LeadActivity, potentialCustomers: NewStage1PotentialCustomer[]) => void | Promise<void>;
}) {
  const [activityDate, setActivityDate] = useState(new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState(METHOD_OPTIONS[0]);
  const [attempts, setAttempts] = useState("");
  const [contacts, setContacts] = useState("");
  const [leads, setLeads] = useState("");
  const [potentialCustomers, setPotentialCustomers] = useState<PotentialCustomerDraft[]>([]);

  useEffect(() => {
    if (open) {
      setActivityDate(new Date().toISOString().slice(0, 10));
      setSource(METHOD_OPTIONS[0]);
      setAttempts("");
      setContacts("");
      setLeads("");
      setPotentialCustomers([]);
    }
  }, [open]);

  const potentialCustomerCount = Math.max(0, Math.trunc(Number(leads) || 0));
  useEffect(() => {
    if (!open) return;
    setPotentialCustomers((current) =>
      Array.from({ length: potentialCustomerCount }, (_, index) => current[index] ?? blankPotentialCustomer()),
    );
  }, [open, potentialCustomerCount]);

  const attemptCount = Math.max(0, Math.trunc(Number(attempts) || 0));
  const contactCount = Math.max(0, Math.trunc(Number(contacts) || 0));
  const completeCustomers = potentialCustomers.every((customer) =>
    customer.clientName.trim() && (customer.contactEmail.trim() || customer.contactPhone.trim()),
  );
  const canSave = Boolean(
    activityDate &&
    source &&
    attempts !== "" &&
    contacts !== "" &&
    leads !== "" &&
    contactCount <= attemptCount &&
    potentialCustomerCount <= contactCount &&
    completeCustomers,
  );

  const updatePotentialCustomer = (index: number, patch: Partial<PotentialCustomerDraft>) => {
    setPotentialCustomers((current) =>
      current.map((customer, customerIndex) => customerIndex === index ? { ...customer, ...patch } : customer),
    );
  };

  const save = () => {
    const identifiedCustomers: NewStage1PotentialCustomer[] = potentialCustomers.map((customer) => ({
      client_name: customer.clientName.trim(),
      contact_name: customer.contactName.trim() || null,
      contact_email: customer.contactEmail.trim() || null,
      contact_phone: customer.contactPhone.trim() || null,
      site_address: customer.siteAddress.trim() || null,
    }));
    void onSave({
      activity_date: activityDate,
      method: source,
      attempts: attemptCount,
      contacts_made: contactCount,
      leads_generated: potentialCustomerCount,
    }, identifiedCustomers);
  };

  const alignedField = "flex min-w-0 flex-col gap-1.5";
  const alignedLabel = "flex min-h-10 items-end";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log lead activity</DialogTitle>
          <DialogDescription>
            Record the activity totals. If it produced potential customers, identify each one so Quotes Potential and the contact record agree.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="grid items-end gap-3 sm:grid-cols-2">
            <div className={alignedField}>
              <Label className={alignedLabel} htmlFor="lead-date">Date</Label>
              <Input id="lead-date" className="h-10" type="date" value={activityDate} onChange={(e) => setActivityDate(e.target.value)} />
            </div>
            <div className={alignedField}>
              <Label className={alignedLabel} htmlFor="lead-source">Lead method</Label>
              <select
                id="lead-source" value={source} onChange={(e) => setSource(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {METHOD_OPTIONS.map((method) => <option key={method} value={method}>{method}</option>)}
              </select>
            </div>
          </div>
          <div className="grid items-end gap-3 sm:grid-cols-3">
            <div className={alignedField}>
              <Label className={alignedLabel} htmlFor="lead-attempts">People approached / items distributed</Label>
              <Input id="lead-attempts" className="h-10" type="number" min={0} value={attempts} onChange={(e) => setAttempts(e.target.value)} />
            </div>
            <div className={alignedField}>
              <Label className={alignedLabel} htmlFor="lead-contacts">Responses / conversations</Label>
              <Input id="lead-contacts" className="h-10" type="number" min={0} value={contacts} onChange={(e) => setContacts(e.target.value)} />
            </div>
            <div className={alignedField}>
              <Label className={alignedLabel} htmlFor="lead-results">Potential customers identified</Label>
              <Input id="lead-results" className="h-10" type="number" min={0} value={leads} onChange={(e) => setLeads(e.target.value)} />
            </div>
          </div>
          {contactCount > attemptCount ? (
            <p role="alert" className="text-sm text-destructive">Responses cannot exceed the number approached.</p>
          ) : null}
          {potentialCustomerCount > contactCount ? (
            <p role="alert" className="text-sm text-destructive">Potential customers cannot exceed the responses or conversations recorded.</p>
          ) : null}
          {potentialCustomerCount > 0 ? (
            <section className="space-y-3" aria-labelledby="potential-customer-details">
              <div>
                <h3 id="potential-customer-details" className="font-semibold">Potential-customer contact details</h3>
                <p className="text-sm text-muted-foreground">A customer or business name and either a phone number or email are required for each potential customer.</p>
              </div>
              {potentialCustomers.map((customer, index) => (
                <div key={index} className="space-y-3 rounded-xl border bg-slate-50 p-4">
                  <p className="text-sm font-semibold">Potential customer {index + 1}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className={alignedField}>
                      <Label htmlFor={`potential-client-${index}`}>Customer or business *</Label>
                      <Input id={`potential-client-${index}`} value={customer.clientName} onChange={(e) => updatePotentialCustomer(index, { clientName: e.target.value })} />
                    </div>
                    <div className={alignedField}>
                      <Label htmlFor={`potential-contact-${index}`}>Contact person</Label>
                      <Input id={`potential-contact-${index}`} value={customer.contactName} onChange={(e) => updatePotentialCustomer(index, { contactName: e.target.value })} />
                    </div>
                    <div className={alignedField}>
                      <Label htmlFor={`potential-phone-${index}`}>Phone</Label>
                      <Input id={`potential-phone-${index}`} type="tel" value={customer.contactPhone} onChange={(e) => updatePotentialCustomer(index, { contactPhone: e.target.value })} />
                    </div>
                    <div className={alignedField}>
                      <Label htmlFor={`potential-email-${index}`}>Email</Label>
                      <Input id={`potential-email-${index}`} type="email" value={customer.contactEmail} onChange={(e) => updatePotentialCustomer(index, { contactEmail: e.target.value })} />
                    </div>
                    <div className={`${alignedField} sm:col-span-2`}>
                      <Label htmlFor={`potential-site-${index}`}>Service address</Label>
                      <Input id={`potential-site-${index}`} value={customer.siteAddress} onChange={(e) => updatePotentialCustomer(index, { siteAddress: e.target.value })} />
                    </div>
                  </div>
                </div>
              ))}
            </section>
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!canSave}>Save activity and potential customers</Button>
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
  const isSent = quote.status === "Sent" && !isConverted;
  const isRejected = quote.status === "Rejected" && !isConverted;
  const canEditFlowThrough = isSent;
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
              ? "This accepted quote is locked. If the agreed work or price changes, issue a replacement quote so the history remains clear."
              : isSent
                ? "Limited amendments available while quote is Sent. Status changes happen in Quote Activity."
                : "Status changes happen in Quote Activity."}
          </DialogDescription>
        </DialogHeader>

        {isConverted && (
          <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="font-semibold">This quote has already been converted into a job.</div>
            <div>The accepted customer, work and price are now part of the commercial record.</div>
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
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const isDemo = searchParams.get("demo") === "1";
  const tourMode = searchParams.get("tour");
  const hudsonTourActive = tourMode === "hudson";
  const tourActive = tourMode === "1" || tourMode === "jobs" || hudsonTourActive;
  const tourAutoPlay = searchParams.get("autoplay") === "1";
  const tourStepParam = searchParams.get("step");
  const requestedTourStep = tourStepParam == null ? Number.NaN : Number(tourStepParam);
  const initialTourStep = Number.isInteger(requestedTourStep) && requestedTourStep >= 0 ? requestedTourStep : 0;
  const [tourStep, setTourStep] = useState(tourMode === "jobs" ? initialTourStep + 4 : initialTourStep);
  useEffect(() => {
    if (hudsonTourActive) setTourStep(initialTourStep);
  }, [hudsonTourActive, initialTourStep]);
  const handleTourStepChange = useCallback((step: number) => setTourStep(tourMode === "jobs" ? step + 4 : step), [tourMode]);
  const closeTour = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("tour");
    next.delete("step");
    next.delete("autoplay");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const { user, loading: authLoading } = useAuth();
  const [activeRunId, setActiveRunId] = useState<string | null>(() =>
    searchParams.get("runId") || getStage1RunId() || getActiveRunId(),
  );
  const bd = useBusinessDetails(activeRunId, isDemo);
  const [setupChoicesSaved, setOrientationComplete] = useState(isDemo);
  const [setupChoicesLoaded, setOrientationLoaded] = useState(isDemo);
  useEffect(() => {
    if (isDemo) return;
    if (!activeRunId) {
      setOrientationComplete(false);
      setOrientationLoaded(true);
      return;
    }
    setOrientationLoaded(false);
    void fetchStage1Onboarding(activeRunId)
      .then((progress) => setOrientationComplete(Boolean(progress.savedAt)))
      .catch(() => setOrientationComplete(false))
      .finally(() => setOrientationLoaded(true));
  }, [activeRunId, isDemo]);
  const [bdOpen, setBdOpen] = useState(false);
  useEffect(() => {
    if (!isDemo && activeRunId && setupChoicesLoaded && setupChoicesSaved && bd.loaded && !bd.canOperate) setBdOpen(true);
  }, [activeRunId, bd.canOperate, bd.loaded, isDemo, setupChoicesSaved, setupChoicesLoaded]);
  const [drill, setDrill] = useState<DrillKey | null>(null);
  const [units, setUnits] = useState<ProofUnit[]>(isDemo ? DEMO_UNITS : SEED_UNITS);
  const [selectedN, setSelectedN] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reportN, setReportN] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [ledgerView, setLedgerView] = useState<"debtors" | "summary">(isDemo ? "summary" : "debtors");

  useEffect(() => {
    if (!tourActive) return;
    let highlighted: Element | null = null;
    let revealTimer: number | null = null;
    const reveal = (selector: string) => {
      revealTimer = window.setTimeout(() => {
        highlighted = document.querySelector(selector);
        highlighted?.classList.add("relative", "z-40", "ring-4", "ring-sky-400", "ring-offset-4");
        highlighted?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 450);
    };
    if (tourStep === 2) setDrill("leads");
    else if (tourStep === 4) setDrill("jobs");
    else if (tourStep >= 5 && tourStep <= 8 && isDemo) {
      setDrill(null);
      if (tourStep === 5) {
        window.setTimeout(() => { setReportN(1); setReportOpen(true); }, 350);
      }
      const target = tourStep === 5 ? "job-summary" : tourStep === 6 ? "client-invoices" : tourStep === 7 ? "job-costs" : "client-payments";
      window.setTimeout(() => document.querySelector(`[data-stage1-tour="${target}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
    }
    else if (tourStep === 9) { setDrill(null); setReportOpen(false); setLedgerView("summary"); }
    else if (tourStep === 10) {
      setDrill(null);
      setReportOpen(false);
      setLedgerView("debtors");
      reveal('[data-hudson-focus="money-owing"]');
    }
    else if (tourStep === 11) {
      setDrill(null);
      setReportOpen(false);
      reveal('[data-hudson-focus="margin"]');
    }
    else if (tourStep === 12 && hudsonTourActive) {
      setDrill(null);
      const firstJob = units[0];
      if (firstJob) {
        setReportN(firstJob.n);
        setReportOpen(true);
        reveal('[data-stage1-tour="actual-hours"]');
      }
    }
    else setDrill(null);
    return () => {
      if (revealTimer != null) window.clearTimeout(revealTimer);
      highlighted?.classList.remove("relative", "z-40", "ring-4", "ring-sky-400", "ring-offset-4");
    };
  }, [hudsonTourActive, isDemo, tourActive, tourStep, units]);
  const [logActOpen, setLogActOpen] = useState(false);
  const [activities, setActivities] = useState<Stage1LeadActivity[]>(isDemo ? DEMO_LEAD_ACTIVITIES : []);
  const [leadRecords, setLeadRecords] = useState<Stage1LeadRecord[]>(isDemo ? DEMO_LEAD_RECORDS : []);
  useEffect(() => {
    if (isDemo || !activeRunId) return;
    let cancelled = false;
    Promise.all([loadStage1LeadActivities(activeRunId), loadStage1LeadRecords(activeRunId)])
      .then(([activityRows, leads]) => { if (!cancelled) { setActivities(activityRows); setLeadRecords(leads); } })
      .catch((error) => { if (!cancelled) toast({ title: "Lead records could not be loaded", description: error instanceof Error ? error.message : String(error), variant: "destructive" }); });
    return () => { cancelled = true; };
  }, [activeRunId, isDemo]);
  const [quotes, setQuotes] = useState<Quote[]>(isDemo ? DEMO_QUOTES : SEED_QUOTES);
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
  const unitsRef = useRef<ProofUnit[]>(units);
  useEffect(() => {
    unitsRef.current = units;
  }, [units]);
  // Once the Stage 1 sandbox (public.stage1_job_margin_summary) has hydrated the
  // ledger with at least one row, the legacy Core-board loader must NOT override
  // the canonical commercial units.
  const sandboxHydratedRef = useRef(false);
  // Ledger hydration status for the Simple Job Cost Ledger. While loading we show
  // "Loading Stage 1 jobs…" and never render an empty/zero dashboard state. On a
  // Supabase error we surface a visible developer error panel rather than
  // silently falling back to an empty ledger.
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [ledgerError, setLedgerError] = useState<{
    source: string;
    message: string;
    userId: string | null;
  } | null>(null);
  useEffect(() => {
    const nextRunId = searchParams.get("runId") || getStage1RunId() || getActiveRunId();
    if (!nextRunId) return;
    setStage1RunId(nextRunId);
    setActiveRunId(nextRunId);
  }, [searchParams]);
  useEffect(() => {
    if (!activeRunId || searchParams.get("runId")) return;
    const next = new URLSearchParams(searchParams);
    next.set("runId", activeRunId);
    setSearchParams(next, { replace: true });
  }, [activeRunId, searchParams, setSearchParams]);
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
    if (isDemo) return;
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
        // Load ONLY the quote board from Core. The Simple Job Cost Ledger is
        // driven STRICTLY by the canonical Stage 1 sandbox view
        // (public.stage1_job_margin_summary, hydrated in the effect below).
        // Core jobs must never populate the ledger — doing so reindexes rows by
        // local array position (J-1, J-2, …) and breaks persisted row identity
        // (job_sequence_number). That legacy fallback is removed.
        const { quotes: dbQuotes } = await loadStage1Board(activeRunId);
        if (!active) return;
        setQuotes(dbQuotes.map((q) => ({ ...q, sourceActivityDate: q.quoteDate })));
      } catch {
        /* board stays empty; nothing persisted yet */
      }
    })();
    return () => { active = false; };
  }, [activeRunId, isDemo]);

  // ---- Canonical Stage 1 sandbox hydration (READ-ONLY) ---------------------
  // On load / refresh / re-login / run change, hydrate the job ledger from the
  // required source of truth: public.stage1_job_margin_summary (via
  // fetchStage1Units). Persisted commercial proof (revenue, direct cost, gross
  // profit, gross margin) is reloaded here so it survives a browser refresh.
  // Empty (but successful) reads never clear persisted rows.
  useEffect(() => {
    if (isDemo) {
      setLedgerError(null);
      setLedgerLoading(false);
      return;
    }
    if (!activeRunId) {
      // No run resolved yet. Keep showing the loading state until auth + run id
      // are available; never fall through to an empty ledger.
      return;
    }
    let cancelled = false;
    (async () => {
      setLedgerLoading(true);
      const cached = loadStage1UnitsCache(activeRunId);
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id ?? null;
      const stageProgressId = stage1Snapshot?.stage_progress_id ?? null;
      console.info("[stage1][hydrate] begin", {
        activeAutopsyRunId: activeRunId,
        activeStageProgressId: stageProgressId,
        currentUserId: userId,
      });
      let readError: { source: string; message: string; userId: string | null } | null = null;
      const canonical = await fetchStage1Units(activeRunId, {
        stageProgressId,
        userId,
        onResult: (r) => {
          console.info("[stage1][hydrate] read result", {
            source: r.table,
            rowCount: r.rowCount,
            firstRow: r.firstRow,
            error: r.error,
          });
          if (r.error) {
            readError = {
              source: r.table,
              message: r.error.message,
              userId,
            };
          }
        },
      });
      if (cancelled) return;
      if (readError) {
        // Do not silently swallow the error — surface it in a visible panel.
        setLedgerError(readError);
        setLedgerLoading(false);
        console.warn("[stage1][hydrate] supabase error — showing error panel", readError);
        return;
      }
      setLedgerError(null);
      if (canonical && canonical.length > 0) {
        const merged = mergeUnits(canonical, cached);
        sandboxHydratedRef.current = true;
        unitsRef.current = merged;
        setUnits(merged);
        saveStage1UnitsCache(activeRunId, merged);
        console.info("[stage1][hydrate] applied", {
          mappedLedgerRowCount: merged.length,
          mappedFirstLedgerRow: merged[0] ?? null,
        });
      } else if (canonical == null) {
        console.warn("[stage1][hydrate] read failed — keeping existing/cached units");
      } else {
        console.info("[stage1][hydrate] no persisted sandbox rows for this run");
      }
      setLedgerLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeRunId, isDemo, stage1Snapshot?.stage_progress_id, user?.id]);

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
        const reconciled = canonical.length > 0
          ? mergeUnits(canonical, loadStage1UnitsCache(activeRunId))
          : syncedUnits ?? [];
        unitsRef.current = reconciled;
        setUnits(reconciled);
        saveStage1UnitsCache(activeRunId, reconciled);
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
    const methodBaseline = isDemo ? DEMO_METHOD_BASELINE : METHOD_BASELINE;
    const methods = new Set<string>();
    methodBaseline.forEach((b) => methods.add(b.method));
    activities.forEach((a) => a.method && methods.add(a.method));
    return Array.from(methods).map((method) => {
      const baseline = methodBaseline.find((b) => b.method === method);
      const acts = activities.filter((a) => a.method === method);
      const qs = quotes.filter((q) => q.method === method);
      const jobsCount = units.filter((u) => {
        const src = quotes.find((q) => q.number === u.sourceQuote);
        return src?.method === method;
      }).length;
      const attempts = (baseline?.attempts ?? 0) + acts.reduce((s, a) => s + (a.attempts || 0), 0);
      const contacts = (baseline?.contacts ?? 0) + acts.reduce((s, a) => s + (a.contacts_made || 0), 0);
      const quotesSum = (baseline?.quotes ?? 0) + qs.length;
      const leads = (baseline?.leads ?? 0) + acts.reduce((sum, activity) => sum + (activity.leads_generated || 0), 0);
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
  }, [activities, isDemo, quotes, units]);

  const openReport = (n: number) => {
    setReportN(n);
    setReportOpen(true);
  };
  const reportUnit = units.find((u) => u.n === reportN) ?? null;

  const scorecard = useMemo(() => computeScorecard(units), [units]);
  const selectedUnit = units.find((u) => u.n === selectedN) ?? null;

  // The ledger shows every active Stage 1 job. Persisted sandbox rows keep their
  // canonical financial projections; immature jobs render with safe placeholders
  // until proof records exist.
  const ledgerRows = useMemo(() => {
    const sortValue = (u: ProofUnit) => {
      if (u.jobSequenceNumber != null) return u.jobSequenceNumber;
      const parsed = Number(u.jobNumber?.match(/\d+/)?.[0]);
      return Number.isFinite(parsed) ? parsed : u.n;
    };
    return units
      .filter((u) => (u.lifecycle ?? "active") === "active")
      .sort((a, b) => sortValue(a) - sortValue(b));
  }, [units]);
  const formatLedgerJobNumber = (u: ProofUnit) =>
    u.jobSequenceNumber != null ? `J-${u.jobSequenceNumber}` : u.jobNumber?.trim() || `J-${u.n}`;
  const daysSinceLastPayment = (iso?: string) => {
    if (!iso) return null;
    const paidAt = new Date(iso);
    if (Number.isNaN(paidAt.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - paidAt.getTime()) / 86_400_000));
  };
  const ledgerFinancialRows = useMemo(() => {
    return ledgerRows.map((u) => {
      const invSplit = unitInvoiceSplit(u);
      const costSplit = unitCostSplit(u);
      const invoicesIncGst = invSplit.inclusive !== 0 ? invSplit.inclusive : (u.sandboxRevenueAmount ?? 0);
      const revenueEx = invSplit.inclusive !== 0 ? invSplit.exGst : (u.sandboxRevenueAmount ?? 0);
      const costEx = costSplit.inclusive !== 0 ? costSplit.exGst : (u.sandboxTotalDirectCost ?? unitTotalCost(u));
      const localPaid = unitPaymentTotal(u);
      const paid = localPaid !== 0 ? localPaid : (u.sandboxPaymentReceivedAmount ?? 0);
      const outstanding = localPaid !== 0 || invSplit.inclusive !== 0
        ? invoicesIncGst - paid
        : u.sandboxOutstandingAmount ?? (invoicesIncGst - paid);
      const hasRevenueAndCost = revenueEx !== 0 && costEx !== 0;
      const grossMargin = hasRevenueAndCost ? revenueEx - costEx : null;
      const gmPct = hasRevenueAndCost && revenueEx > 0
        ? Math.round(((grossMargin ?? 0) / revenueEx) * 100)
        : null;
      return {
        unit: u,
        invoicesIncGst,
        revenueEx,
        costEx,
        paid,
        outstanding,
        grossMargin,
        gmPct,
        daysSincePayment: daysSinceLastPayment(u.paymentDate),
      };
    });
  }, [ledgerRows]);
  const ledgerTotals = useMemo(() => {
    const totalInvoices = ledgerFinancialRows.reduce((s, r) => s + r.invoicesIncGst, 0);
    const totalPaid = ledgerFinancialRows.reduce((s, r) => s + r.paid, 0);
    const totalOutstanding = ledgerFinancialRows.reduce((s, r) => s + r.outstanding, 0);
    const totalRevenueEx = ledgerFinancialRows.reduce((s, r) => s + r.revenueEx, 0);
    const totalCostEx = ledgerFinancialRows.reduce((s, r) => s + r.costEx, 0);
    const totalGrossMargin = totalRevenueEx > 0 && totalCostEx > 0 ? totalRevenueEx - totalCostEx : null;
    const totalGmPct = totalGrossMargin !== null && totalRevenueEx > 0
      ? Math.round((totalGrossMargin / totalRevenueEx) * 100)
      : null;
    const totalGeneralBusinessCostsEx = units.reduce((sum, u) => {
      return sum + (u.gbExpenses ?? []).reduce((expenseSum, expense) => {
        const split = computeGstSplit({
          inclusive: expense.amount ?? 0,
          treatment: expense.gstIncluded === false ? "no_gst" : "gst_included",
        });
        return expenseSum + split.exGst;
      }, 0);
    }, 0);
    return {
      totalInvoices,
      totalPaid,
      totalOutstanding,
      totalRevenueEx,
      totalCostEx,
      totalGrossMargin,
      totalGmPct,
      totalGeneralBusinessCostsEx,
    };
  }, [ledgerFinancialRows, units]);

  const openUnit = (n: number) => {
    openReport(n);
  };

  // Compute KPI aggregates from current state
  const totalLeads = methodRows.reduce((s, r) => s + r.leads, 0);
  const quotesSent = quotes.length;
  const potentialQuotes = leadRecords.filter((contact) => !["quoted", "won", "lost"].includes(contact.status.toLowerCase())).length;
  const quotesAccepted = quotes.filter((q) => q.status === "Accepted").length;
  const quotesRejected = quotes.filter((q) => ["Rejected", "Declined", "Expired"].includes(q.status)).length;
  const quotesOutstanding = Math.max(0, quotesSent - quotesAccepted - quotesRejected);
  const quoteConvPct = quotesSent ? Math.round((quotesAccepted / quotesSent) * 100) : 0;
  // Jobs in the ledger are only those created from accepted, converted quotes.
  const completedJobs = units.filter((u) => ["Completed", "Paid"].includes(u.status)).length;
  const activeJobs = units.filter((u) => !["Completed", "Paid", "Voided", "Cancelled"].includes(u.status)).length;
  const displayMarginText = ledgerTotals.totalGmPct !== null
    ? `${ledgerTotals.totalGmPct}%`
    : "—";
  const displayMarginTone = marginTone35(ledgerTotals.totalGmPct);

  const handleAcceptAndConvert = async (q: Quote) => {
    if (!requireBusinessRegistration("convert quotes to jobs")) return;
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
    if (!requireBusinessRegistration("update quotes")) return;
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
    if (!requireBusinessRegistration("update quotes")) return;
    setSelectedQuoteNumber(n);
    setQuoteActivityError(null);
    setQuoteActivityOpen(true);
  };

  const handleOpenQuoteDetail = (n: string) => {
    setQuoteDetailNumber(n);
    setQuoteDetailOpen(true);
  };

  const requireBusinessRegistration = (action: string) => {
    if (bd.canOperate) return true;
    toast({
      title: "Business registration required",
      description: `Complete and verify your Business Details before you ${action}.`,
    });
    setBdOpen(true);
    return false;
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
      <header className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#123b63] bg-gradient-to-r from-[#061b34] via-[#082849] to-[#07375a] px-5 py-4 text-white shadow-lg shadow-slate-900/10 ${tourActive && tourStep === 0 ? "relative z-40 ring-4 ring-sky-400 ring-offset-4" : ""}`}>
        <div>
          <p className="text-xs uppercase tracking-widest text-[#52d8c2]">Stage 1 command centre</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white">First 5 Jobs</h1>
          <p className="mt-1 text-xs text-slate-300">Track leads, quotes, jobs, margin, and money owing.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2 border-sky-200/50 bg-white/5 text-white hover:bg-white/10 hover:text-white" onClick={async () => { try { const attachments = !isDemo && activeRunId ? await listRunEvidence(activeRunId) : []; await downloadAccountantPack({ units, business: bd.profile, runId: activeRunId, attachments, attachmentDownloader: downloadEvidenceFile }); toast({ title: "Accountant Pack downloaded", description: `${attachments.length} attachment${attachments.length === 1 ? "" : "s"} included. Check QBO and bank feeds before importing or entering transactions.` }); } catch (error) { toast({ title: "Accountant Pack was not downloaded", description: error instanceof Error ? error.message : "An attachment could not be retrieved.", variant: "destructive" }); } }}>
            <Download className="h-4 w-4" />
            Accountant Pack
          </Button>
          {activeRunId ? (
            <Button asChild variant="outline" className="border-sky-200/50 bg-white/5 text-white hover:bg-white/10 hover:text-white">
              <Link to={`/autopsy/run/${activeRunId}`}>View Autopsy result</Link>
            </Button>
          ) : null}
          {!isDemo && setupChoicesSaved && bd.loaded && !bd.complete && (
            <Button onClick={() => setBdOpen(true)} className="gap-2 bg-[#1769d4] text-white hover:bg-[#145ebd]">
              <IdCard className="h-4 w-4" />
              Complete Business Details
            </Button>
          )}
          {(isDemo || (bd.loaded && bd.complete)) && (
            <Badge variant="outline" className="gap-1.5 border-emerald-300/60 bg-emerald-400/10 px-3 py-1.5 text-emerald-100">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Business Registration Ready
            </Badge>
          )}
        </div>
      </header>

      {!isDemo ? <QboSandboxConnectionCard /> : null}

      {!isDemo && setupChoicesLoaded && activeRunId && (
        <Card className={setupChoicesSaved ? "border-emerald-200 bg-emerald-50/40" : "border-sky-300 bg-sky-50/70"}>
          <CardContent className="flex flex-col gap-3 pt-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <Compass className={setupChoicesSaved ? "mt-0.5 h-5 w-5 text-emerald-700" : "mt-0.5 h-5 w-5 text-sky-700"} />
              <div>
                <p className="font-semibold">First 5 Jobs setup</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {setupChoicesSaved
                    ? "Your ABN and trading-name paths are saved. Hudson and the setup guide remain available."
                    : "Choose your ABN and trading-name paths. Hudson can show you around first."}
                </p>
              </div>
            </div>
            <Button asChild variant={setupChoicesSaved ? "outline" : "default"} className="shrink-0">
              <Link to={`/stage-1/orientation?runId=${encodeURIComponent(activeRunId)}`}>
                {setupChoicesSaved ? "Review setup choices" : "Set up First 5 Jobs"}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {!isDemo && setupChoicesLoaded && setupChoicesSaved && activeRunId && (
        <Card className="border-violet-200 bg-violet-50/40">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <BookOpen className="mt-0.5 h-5 w-5 text-violet-700" />
              <div>
                <p className="font-semibold">Getting Your First Five Jobs</p>
                <p className="mt-1 text-sm text-muted-foreground">Short practical lessons, scripts and quick checks for finding and winning your first work.</p>
              </div>
            </div>
            <Button asChild variant="outline" className="shrink-0 border-violet-300 bg-white">
              <Link to={`/stage-1/learning?runId=${encodeURIComponent(activeRunId)}`}>Open learning library</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {(isDemo || (setupChoicesLoaded && setupChoicesSaved && activeRunId)) && (
        <Card className="border-teal-200 bg-teal-50/40">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 text-teal-700" />
              <div>
                <p className="font-semibold">Cleaning Technical Guide</p>
                <p className="mt-1 text-sm text-muted-foreground">Start with what you can see, answer a few short questions and find the safe next step.</p>
              </div>
            </div>
            <Button asChild variant="outline" className="min-h-11 shrink-0 border-teal-300 bg-white">
              <Link to={isDemo ? "/stage-1/technical-guide?demo=1" : `/stage-1/technical-guide?runId=${encodeURIComponent(activeRunId ?? "")}`}>Open technical guide</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {(isDemo || (bd.loaded && bd.complete)) && (
        <p className="text-xs text-muted-foreground -mt-2">
          Business registration is ready. You can create written quotes and record Stage 1 transactions. The verified identity is locked; only the customer-facing business name can change.
        </p>
      )}

      {!isDemo && setupChoicesSaved && bd.loaded && !bd.canOperate && (
        <Card className="border-amber-300 bg-amber-50/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Let’s set up your Business Details first</CardTitle>
            <CardDescription>
              You can look around the summary, but quoting and job activity stay locked until your ABN is verified.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-amber-900 space-y-1">
              <p>Hudson: “Do you already have an ABN, or would you like the official steps for getting one?”</p>
              {bd.error ? <p className="text-xs text-destructive">{bd.error}</p> : null}
            </div>
            <Button onClick={() => setBdOpen(true)} className="gap-2 shrink-0">
              <IdCard className="h-4 w-4" />
              Choose your next step
            </Button>
          </CardContent>
        </Card>
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

      {/* Stage 1 Completion Evaluation — removed from the simplified Stage 1 workflow. */}
      {false && displayCompletion && (
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

      {/* Stage 1 Commitments — removed from the simplified Stage 1 workflow. */}
      {false && displayCommitments.length > 0 && (
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
            { k: "Quotes potential", v: potentialQuotes },
            { k: "Quotes generated", v: quotesSent },
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
          highlighted={hudsonTourActive && tourStep === 11}
          focusTarget="margin"
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
      <section data-hudson-focus="money-owing" className={`scroll-mt-6 space-y-3 ${tourActive && (tourStep === 9 || tourStep === 10) ? "relative z-40 rounded-xl ring-4 ring-sky-400 ring-offset-4" : ""}`}>
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
        activities={activities}
        leads={leadRecords}
        stageStartedAt={isDemo ? "2026-08-01" : stage1Snapshot?.started_at ?? null}
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
      <LogLeadActivityDialog
        open={logActOpen}
        onOpenChange={setLogActOpen}
        onSave={async (activity, potentialCustomers) => {
          if (!requireBusinessRegistration("log lead activity")) return;
          if (isDemo) {
            const createdAt = new Date().toISOString();
            const activityId = `demo-${Date.now()}`;
            setActivities((prev) => [...prev, { ...activity, id: activityId, created_at: createdAt }]);
            setLeadRecords((prev) => [
              ...prev,
              ...potentialCustomers.map((customer, index) => ({
                id: `${activityId}-lead-${index + 1}`,
                client_name: customer.client_name,
                contact_name: customer.contact_name,
                contact_email: customer.contact_email,
                contact_phone: customer.contact_phone,
                site_address: customer.site_address,
                source: activity.method,
                status: "new",
                estimated_value: 0,
                next_action_at: null,
                notes: null,
                created_at: createdAt,
              })),
            ]);
            setLogActOpen(false);
            return;
          }
          if (!activeRunId) return;
          try {
            const refreshed = await createStage1LeadActivityWithContacts(activeRunId, activity, potentialCustomers);
            setActivities(refreshed.activities);
            setLeadRecords(refreshed.leads);
            setLogActOpen(false);
          } catch (error) {
            toast({ title: "Lead activity was not saved", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
          }
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
        demoMode={isDemo}
      />
      {tourActive && !hudsonTourActive ? <Stage1WelcomeGuide mode={tourMode === "jobs" ? "jobs" : "dashboard"} initialStep={initialTourStep} autoPlay={tourAutoPlay} onClose={closeTour} onStepChange={handleTourStepChange} onJourneyBack={tourMode === "jobs" ? () => navigate("/stage-1/quote/demo-q-1004?demo=1&tour=document&step=2&autoplay=1") : undefined} onJourneyAction={tourMode === "jobs" ? undefined : () => navigate(isDemo ? "/stage-1/quotes?demo=1&tour=quotes&autoplay=1" : activeRunId ? `/stage-1/quotes?runId=${encodeURIComponent(activeRunId)}&tour=quotes&autoplay=1` : "/stage-1/quotes?tour=quotes&autoplay=1")} /> : null}
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
      <GovernedStage1Entry />
    </AuthGate>
  );
}

function GovernedStage1Entry() {
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const runId =
    searchParams.get("runId") || getStage1RunId() || getActiveRunId();
  const [admission, setAdmission] = useState<
    "loading" | "granted" | "denied"
  >("loading");

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id || !runId) {
      setAdmission("denied");
      return;
    }
    let active = true;
    setAdmission("loading");
    void getAuthorizedStage1Admission(runId)
      .then((granted) => {
        if (!active) return;
        setAdmission(granted ? "granted" : "denied");
      })
      .catch(() => {
        if (active) setAdmission("denied");
      });
    return () => {
      active = false;
    };
  }, [authLoading, runId, user?.id]);

  if (admission === "loading") {
    return (
      <main className="mx-auto flex max-w-xl items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking First 5 Jobs authority…
      </main>
    );
  }

  if (admission !== "granted") {
    return (
      <main className="mx-auto max-w-xl space-y-4 p-8 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-amber-600" />
        <h1 className="text-2xl font-semibold">First 5 Jobs is not authorised</h1>
        <p className="text-sm text-muted-foreground">
          Browser storage and links cannot open this stage. Supabase must hold
          an authorised Stage 1 progression record for your completed Autopsy.
        </p>
        {runId ? (
          <Button asChild variant="outline">
            <Link to={`/autopsy/run/${runId}`}>Return to your Autopsy result</Link>
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link to="/autopsy/history">View Autopsy history</Link>
          </Button>
        )}
      </main>
    );
  }

  return <Stage1DashboardInner />;
}

import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Job workspace persistence
//
// The Job / Contract Site Detail screen is a workspace over an existing job.
// Historical workspace reads remain while the legacy Stage 1 screen is
// quarantined. Browser-direct Core writes are prohibited by Packet 4. Every
// write-shaped helper fails closed until a separately authorised promotion
// transaction exists.
// ---------------------------------------------------------------------------

export interface WriteResult {
  ok: boolean;
  error?: string;
}

export const CORE_WRITE_UNAVAILABLE =
  "Core changes are unavailable. Selective Discover-to-Control promotion is not implemented.";

const coreWriteUnavailable = (): WriteResult => ({ ok: false, error: CORE_WRITE_UNAVAILABLE });

// ===== Revenue events (Payment Proof) — table: revenue_events =====
// Historical read model only. Packet 4 revokes authenticated Core DML.
export interface RevenueEventRow {
  id: string;
  job_id: string;
  amount: number;
  source: string | null;
  reference: string | null;
  revenue_type: string | null;
  created_at: string;
}

export interface RevenueControlRow {
  job_id: string;
  approved_job_value: number | null;
  revenue_collected: number | null;
  outstanding_balance: number | null;
  collection_status: string | null;
}

export async function loadRevenue(jobId: string): Promise<{
  events: RevenueEventRow[];
  control: RevenueControlRow | null;
}> {
  const [evRes, ctrlRes] = await Promise.all([
    supabase
      .from("revenue_events")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false }),
    supabase.from("core_job_revenue_control").select("*").eq("job_id", jobId).maybeSingle(),
  ]);
  return {
    events: (evRes.data ?? []) as RevenueEventRow[],
    control: (ctrlRes.data ?? null) as RevenueControlRow | null,
  };
}

export async function recordPayment(input: {
  jobId: string;
  amount: number;
  source: string;
  revenueType?: string;
  reference?: string;
}): Promise<WriteResult> {
  void input;
  return coreWriteUnavailable();
}

// ===== Job Costs — table: job_costs (RLS BLOCKED for insert) =====
// Verified live columns: id, job_id, labour_cost, consumables_cost, travel_cost,
// labour_hours, labour_rate, notes, created_at, updated_at.
// There is NO materials/subcontractor/other column and NO generic amount column.
// Inserts currently fail with 42501 until an INSERT policy is added (see
// BACKEND_BLOCKERS / the SQL in the build report).
export interface JobCostsInput {
  jobId: string;
  labourCost?: number;
  consumablesCost?: number;
  travelCost?: number;
  labourHours?: number;
  labourRate?: number;
  notes?: string;
}

export async function saveJobCosts(input: JobCostsInput): Promise<WriteResult> {
  void input;
  return coreWriteUnavailable();
}

// ===== Customer Invoice / Contract proof — table: documents (RLS BLOCKED) =====
// Verified live columns: id, file_url, entity_id, entity_type, created_at.
// documents is POLYMORPHIC — there is NO job_id column. A document is linked to
// a job via entity_type='job' + entity_id=<jobs.id>. Inserts currently fail with
// 42501 until an INSERT policy is added.
export async function saveDocument(input: {
  jobId: string;
  fileUrl: string;
}): Promise<WriteResult> {
  void input;
  return coreWriteUnavailable();
}

// ===== Activity / audit trail — table: audit_log (RLS BLOCKED) =====
// Verified live columns: id, action, entity, entity_id, created_at.
// audit_log is a generic trail (action/entity), not a per-job next-action log.
export async function appendAuditLog(input: {
  action: string;
  jobId: string;
}): Promise<WriteResult> {
  void input;
  return coreWriteUnavailable();
}

// ===== Value adjustments / write-offs — historical read model only =====
export type AdjustmentType = "write_off" | "credit" | "approved_reduction";

export const ADJUSTMENT_TYPES: { value: AdjustmentType; label: string }[] = [
  { value: "write_off", label: "Write-Off" },
  { value: "credit", label: "Credit" },
  { value: "approved_reduction", label: "Approved Reduction" },
];

export const adjustmentTypeLabel = (v: string) =>
  ADJUSTMENT_TYPES.find((t) => t.value === v)?.label ?? v;

export interface AdjustmentRow {
  id: string;
  job_id: string;
  adjustment_type: AdjustmentType;
  amount: number;
  reason: string;
  approved_by_customer: boolean;
  document_reference: string | null;
  created_at: string;
}

export async function loadAdjustments(jobId: string): Promise<AdjustmentRow[]> {
  const { data, error } = await supabase
    .from("job_value_adjustments")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as AdjustmentRow[];
}

export async function saveAdjustment(input: {
  jobId: string;
  adjustmentType: AdjustmentType;
  amount: number;
  reason: string;
  approvedByCustomer: boolean;
  documentReference?: string;
}): Promise<WriteResult> {
  void input;
  return coreWriteUnavailable();
}

// Adjusted financial position derived client-side, since the job_revenue_control
// view does not yet subtract approved adjustments. Revenue collected is always
// the real amount paid; adjustments reduce the collectible value, never revenue.
export interface AdjustedPosition {
  approvedJobValue: number;
  revenueCollected: number;
  approvedAdjustments: number;
  adjustedApprovedValue: number;
  outstanding: number;
  statusKey: string;
  statusLabel: string;
  statusTone: string;
}

export function deriveAdjustedPosition(
  control: RevenueControlRow | null,
  adjustments: AdjustmentRow[],
  fallbackApprovedValue = 0,
): AdjustedPosition {
  const approvedJobValue =
    control?.approved_job_value != null && Number(control.approved_job_value) > 0
      ? Number(control.approved_job_value)
      : fallbackApprovedValue;
  const revenueCollected = Number(control?.revenue_collected ?? 0);
  const approvedAdjustments = adjustments.reduce((s, a) => s + Number(a.amount ?? 0), 0);
  const adjustedApprovedValue = approvedJobValue - approvedAdjustments;
  const outstanding = approvedJobValue - revenueCollected - approvedAdjustments;

  let statusKey = control?.collection_status ?? "outstanding_balance";
  if (approvedJobValue > 0) {
    if (outstanding <= 0 && approvedAdjustments > 0) statusKey = "closed_with_write_off";
    else if (outstanding <= 0) statusKey = "fully_collected";
    else statusKey = "outstanding_balance";
  }

  const labels: Record<string, { label: string; tone: string }> = {
    closed_with_write_off: { label: "Closed with Write-Off", tone: "text-emerald-600" },
    fully_collected: { label: "Fully Collected", tone: "text-emerald-600" },
    outstanding_balance: { label: "Outstanding Balance", tone: "text-amber-600" },
    over_collected_review: { label: "Over-Collection — Review", tone: "text-red-600" },
    missing_quote_control: { label: "Missing Quote Control", tone: "text-muted-foreground" },
  };
  const meta = labels[statusKey] ?? { label: statusKey, tone: "text-muted-foreground" };
  return {
    approvedJobValue,
    revenueCollected,
    approvedAdjustments,
    adjustedApprovedValue,
    outstanding,
    statusKey,
    statusLabel: meta.label,
    statusTone: meta.tone,
  };
}

// ===== Customer handover + referrals — historical read model only =====
export type SatisfactionStatus =
  | "satisfied"
  | "satisfied_with_minor_issue"
  | "not_satisfied"
  | "not_available";

export const SATISFACTION_OPTIONS: { value: SatisfactionStatus; label: string }[] = [
  { value: "satisfied", label: "Satisfied" },
  { value: "satisfied_with_minor_issue", label: "Satisfied (minor issue)" },
  { value: "not_satisfied", label: "Not satisfied" },
  { value: "not_available", label: "Not available" },
];

export type ThankYouAction =
  | "handwritten_card"
  | "sms"
  | "email"
  | "leave_behind_note"
  | "care_checklist"
  | "other";

export const THANK_YOU_OPTIONS: { value: ThankYouAction; label: string }[] = [
  { value: "handwritten_card", label: "Handwritten card" },
  { value: "sms", label: "SMS" },
  { value: "email", label: "Email" },
  { value: "leave_behind_note", label: "Leave-behind note" },
  { value: "care_checklist", label: "Care checklist" },
  { value: "other", label: "Other" },
];

export const satisfactionLabel = (v: string | null) =>
  SATISFACTION_OPTIONS.find((s) => s.value === v)?.label ?? v ?? "—";
export const thankYouLabel = (v: string | null) =>
  THANK_YOU_OPTIONS.find((s) => s.value === v)?.label ?? v ?? "—";

export interface ReferralRow {
  id: string;
  handover_id: string | null;
  source_job_id: string;
  referral_name: string | null;
  referral_phone: string | null;
  referral_email: string | null;
  referral_notes: string | null;
  created_at: string;
}

export interface HandoverRow {
  id: string;
  job_id: string;
  work_completed_as_agreed: boolean | null;
  customer_walkthrough_completed: boolean | null;
  satisfaction_status: SatisfactionStatus | null;
  issue_notes: string | null;
  payment_status_checked: boolean | null;
  referral_request_made: boolean | null;
  referral_count: number | null;
  thank_you_action: ThankYouAction | null;
  thank_you_notes: string | null;
  created_at: string;
}

export interface ReferralInput {
  name?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export async function loadHandover(jobId: string): Promise<{
  handover: HandoverRow | null;
  referrals: ReferralRow[];
}> {
  const { data: hData } = await supabase
    .from("job_handovers")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const handover = (hData ?? null) as HandoverRow | null;
  const { data: rData } = await supabase
    .from("job_referrals")
    .select("*")
    .eq("source_job_id", jobId)
    .order("created_at", { ascending: false });
  const referrals = (rData ?? []) as ReferralRow[];
  return { handover, referrals };
}

export async function saveHandover(input: {
  jobId: string;
  workCompletedAsAgreed: boolean;
  customerWalkthroughCompleted: boolean;
  satisfactionStatus: SatisfactionStatus;
  issueNotes?: string;
  paymentStatusChecked: boolean;
  referralRequestMade: boolean;
  referralCount: number;
  thankYouAction?: ThankYouAction;
  thankYouNotes?: string;
  referrals?: ReferralInput[];
}): Promise<WriteResult & { handoverId?: string; referralsSaved?: number }> {
  void input;
  return coreWriteUnavailable();
}

// ===== Job status (Status & Next Action) — write unavailable =====
export async function updateJobStatus(
  jobId: string,
  patch: { status?: string; scheduledDate?: string; completed?: boolean },
): Promise<WriteResult> {
  void jobId;
  void patch;
  return coreWriteUnavailable();
}

// ===== Known backend blockers — surfaced to the operator, never hidden =====
// Packet 4 supersedes historical publishable-key write assumptions.
export const BACKEND_BLOCKERS = {
  core_writes: CORE_WRITE_UNAVAILABLE,
  documents:
    "documents — Row Level Security blocks inserts (42501). Needs an INSERT policy. Linked polymorphically via entity_type='job' + entity_id=job_id.",
  job_costs:
    "job_costs — Row Level Security blocks inserts (42501). Needs an INSERT policy.",
  audit_log:
    "audit_log — Row Level Security blocks inserts (42501). Needs an INSERT policy.",
  business_expenses:
    "business_expenses — table does not exist (PGRST205). Needs to be created.",
  activity_log:
    "activity_log — table does not exist (PGRST205). Needs to be created.",
} as const;

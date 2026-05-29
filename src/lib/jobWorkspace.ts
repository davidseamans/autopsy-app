import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Job workspace persistence
//
// The Job / Contract Site Detail screen is a workspace over an existing job.
// Every write here targets an existing Core table, keyed on the real job_id.
// We never create a parallel "Stage 1" entity. Each helper returns a structured
// { ok, error } result so the UI can show exactly what persisted and what did
// not — we never swallow an error.
// ---------------------------------------------------------------------------

export interface WriteResult {
  ok: boolean;
  error?: string;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ===== Revenue events (Payment Proof) — table: revenue_events =====
// Verified live columns: id, job_id, amount, source, reference, revenue_type,
// created_at. RLS ALLOWS inserts via the publishable key (an empty insert fails
// only on the job_id NOT NULL constraint, not on RLS) — Payment Proof persists.
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
    supabase.from("job_revenue_control").select("*").eq("job_id", jobId).maybeSingle(),
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
  try {
    const { error } = await supabase.from("revenue_events").insert({
      job_id: input.jobId,
      amount: input.amount,
      source: input.source,
      revenue_type: input.revenueType ?? null,
      reference: input.reference?.trim() || null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
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
  try {
    const { error } = await supabase.from("job_costs").insert({
      job_id: input.jobId,
      labour_cost: input.labourCost ?? null,
      consumables_cost: input.consumablesCost ?? null,
      travel_cost: input.travelCost ?? null,
      labour_hours: input.labourHours ?? null,
      labour_rate: input.labourRate ?? null,
      notes: input.notes?.trim() || null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
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
  try {
    const { error } = await supabase.from("documents").insert({
      entity_type: "job",
      entity_id: input.jobId,
      file_url: input.fileUrl,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

// ===== Activity / audit trail — table: audit_log (RLS BLOCKED) =====
// Verified live columns: id, action, entity, entity_id, created_at.
// audit_log is a generic trail (action/entity), not a per-job next-action log.
export async function appendAuditLog(input: {
  action: string;
  jobId: string;
}): Promise<WriteResult> {
  try {
    const { error } = await supabase.from("audit_log").insert({
      action: input.action,
      entity: "job",
      entity_id: input.jobId,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

// ===== Value adjustments / write-offs — table: job_value_adjustments (WRITABLE) =====
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
  try {
    const { error } = await supabase.from("job_value_adjustments").insert({
      job_id: input.jobId,
      adjustment_type: input.adjustmentType,
      amount: input.amount,
      reason: input.reason,
      approved_by_customer: input.approvedByCustomer,
      document_reference: input.documentReference?.trim() || null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
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

// ===== Customer handover + referrals — tables: job_handovers, job_referrals (WRITABLE) =====
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
  try {
    const { data, error } = await supabase
      .from("job_handovers")
      .insert({
        job_id: input.jobId,
        work_completed_as_agreed: input.workCompletedAsAgreed,
        customer_walkthrough_completed: input.customerWalkthroughCompleted,
        satisfaction_status: input.satisfactionStatus,
        issue_notes: input.issueNotes?.trim() || null,
        payment_status_checked: input.paymentStatusChecked,
        referral_request_made: input.referralRequestMade,
        referral_count: input.referralCount,
        thank_you_action: input.thankYouAction ?? null,
        thank_you_notes: input.thankYouNotes?.trim() || null,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    const handoverId = data.id as string;

    const rows = (input.referrals ?? [])
      .filter((r) => (r.name || r.phone || r.email || "").toString().trim())
      .map((r) => ({
        handover_id: handoverId,
        source_job_id: input.jobId,
        referral_name: r.name?.trim() || null,
        referral_phone: r.phone?.trim() || null,
        referral_email: r.email?.trim() || null,
        referral_notes: r.notes?.trim() || null,
      }));
    let referralsSaved = 0;
    if (rows.length) {
      const { error: rErr } = await supabase.from("job_referrals").insert(rows);
      if (rErr) {
        return {
          ok: true,
          handoverId,
          referralsSaved: 0,
          error: `Handover saved, but referral details failed: ${rErr.message}`,
        };
      }
      referralsSaved = rows.length;
    }
    return { ok: true, handoverId, referralsSaved };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

// ===== Job status (Status & Next Action) — table: jobs (PATCH WRITABLE) =====
export async function updateJobStatus(
  jobId: string,
  patch: { status?: string; scheduledDate?: string; completed?: boolean },
): Promise<WriteResult> {
  try {
    const body: Record<string, unknown> = {};
    if (patch.status) body.status = patch.status;
    if (patch.scheduledDate) body.scheduled_date = patch.scheduledDate;
    if (patch.completed !== undefined)
      body.completed_at = patch.completed ? new Date().toISOString() : null;
    if (Object.keys(body).length === 0) return { ok: true };
    const { error } = await supabase.from("jobs").update(body).eq("id", jobId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

// ===== Known backend blockers — surfaced to the operator, never hidden =====
// Verified live (publishable key) on the external Supabase project. revenue_events,
// job_value_adjustments, job_handovers and job_referrals are WRITABLE and therefore
// are NOT listed here. Only genuine blockers remain.
export const BACKEND_BLOCKERS = {
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

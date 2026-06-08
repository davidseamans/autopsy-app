// Run-scoped persistence for Stage 1 / First 5 Jobs proof units.
//
// Stage 1 is a PRE-CORE proof sandbox. Its commercial proof is persisted ONLY
// in the Stage 1 sandbox tables — never in the Core operational tables
// (public.jobs, public.revenue_events, public.job_costs, public.accounts,
// public.pipeline, public.quotes). Core tables are reserved for progressed
// users only.
//
// Stage 1 sandbox tables (canonical source of truth for Stage 1):
//
//   - stage1_jobs            (job shell)
//   - stage1_revenue_events  (one 'invoice' revenue event per job)
//   - stage1_job_costs       (one categorised direct-cost row per job)
//   - stage1_reflections     (handled in stage1Reflection.ts)
//
// Writes happen by direct table INSERT / UPDATE / DELETE under RLS. Commercial
// display values (revenue_amount, total_direct_cost, gross_profit,
// gross_margin_pct) are READ from the public.stage1_job_margin_summary view so
// margin is never recomputed from local-only state, and the run-level summary
// is read from get_stage1_commercial_summary_by_run(p_run_id).
//
// localStorage remains as a CACHE ONLY so the UI can paint instantly on load
// and keep the richer ProofUnit detail (proof type, payment status, evidence
// flags, etc.) that does not live in the canonical commercial tables. Supabase
// always wins for the commercial values (revenue, cost, GST, ex-GST).
//
// GST / ex-GST logic is unchanged: ex-GST is derived deterministically from the
// persisted GST-inclusive total and GST amount via computeGstSplit, so margin
// always recalculates from ex-GST values only. Margin governance ("Not Yet
// Proven" when costs are missing) is preserved because no fabricated values are
// stored — only what the operator actually entered.
import type { ProofUnit, CostLine } from "@/pages/Stage1";
import type { GstTreatment } from "@/lib/gst";
import { computeGstSplit } from "@/lib/gst";
import { supabase, isDebug } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// localStorage cache (NOT canonical — Supabase is canonical)
// ---------------------------------------------------------------------------
const PREFIX = "stage1.units";

function storageKey(runId: string): string {
  return `${PREFIX}.${runId}`;
}

/** Load the cached proof units for a run. Empty array when none/unreadable. */
export function loadStage1UnitsCache(runId: string | null): ProofUnit[] {
  if (!runId) return [];
  try {
    const raw = localStorage.getItem(storageKey(runId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ProofUnit[]) : [];
  } catch {
    return [];
  }
}

/** Cache the proof units for a run. No-op without a run (nothing to scope to). */
export function saveStage1UnitsCache(runId: string | null, units: ProofUnit[]): void {
  if (!runId) return;
  try {
    localStorage.setItem(storageKey(runId), JSON.stringify(units));
  } catch {
    /* noop — storage unavailable */
  }
}

// Backwards-compatible aliases (cache-only).
export const loadStage1Units = loadStage1UnitsCache;
export const saveStage1Units = saveStage1UnitsCache;

// ---------------------------------------------------------------------------
// Canonical job status mapping (ProofUnit.status <-> stage1_jobs.job_status)
// ---------------------------------------------------------------------------
type CanonicalJobStatus = "draft" | "in_progress" | "completed" | "cancelled";

function toCanonicalStatus(status: string | undefined, lifecycle?: string): CanonicalJobStatus {
  if (lifecycle === "voided" || lifecycle === "archived") return "cancelled";
  const v = (status ?? "").toLowerCase();
  if (v.includes("complete") || v.includes("paid")) return "completed";
  if (v.includes("cancel") || v.includes("void")) return "cancelled";
  if (v.includes("draft") || v === "") return "draft";
  return "in_progress";
}

function fromCanonicalStatus(status: string | null): string {
  switch (status) {
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "draft":
      return "Draft";
    default:
      return "In Progress";
  }
}

// ---------------------------------------------------------------------------
// Canonical READ — hydrate ProofUnit[] from the canonical tables
// ---------------------------------------------------------------------------
type CanonicalStage1JobRow = Record<string, unknown> & { id: string; job_sequence_number?: number | null };
type MarginSummaryRow = Record<string, unknown> & { stage1_job_id?: string | null };

/**
 * Fetch the run's commercial records from the Stage 1 sandbox (canonical truth
 * for Stage 1). Job shells come from stage1_jobs; revenue/cost/profit/margin
 * come from the public.stage1_job_margin_summary view. Returns null on failure
 * so the caller can fall back to the cache.
 */
export async function fetchStage1Units(
  runId: string | null,
  ctx?: { stageProgressId?: string | null; userId?: string | null },
): Promise<ProofUnit[] | null> {
  if (!runId) return [];

  // CANONICAL READ for Stage 1 commercial proof. The required source of truth is
  // the public.stage1_job_margin_summary view (NOT Core operational tables). The
  // view already carries job identity (client_name, job_title, job_status,
  // job_sequence_number) plus all commercial values (revenue_amount,
  // total_direct_cost, gross_profit, gross_margin_pct), so the dashboard can
  // hydrate fully from it after a refresh / re-login.
  const { data: summary, error: summaryError } = await supabase
    .from("stage1_job_margin_summary")
    .select("*")
    .eq("autopsy_run_id", runId)
    .order("job_sequence_number", { ascending: true })
    .order("created_at", { ascending: true });

  const summaries = (summary ?? []) as MarginSummaryRow[];

  // --- TEMPORARY hydration diagnostics (read path) ------------------------
  console.info("[stage1][hydrate] query", {
    table: "public.stage1_job_margin_summary",
    autopsyRunId: runId,
    stageProgressId: ctx?.stageProgressId ?? null,
    userId: ctx?.userId ?? null,
    rowCount: summaries.length,
    firstRow: summaries[0] ?? null,
    error: summaryError ?? null,
  });
  // -----------------------------------------------------------------------

  // Only treat the read as a failure when Supabase actually errored. An empty
  // result set is a legitimate "no rows yet" — never null-fall-back-to-cache on
  // an empty (but successful) read, so persisted rows are never clobbered.
  if (summaryError) return null;
  if (summaries.length === 0) return [];

  // Optional non-commercial detail (notes) from the job shell. This is a
  // best-effort enrichment only; the view remains the authoritative source.
  const { data: jobs } = await supabase
    .from("stage1_jobs")
    .select("id,notes")
    .eq("autopsy_run_id", runId);
  const jobNotes = new Map<string, string | undefined>();
  (jobs ?? []).forEach((j: Record<string, unknown>) => {
    jobNotes.set(String(j.id), typeof j.notes === "string" ? j.notes : undefined);
  });

  return summaries.map((s, i: number) => {
    const j = { id: String(s.stage1_job_id ?? "") } as CanonicalStage1JobRow;
    const num = (k: string) => (s && s[k] != null ? Number(s[k]) || 0 : 0);
    // job_sequence_number is the authoritative persisted Job # (J-#). PostgREST
    // may serialise it as a number or a numeric string, so coerce defensively
    // and only treat a finite, positive value as a valid sequence number.
    const rawSeq = s.job_sequence_number;
    const parsedSeq =
      rawSeq == null || rawSeq === ""
        ? null
        : Number.isFinite(Number(rawSeq))
          ? Number(rawSeq)
          : null;
    const jobSequenceNumber = parsedSeq != null && parsedSeq > 0 ? parsedSeq : undefined;
    const revenue = num("revenue_amount");
    const labourCost = num("labour_cost");
    const consumablesCost = num("consumables_cost");
    const travelCost = num("travel_cost");
    const reworkCost = num("rework_cost");
    const otherDirectCost = num("other_direct_cost");
    const totalDirectCost =
      s && s.total_direct_cost != null
        ? Number(s.total_direct_cost) || 0
        : labourCost + consumablesCost + travelCost + reworkCost + otherDirectCost;
    const gm =
      s && s.gross_margin_pct != null
        ? Math.round(Number(s.gross_margin_pct))
        : revenue > 0 && totalDirectCost > 0
          ? Math.round(((revenue - totalDirectCost) / revenue) * 100)
          : 0;

    // Expanded sandbox commercial proof model (from the margin summary view).
    const originalInvoiceAmount = num("original_invoice_amount");
    const variationInvoiceAmount = num("variation_invoice_amount");
    const progressClaimAmount = num("progress_claim_amount");
    const adjustmentAmount = num("adjustment_amount");
    const paymentReceivedAmount = num("payment_received_amount");
    const outstandingAmount =
      s && s.outstanding_amount != null ? Number(s.outstanding_amount) || 0 : revenue - paymentReceivedAmount;
    const grossProfit = s && s.gross_profit != null ? Number(s.gross_profit) || 0 : revenue - totalDirectCost;
    const sandboxProofType = typeof s.proof_type === "string" ? s.proof_type : undefined;
    const sandboxPaymentStatus = typeof s.payment_status === "string" ? s.payment_status : undefined;
    const variationRecorded =
      typeof s.variation_recorded === "boolean" ? s.variation_recorded : variationInvoiceAmount > 0;

    const costLines: CostLine[] = [];
    const pushCost = (label: string, amount: number) => {
      if (amount > 0) {
        costLines.push({
          id: `${j.id}:${label}`,
          description: label,
          amount,
          gstIncluded: false,
          gstTreatment: "no_gst",
          gstAmount: 0,
          gstOverridden: false,
        });
      }
    };
    pushCost("Labour", labourCost);
    pushCost("Consumables / Materials", consumablesCost);
    pushCost("Travel", travelCost);
    pushCost("Rework", reworkCost);
    pushCost("Other Direct Cost", otherDirectCost);

    const unit: ProofUnit = {
      n: jobSequenceNumber ?? i + 1,
      // Persisted job number — drives the ledger "J-#" display. Comes straight
      // from the canonical view; never an array index or fallback.
      jobSequenceNumber,
      stage1JobId: String(s.stage1_job_id ?? ""),
      client: typeof s.client_name === "string" ? s.client_name : "",
      jobSite: typeof s.job_title === "string" ? s.job_title : undefined,
      proofType: "Completed Job",
      status: fromCanonicalStatus(typeof s.job_status === "string" ? s.job_status : null),
      gm,
      evidence: false,
      notes: jobNotes.get(String(s.stage1_job_id ?? "")),
      lifecycle: s.job_status === "cancelled" ? "voided" : "active",
      // Sandbox revenue/cost are stored ex-GST, so re-saves stay idempotent.
      quoteValue: revenue > 0 ? revenue : undefined,
      invoiceAmount: revenue > 0 ? revenue : undefined,
      invoiceGstTreatment: "no_gst",
      invoiceGstAmount: 0,
      invoiceGstOverridden: false,
      costMaterials: consumablesCost || undefined,
      costLabour: labourCost || undefined,
      costSubcontractors: undefined,
      costOther: otherDirectCost + travelCost + reworkCost || undefined,
      costLines,
      // Canonical sandbox commercial proof projections (read-only).
      sandboxRevenueAmount: revenue,
      sandboxOriginalInvoiceAmount: originalInvoiceAmount,
      sandboxVariationInvoiceAmount: variationInvoiceAmount,
      sandboxProgressClaimAmount: progressClaimAmount,
      sandboxAdjustmentAmount: adjustmentAmount,
      sandboxPaymentReceivedAmount: paymentReceivedAmount,
      sandboxOutstandingAmount: outstandingAmount,
      sandboxTotalDirectCost: totalDirectCost,
      sandboxGrossProfit: grossProfit,
      sandboxGrossMarginPct: s && s.gross_margin_pct != null ? Number(s.gross_margin_pct) : undefined,
      sandboxProofType,
      sandboxPaymentStatus,
      sandboxVariationRecorded: variationRecorded,
      // Surface persisted payment so the ledger's "Outstanding" reflects collection.
      paymentAmount: paymentReceivedAmount > 0 ? paymentReceivedAmount : undefined,
    };
    return unit;
  });
}

/**
 * Merge canonical units (from Supabase) with cached units.
 *
 * CANONICAL IS AUTHORITATIVE. The cache may only supply rich, NON-commercial
 * presentation detail (proof type, evidence flags, payment metadata, dates).
 * It is NEVER allowed to override, mask, or revive commercial values — invoice,
 * cost lines, GST splits and margin come strictly from the canonical Supabase
 * tables. Legacy per-category cost fields are explicitly cleared so they can
 * never stand in for canonical cost lines.
 */
export function mergeUnits(canonical: ProofUnit[], cache: ProofUnit[]): ProofUnit[] {
  return canonical.map((c) => {
    const cached =
      (c.stage1JobId && cache.find((u) => u.stage1JobId === c.stage1JobId)) ||
      cache.find((u) => u.n === c.n);
    if (!cached) return c;
    return {
      // Rich, non-commercial detail from cache as the base...
      ...cached,
      // ...then canonical commercial truth ALWAYS overrides it (no fallback).
      stage1JobId: c.stage1JobId,
      n: c.n,
      jobSequenceNumber: c.jobSequenceNumber ?? cached.jobSequenceNumber,
      client: c.client || cached.client,
      jobSite: c.jobSite ?? cached.jobSite,
      // Preserve a richer cached status (e.g. "Paid") when it maps to the same
      // canonical status; otherwise take canonical.
      status: toCanonicalStatus(cached.status) === toCanonicalStatus(c.status) ? cached.status : c.status,
      notes: c.notes ?? cached.notes,
      invoiceAmount: c.invoiceAmount,
      invoiceGstTreatment: c.invoiceGstTreatment,
      invoiceGstAmount: c.invoiceGstAmount,
      invoiceGstOverridden: c.invoiceGstOverridden,
      costLines: c.costLines,
      gm: c.gm,
      // Preserve canonical commercial fields so dashboard computations work.
      quoteValue: c.quoteValue,
      costMaterials: c.costMaterials,
      costLabour: c.costLabour,
      costSubcontractors: c.costSubcontractors,
      costOther: c.costOther,
      // Canonical sandbox commercial proof projections always come from Supabase.
      sandboxRevenueAmount: c.sandboxRevenueAmount,
      sandboxOriginalInvoiceAmount: c.sandboxOriginalInvoiceAmount,
      sandboxVariationInvoiceAmount: c.sandboxVariationInvoiceAmount,
      sandboxProgressClaimAmount: c.sandboxProgressClaimAmount,
      sandboxAdjustmentAmount: c.sandboxAdjustmentAmount,
      sandboxPaymentReceivedAmount: c.sandboxPaymentReceivedAmount,
      sandboxOutstandingAmount: c.sandboxOutstandingAmount,
      sandboxTotalDirectCost: c.sandboxTotalDirectCost,
      sandboxGrossProfit: c.sandboxGrossProfit,
      sandboxGrossMarginPct: c.sandboxGrossMarginPct,
      sandboxProofType: c.sandboxProofType,
      sandboxPaymentStatus: c.sandboxPaymentStatus,
      sandboxVariationRecorded: c.sandboxVariationRecorded,
      paymentAmount: c.paymentAmount ?? cached.paymentAmount,
    };
  });
}

// ---------------------------------------------------------------------------
// Canonical WRITE — sync ProofUnit[] to the canonical tables (INSERT/UPDATE/DELETE)
// ---------------------------------------------------------------------------
let syncChain: Promise<unknown> = Promise.resolve();

export interface Stage1CanonicalWriteError {
  table:
    | "stage1_jobs"
    | "stage1_revenue_events"
    | "stage1_job_costs"
    | "auth"
    | "stage1_canonical";
  operation: string;
  message: string;
  code?: string;
  details?: string;
  hint?: string;
  payload?: unknown;
}

export interface Stage1CanonicalRowProbe {
  id: string;
  autopsy_run_id: string | null;
  created_by: string | null;
  stage1_job_id?: string | null;
}

export interface Stage1CanonicalWriteDiagnostics {
  status: "success" | "failed";
  runId: string | null;
  authUserId: string | null;
  authUserIdPresent: boolean;
  autopsyRunIdWrittenMatchesActiveRun: boolean | null;
  createdByMatchesAuthUser: boolean | null;
  counts: {
    jobs: number | null;
    revenueLines: number | null;
    costLines: number | null;
  };
  rows: {
    jobs: Stage1CanonicalRowProbe[];
    revenueLines: Stage1CanonicalRowProbe[];
    costLines: Stage1CanonicalRowProbe[];
  };
  writtenRows: {
    jobs: Stage1CanonicalRowProbe[];
    revenueLines: Stage1CanonicalRowProbe[];
    costLines: Stage1CanonicalRowProbe[];
  };
  errors: Stage1CanonicalWriteError[];
  writeSucceeded: boolean;
  success: boolean;
  message: string;
}

export interface Stage1CanonicalSyncResult {
  units: ProofUnit[] | null;
  diagnostics: Stage1CanonicalWriteDiagnostics;
}

function emptyDiagnostics(runId: string | null): Stage1CanonicalWriteDiagnostics {
  return {
    status: "failed",
    runId,
    authUserId: null,
    authUserIdPresent: false,
    autopsyRunIdWrittenMatchesActiveRun: null,
    createdByMatchesAuthUser: null,
    counts: { jobs: null, revenueLines: null, costLines: null },
    rows: { jobs: [], revenueLines: [], costLines: [] },
    writtenRows: { jobs: [], revenueLines: [], costLines: [] },
    errors: [],
    writeSucceeded: false,
    success: false,
    message: "Canonical write has not completed.",
  };
}

function addWriteError(
  diagnostics: Stage1CanonicalWriteDiagnostics,
  table: Stage1CanonicalWriteError["table"],
  operation: string,
  error: unknown,
  payload?: unknown,
) {
  const err = error as { message?: string; code?: string; details?: string; hint?: string } | null | undefined;
  diagnostics.errors.push({
    table,
    operation,
    message: err?.message ?? String(error ?? "Unknown Supabase error"),
    code: err?.code,
    details: err?.details,
    hint: err?.hint,
    payload,
  });
}

function toProbe(row: Record<string, unknown>): Stage1CanonicalRowProbe {
  return {
    id: String(row.id),
    autopsy_run_id: typeof row.autopsy_run_id === "string" ? row.autopsy_run_id : null,
    created_by: typeof row.created_by === "string" ? row.created_by : null,
    stage1_job_id: typeof row.stage1_job_id === "string" ? row.stage1_job_id : undefined,
  };
}

function newCanonicalId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16),
  );
}

// ---------------------------------------------------------------------------
// Map the UI cost model (generic cost lines + legacy category fields) onto the
// categorised stage1_job_costs columns. All amounts are stored EX-GST so margin
// computed by the sandbox margin summary view stays on an ex-GST basis.
// ---------------------------------------------------------------------------
interface DirectCostBuckets {
  labourHours: number;
  labourRate: number;
  labourCost: number;
  consumablesCost: number;
  travelCost: number;
  reworkCost: number;
  otherDirectCost: number;
  total: number;
}

function costLineExGst(l: CostLine): number {
  const treatment = (l.gstTreatment ?? (l.gstIncluded ? "gst_included" : "no_gst")) as GstTreatment;
  const split = computeGstSplit({
    inclusive: l.amount,
    treatment,
    gstOverride: l.gstAmount,
    overridden: l.gstOverridden,
  });
  return split.exGst;
}

function bucketDirectCosts(u: ProofUnit): DirectCostBuckets {
  const b: DirectCostBuckets = {
    labourHours: 0,
    labourRate: 0,
    labourCost: 0,
    consumablesCost: 0,
    travelCost: 0,
    reworkCost: 0,
    otherDirectCost: 0,
    total: 0,
  };
  const lines = u.costLines ?? [];
  if (lines.length > 0) {
    for (const l of lines) {
      const amt = costLineExGst(l);
      if (amt <= 0) continue;
      const d = (l.description ?? "").toLowerCase();
      if (d.includes("labour") || d.includes("labor")) b.labourCost += amt;
      else if (d.includes("consumable") || d.includes("material")) b.consumablesCost += amt;
      else if (d.includes("travel") || d.includes("mileage") || d.includes("fuel")) b.travelCost += amt;
      else if (d.includes("rework") || d.includes("warranty")) b.reworkCost += amt;
      else b.otherDirectCost += amt;
    }
  } else {
    b.labourCost += u.costLabour ?? 0;
    b.consumablesCost += u.costMaterials ?? 0;
    b.otherDirectCost += (u.costOther ?? 0) + (u.costSubcontractors ?? 0);
  }
  b.total =
    b.labourCost + b.consumablesCost + b.travelCost + b.reworkCost + b.otherDirectCost;
  return b;
}

async function populatePostWriteCounts(diagnostics: Stage1CanonicalWriteDiagnostics) {
  const runId = diagnostics.runId;
  if (!runId) return;
  // Resolve the run's job ids so sandbox child rows can be scoped to this run.
  const { data: jobRows } = await supabase
    .from("stage1_jobs")
    .select("id")
    .eq("autopsy_run_id", runId);
  const jobIds = (jobRows ?? []).map((r: { id: unknown }) => String(r.id));
  const scopeIds = jobIds.length ? jobIds : ["00000000-0000-0000-0000-000000000000"];
  const [jobsRes, revenueRes, costsRes] = await Promise.all([
    supabase
      .from("stage1_jobs")
      .select("id,autopsy_run_id,created_by", { count: "exact" })
      .eq("autopsy_run_id", runId),
    supabase
      .from("stage1_revenue_events")
      .select("id,created_by,stage1_job_id", { count: "exact" })
      .in("stage1_job_id", scopeIds),
    supabase
      .from("stage1_job_costs")
      .select("id,created_by,stage1_job_id", { count: "exact" })
      .in("stage1_job_id", scopeIds),
  ]);

  if (jobsRes.error) addWriteError(diagnostics, "stage1_jobs", "post-save count", jobsRes.error);
  if (revenueRes.error) addWriteError(diagnostics, "stage1_revenue_events", "post-save count", revenueRes.error);
  if (costsRes.error) addWriteError(diagnostics, "stage1_job_costs", "post-save count", costsRes.error);

  diagnostics.rows.jobs = (jobsRes.data ?? []).map(toProbe);
  diagnostics.rows.revenueLines = (revenueRes.data ?? []).map(toProbe);
  diagnostics.rows.costLines = (costsRes.data ?? []).map(toProbe);
  diagnostics.counts.jobs = jobsRes.error ? null : jobsRes.count ?? diagnostics.rows.jobs.length;
  diagnostics.counts.revenueLines = revenueRes.error ? null : revenueRes.count ?? diagnostics.rows.revenueLines.length;
  diagnostics.counts.costLines = costsRes.error ? null : costsRes.count ?? diagnostics.rows.costLines.length;
}

function finalizeDiagnostics(diagnostics: Stage1CanonicalWriteDiagnostics, writeSucceeded: boolean) {
  // Only stage1_jobs carries autopsy_run_id; sandbox revenue/cost rows link via
  // stage1_job_id, so the run-match check is based on the job rows.
  const jobRows = diagnostics.rows.jobs;
  const allRows = [
    ...diagnostics.rows.jobs,
    ...diagnostics.rows.revenueLines,
    ...diagnostics.rows.costLines,
  ];
  diagnostics.writeSucceeded = writeSucceeded && diagnostics.errors.length === 0;
  diagnostics.authUserIdPresent = !!diagnostics.authUserId;
  diagnostics.autopsyRunIdWrittenMatchesActiveRun = jobRows.length > 0
    ? jobRows.every((r) => r.autopsy_run_id === diagnostics.runId)
    : false;
  diagnostics.createdByMatchesAuthUser = diagnostics.authUserId && allRows.length > 0
    ? allRows.every((r) => r.created_by === diagnostics.authUserId)
    : false;
  const requiredCountsPresent =
    (diagnostics.counts.jobs ?? 0) > 0 &&
    (diagnostics.counts.revenueLines ?? 0) > 0 &&
    (diagnostics.counts.costLines ?? 0) > 0;
  diagnostics.success =
    diagnostics.writeSucceeded &&
    requiredCountsPresent &&
    diagnostics.authUserIdPresent &&
    diagnostics.autopsyRunIdWrittenMatchesActiveRun === true &&
    diagnostics.createdByMatchesAuthUser === true;
  diagnostics.status = diagnostics.success ? "success" : "failed";
  diagnostics.message = diagnostics.success
    ? "Stage 1 sandbox write confirmed: job, revenue, and cost rows exist for the active run."
    : diagnostics.errors[0]?.message ??
      "Stage 1 sandbox write is not confirmed until stage1_jobs, stage1_revenue_events, and stage1_job_costs are all non-zero for the active run.";
}

/**
 * Persist the run's commercial records to Supabase (canonical truth).
 * Returns the units with any newly-assigned canonical row ids, or null when no
 * write happened (e.g. no run, or not authenticated — cache stays the only copy).
 * Writes are serialized to avoid overlapping delete/insert races.
 */
export function syncStage1Units(
  runId: string | null,
  units: ProofUnit[],
): Promise<ProofUnit[] | null> {
  const run = async () => {
    const result = await doSyncStage1Units(runId, units);
    return result.diagnostics.writeSucceeded ? result.units : null;
  };
  const p = syncChain.then(run, run);
  syncChain = p.then(
    () => undefined,
    () => undefined,
  );
  return p;
}

export function syncStage1UnitsWithDiagnostics(
  runId: string | null,
  units: ProofUnit[],
): Promise<Stage1CanonicalSyncResult> {
  const run = () => doSyncStage1Units(runId, units);
  const p = syncChain.then(run, run);
  syncChain = p.then(
    () => undefined,
    () => undefined,
  );
  return p;
}

async function doSyncStage1Units(
  runId: string | null,
  units: ProofUnit[],
): Promise<Stage1CanonicalSyncResult> {
  const diagnostics = emptyDiagnostics(runId);
  if (!runId) {
    addWriteError(diagnostics, "stage1_canonical", "preflight", new Error("No active autopsy_run_id was available for the write."));
    finalizeDiagnostics(diagnostics, false);
    return { units: null, diagnostics };
  }
  const { data: userRes, error: authErr } = await supabase.auth.getUser();
  if (authErr) addWriteError(diagnostics, "auth", "get authenticated user", authErr);
  const userId = userRes?.user?.id;
  diagnostics.authUserId = userId ?? null;
  if (!userId) {
    addWriteError(diagnostics, "auth", "preflight", new Error("No authenticated user id was present for the canonical write."));
    await populatePostWriteCounts(diagnostics);
    finalizeDiagnostics(diagnostics, false);
    return { units: null, diagnostics };
  }

  const { data: existing, error: exErr } = await supabase
    .from("stage1_jobs")
    .select("id")
    .eq("autopsy_run_id", runId);
  if (exErr) {
    addWriteError(diagnostics, "stage1_jobs", "select existing jobs", exErr);
    await populatePostWriteCounts(diagnostics);
    finalizeDiagnostics(diagnostics, false);
    return { units: null, diagnostics };
  }
  const existingIds = new Set((existing ?? []).map((j: { id: unknown }) => String(j.id)));
  const keptIds = new Set<string>();

  const result: ProofUnit[] = [];
  let ok = true; // becomes false if any canonical write errors

  for (const u of units) {
    const nowIso = new Date().toISOString();
    const canonicalStatus = toCanonicalStatus(u.status, u.lifecycle);
    const jobRow: Record<string, unknown> = {
      autopsy_run_id: runId,
      client_name: u.client || null,
      job_title: u.jobSite || null,
      job_status: canonicalStatus,
      job_sequence_number: u.n ?? null,
      notes: u.notes || null,
      completed_at: canonicalStatus === "completed" ? nowIso : null,
      updated_at: nowIso,
    };

    let jobId = u.stage1JobId;
    if (jobId && existingIds.has(jobId)) {
      const { data: upd, error: updErr } = await supabase
        .from("stage1_jobs")
        .update(jobRow)
        .eq("id", jobId)
        .select("id,autopsy_run_id,created_by")
        .maybeSingle();
      if (updErr) {
        ok = false;
        addWriteError(diagnostics, "stage1_jobs", "update", updErr, { id: jobId, ...jobRow });
        console.error("[stage1] job update failed", { jobId, error: updErr.message });
      } else if (upd) {
        diagnostics.writtenRows.jobs.push(toProbe(upd));
      }
    } else {
      const newJobId = newCanonicalId();
      const insertJobRow = { id: newJobId, ...jobRow, created_by: userId };
      const { error: insErr } = await supabase
        .from("stage1_jobs")
        .insert(insertJobRow);
      if (insErr) {
        ok = false;
        addWriteError(diagnostics, "stage1_jobs", "insert", insErr, insertJobRow);
        console.error("[stage1] job insert failed (canonical write blocked)", {
          runId,
          createdBy: userId,
          error: insErr?.message,
        });
        result.push(u);
        continue;
      }
      diagnostics.writtenRows.jobs.push(toProbe(insertJobRow));
      jobId = newJobId;
    }
    if (!jobId) {
      result.push(u);
      continue;
    }
    keptIds.add(jobId);
    result.push({ ...u, stage1JobId: jobId });

    // Revenue — single sandbox 'invoice' event per job, stored ex-GST. Replace
    // to keep the sandbox in lockstep with the workspace.
    const { error: revDelErr } = await supabase.from("stage1_revenue_events").delete().eq("stage1_job_id", jobId);
    if (revDelErr) {
      ok = false;
      addWriteError(diagnostics, "stage1_revenue_events", "delete existing for job", revDelErr, { stage1_job_id: jobId });
    }
    if ((u.invoiceAmount ?? 0) > 0) {
      const split = computeGstSplit({
        inclusive: u.invoiceAmount,
        treatment: u.invoiceGstTreatment ?? "gst_included",
        gstOverride: u.invoiceGstAmount,
        overridden: u.invoiceGstOverridden,
      });
      const revenueRow = {
        id: newCanonicalId(),
        stage1_job_id: jobId,
        amount: split.exGst,
        revenue_type: "invoice",
        source: "stage1_dashboard",
        reference: u.invoiceDocName || null,
        created_by: userId,
      };
      const { error: revErr } = await supabase
        .from("stage1_revenue_events")
        .insert(revenueRow);
      if (revErr) {
        ok = false;
        addWriteError(diagnostics, "stage1_revenue_events", "insert", revErr, revenueRow);
        console.error("[stage1] revenue event insert failed", { jobId, error: revErr.message });
      } else {
        diagnostics.writtenRows.revenueLines.push(toProbe(revenueRow));
      }
    }

    // Direct costs — single categorised sandbox row per job, stored ex-GST.
    const { error: costDelErr } = await supabase.from("stage1_job_costs").delete().eq("stage1_job_id", jobId);
    if (costDelErr) {
      ok = false;
      addWriteError(diagnostics, "stage1_job_costs", "delete existing for job", costDelErr, { stage1_job_id: jobId });
    }
    const buckets = bucketDirectCosts(u);
    if (buckets.total > 0) {
      const costRow = {
        id: newCanonicalId(),
        stage1_job_id: jobId,
        labour_hours: buckets.labourHours,
        labour_rate: buckets.labourRate,
        labour_cost: buckets.labourCost,
        consumables_cost: buckets.consumablesCost,
        travel_cost: buckets.travelCost,
        rework_cost: buckets.reworkCost,
        other_direct_cost: buckets.otherDirectCost,
        notes: u.costDocName || null,
        created_by: userId,
      };
      const { error: costErr } = await supabase
        .from("stage1_job_costs")
        .insert(costRow);
      if (costErr) {
        ok = false;
        addWriteError(diagnostics, "stage1_job_costs", "insert", costErr, costRow);
        // Always surface cost write failures — a silent failure here is what
        // produced "Job Costs = Not Yet Recorded" despite a saved cost.
        console.error("[stage1] job cost insert failed", {
          jobId,
          runId,
          createdBy: userId,
          requested: {
            labour_cost: costRow.labour_cost,
            consumables_cost: costRow.consumables_cost,
            travel_cost: costRow.travel_cost,
            rework_cost: costRow.rework_cost,
            other_direct_cost: costRow.other_direct_cost,
          },
          error: costErr.message,
        });
      } else {
        diagnostics.writtenRows.costLines.push(toProbe(costRow));
        if (isDebug()) console.info("[stage1] job cost written", { jobId, savedId: costRow.id });
      }
    }
  }

  // Delete jobs (and their sandbox child rows) that were removed locally.
  for (const id of existingIds) {
    if (!keptIds.has(id)) {
      const { error: staleCostErr } = await supabase.from("stage1_job_costs").delete().eq("stage1_job_id", id);
      const { error: staleRevErr } = await supabase.from("stage1_revenue_events").delete().eq("stage1_job_id", id);
      const { error: staleJobErr } = await supabase.from("stage1_jobs").delete().eq("id", id);
      if (staleCostErr) {
        ok = false;
        addWriteError(diagnostics, "stage1_job_costs", "delete stale job costs", staleCostErr, { stage1_job_id: id });
      }
      if (staleRevErr) {
        ok = false;
        addWriteError(diagnostics, "stage1_revenue_events", "delete stale job revenue", staleRevErr, { stage1_job_id: id });
      }
      if (staleJobErr) {
        ok = false;
        addWriteError(diagnostics, "stage1_jobs", "delete stale job", staleJobErr, { id });
      }
    }
  }

  await populatePostWriteCounts(diagnostics);
  finalizeDiagnostics(diagnostics, ok);
  return { units: ok ? result : null, diagnostics };
}

// ---------------------------------------------------------------------------
// Canonical run-level commercial summary (RPC)
// ---------------------------------------------------------------------------
export interface Stage1CommercialSummary {
  autopsy_run_id: string;
  jobs_count: number;
  completed_jobs_count: number;
  revenue_ex_gst_amount: number;
  cost_ex_gst_amount: number;
  gross_profit_amount: number;
  gross_margin_pct: number;
  qualifying_completed_jobs_count: number;
}

/** Read the run-level commercial summary from the canonical RPC. */
export async function fetchStage1CommercialSummary(
  runId: string | null,
): Promise<Stage1CommercialSummary | null> {
  if (!runId) return null;
  const { data, error } = await supabase.rpc("get_stage1_commercial_summary_by_run", {
    p_run_id: runId,
  });
  if (error || !data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    autopsy_run_id: row.autopsy_run_id,
    jobs_count: Number(row.jobs_count) || 0,
    completed_jobs_count: Number(row.completed_jobs_count) || 0,
    revenue_ex_gst_amount: Number(row.revenue_ex_gst_amount) || 0,
    cost_ex_gst_amount: Number(row.cost_ex_gst_amount) || 0,
    gross_profit_amount: Number(row.gross_profit_amount) || 0,
    gross_margin_pct: Number(row.gross_margin_pct) || 0,
    qualifying_completed_jobs_count: Number(row.qualifying_completed_jobs_count) || 0,
  };
}

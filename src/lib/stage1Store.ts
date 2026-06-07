// Run-scoped persistence for Stage 1 proof units.
//
// Stage 1 is a persistent commercial record system, not a calculator. The
// CANONICAL source of truth for commercial records (jobs, revenue lines, cost
// lines and their GST splits) is now Supabase — the four canonical tables:
//
//   - stage1_jobs
//   - stage1_revenue_lines
//   - stage1_cost_lines
//   - stage1_reflections (handled in stage1Reflection.ts)
//
// Writes happen by direct table INSERT / UPDATE / DELETE under RLS. Reads
// hydrate rows directly from the canonical tables, and the run-level commercial
// summary is read from get_stage1_commercial_summary_by_run(p_run_id).
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
/**
 * Fetch the run's commercial records from Supabase (canonical truth).
 * Returns null on failure so the caller can fall back to the cache.
 */
export async function fetchStage1Units(runId: string | null): Promise<ProofUnit[] | null> {
  if (!runId) return [];
  const { data: jobs, error } = await supabase
    .from("stage1_jobs")
    .select("*")
    .eq("autopsy_run_id", runId)
    .order("job_sequence_number", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return null;
  if (!jobs || jobs.length === 0) return [];

  const [{ data: revenue }, { data: costs }] = await Promise.all([
    supabase.from("stage1_revenue_lines").select("*").eq("autopsy_run_id", runId),
    supabase.from("stage1_cost_lines").select("*").eq("autopsy_run_id", runId),
  ]);

  if (isDebug()) {
    // Diagnostic: canonical row counts loaded for this run.
    console.info("[stage1] canonical fetch", {
      runId,
      jobs: jobs.length,
      revenueLines: (revenue ?? []).length,
      costLines: (costs ?? []).length,
    });
  }

  return jobs.map((j: Record<string, any>, i: number) => {
    const rev = (revenue ?? []).find((r: any) => r.stage1_job_id === j.id);
    const jobCosts = (costs ?? []).filter((c: any) => c.stage1_job_id === j.id);

    const revExGst = rev ? Number(rev.invoice_ex_gst_amount) || 0 : 0;
    const costExGst = jobCosts.reduce((s: number, c: any) => s + (Number(c.cost_ex_gst_amount) || 0), 0);
    const gm = revExGst > 0 && costExGst > 0 ? Math.round(((revExGst - costExGst) / revExGst) * 100) : 0;

    const costLines: CostLine[] = jobCosts.map((c: any) => ({
      id: String(c.id),
      description: c.description ?? "",
      amount: Number(c.cost_total_gst_inclusive) || 0,
      gstIncluded: (c.gst_treatment ?? "gst_included") === "gst_included",
      gstTreatment: (c.gst_treatment ?? "gst_included") as GstTreatment,
      gstAmount: Number(c.cost_gst_amount) || 0,
      gstOverridden: !!c.gst_overridden,
    }));

    const unit: ProofUnit = {
      n: j.job_sequence_number ?? i + 1,
      stage1JobId: String(j.id),
      client: j.client_name ?? "",
      jobSite: j.job_title ?? undefined,
      proofType: "Completed Job",
      status: fromCanonicalStatus(j.job_status),
      gm,
      evidence: false,
      notes: j.notes ?? undefined,
      lifecycle: j.job_status === "cancelled" ? "voided" : "active",
      invoiceAmount: rev ? Number(rev.invoice_total_gst_inclusive) || 0 : undefined,
      invoiceGstTreatment: rev ? ((rev.gst_treatment ?? "gst_included") as GstTreatment) : undefined,
      invoiceGstAmount: rev ? Number(rev.invoice_gst_amount) || 0 : undefined,
      invoiceGstOverridden: rev ? !!rev.gst_overridden : undefined,
      costLines,
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
      // Drop legacy per-category cost fields — canonical cost lines are truth.
      costMaterials: undefined,
      costLabour: undefined,
      costSubcontractors: undefined,
      costOther: undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// Canonical WRITE — sync ProofUnit[] to the canonical tables (INSERT/UPDATE/DELETE)
// ---------------------------------------------------------------------------
let syncChain: Promise<unknown> = Promise.resolve();

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
): Promise<ProofUnit[] | null> {
  if (!runId) return null;
  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes?.user?.id;
  if (!userId) return null; // not authenticated → cache only

  const { data: existing, error: exErr } = await supabase
    .from("stage1_jobs")
    .select("id")
    .eq("autopsy_run_id", runId);
  if (exErr) return null;
  const existingIds = new Set((existing ?? []).map((j: any) => String(j.id)));
  const keptIds = new Set<string>();

  const result: ProofUnit[] = [];

  for (const u of units) {
    const nowIso = new Date().toISOString();
    const canonicalStatus = toCanonicalStatus(u.status, u.lifecycle);
    const jobRow: Record<string, any> = {
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
      await supabase.from("stage1_jobs").update(jobRow).eq("id", jobId);
    } else {
      const { data: ins, error: insErr } = await supabase
        .from("stage1_jobs")
        .insert({ ...jobRow, created_by: userId })
        .select("id")
        .single();
      if (insErr || !ins) {
        result.push(u);
        continue;
      }
      jobId = String(ins.id);
    }
    if (!jobId) {
      result.push(u);
      continue;
    }
    keptIds.add(jobId);
    result.push({ ...u, stage1JobId: jobId });

    // Revenue line — single line per job. Replace to keep canonical in lockstep.
    await supabase.from("stage1_revenue_lines").delete().eq("stage1_job_id", jobId);
    if ((u.invoiceAmount ?? 0) > 0) {
      const split = computeGstSplit({
        inclusive: u.invoiceAmount,
        treatment: u.invoiceGstTreatment ?? "gst_included",
        gstOverride: u.invoiceGstAmount,
        overridden: u.invoiceGstOverridden,
      });
      await supabase.from("stage1_revenue_lines").insert({
        autopsy_run_id: runId,
        stage1_job_id: jobId,
        invoice_total_gst_inclusive: split.inclusive,
        invoice_gst_amount: split.gst,
        invoice_ex_gst_amount: split.exGst,
        gst_overridden: split.overridden,
        gst_treatment: u.invoiceGstTreatment ?? "gst_included",
        created_by: userId,
      });
    }

    // Cost lines — replace the full set for this job.
    await supabase.from("stage1_cost_lines").delete().eq("stage1_job_id", jobId);
    const lines = u.costLines ?? [];
    if (lines.length > 0) {
      const rows = lines
        .filter((l) => (l.amount ?? 0) > 0 || (l.description ?? "").trim().length > 0)
        .map((l) => {
          const treatment = (l.gstTreatment ?? (l.gstIncluded ? "gst_included" : "no_gst")) as GstTreatment;
          const split = computeGstSplit({
            inclusive: l.amount,
            treatment,
            gstOverride: l.gstAmount,
            overridden: l.gstOverridden,
          });
          return {
            autopsy_run_id: runId,
            stage1_job_id: jobId,
            cost_category: "other",
            description: l.description || null,
            cost_total_gst_inclusive: split.inclusive,
            cost_gst_amount: split.gst,
            cost_ex_gst_amount: split.exGst,
            gst_overridden: split.overridden,
            gst_treatment: treatment,
            created_by: userId,
          };
        });
      if (rows.length > 0) {
        await supabase.from("stage1_cost_lines").insert(rows);
      }
    }
  }

  // Delete jobs (and their lines) that were removed locally.
  for (const id of existingIds) {
    if (!keptIds.has(id)) {
      await supabase.from("stage1_cost_lines").delete().eq("stage1_job_id", id);
      await supabase.from("stage1_revenue_lines").delete().eq("stage1_job_id", id);
      await supabase.from("stage1_jobs").delete().eq("id", id);
    }
  }

  return result;
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

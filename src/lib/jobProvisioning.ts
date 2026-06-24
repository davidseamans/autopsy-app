import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Stage 1 quote / job provisioning
//
// Architecture rule:
//   Stage 1 is a PRE-CORE evidence sandbox.
//   It must not write to Core tables (`core_accounts`, `core_sites`,
//   `core_pipeline`, `core_quotes`, `core_jobs`).
//
// Stage 1 quote flow persists only to:
//   - public.stage1_leads
//   - public.stage1_quotes
//   - public.stage1_jobs
//
// Core handover happens later through an explicit progression/handover path.
// ---------------------------------------------------------------------------

export interface ProvisionJobInput {
  client: string;
  site?: string;
  value?: number;
  quoteNotes?: string;
  runId?: string | null;
  stageProgressId?: string | null;
}

export interface ProvisionJobResult {
  ok: boolean;
  error?: string;
  jobId?: string;
  accountId?: string;
  siteId?: string;
  quoteId?: string;
  quoteNumber?: string;
}

export interface PersistProgressInput {
  jobId: string;
  siteId?: string;
  jobSite?: string;
  scheduledDate?: string;
  completed?: boolean;
}

export interface PersistProgressResult {
  ok: boolean;
  error?: string;
}

export type UiQuoteStatus = "Sent" | "Accepted" | "Declined" | "Expired" | "Rejected";

export const uiToDbStatus = (s: UiQuoteStatus): string => s.toLowerCase();
export const dbToUiStatus = (s: string | null): UiQuoteStatus => {
  switch ((s ?? "").toLowerCase()) {
    case "accepted": return "Accepted";
    case "declined": return "Declined";
    case "expired": return "Expired";
    case "rejected": return "Rejected";
    default: return "Sent";
  }
};

const dateToIso = (d?: string) => {
  if (!d) return null;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const isoDate = (iso?: string | null) => (iso ? String(iso).slice(0, 10) : "");
const moneyNumber = (v: unknown) => Number(v ?? 0) || 0;

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function localStorageRunId(): string | null {
  try {
    return (
      localStorage.getItem("autopsy_stage1_run_id") ||
      localStorage.getItem("autopsy_active_run_id") ||
      localStorage.getItem("autopsy_current_run_id") ||
      null
    );
  } catch {
    return null;
  }
}

async function latestOwnedRunId(): Promise<string | null> {
  const { data } = await supabase
    .from("autopsy_runs")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return typeof data?.id === "string" ? data.id : null;
}

async function resolveRunId(candidate?: string | null): Promise<string | null> {
  const runId = candidate || localStorageRunId() || await latestOwnedRunId();
  if (runId) {
    try { localStorage.setItem("autopsy_stage1_run_id", runId); } catch { /* noop */ }
  }
  return runId;
}

async function resolveStageProgressId(runId: string | null | undefined): Promise<string | null> {
  if (!runId) return null;
  const { data, error } = await supabase.rpc("get_stage1_progress_snapshot_by_run", { p_run_id: runId });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return row?.stage_progress_id ?? null;
}

function makeQuoteNumber(sequence: unknown): string {
  const n = Number(sequence ?? 0);
  return n > 0 ? `Q-${n}` : "Q-—";
}

export interface Stage1QuoteRecord {
  dbId: string;
  number: string;
  client: string;
  site: string;
  value: number;
  status: UiQuoteStatus;
  quoteDate: string;
  followUp: string;
  reason: string;
  notes?: string;
  accountId: string;
  siteId: string;
  converted: boolean;
  convertedJobNumber?: string;
  createdAt?: string;
}

export interface Stage1JobRecord {
  jobId: string;
  jobNumber: string;
  client: string;
  site: string;
  value: number;
  status: string;
  sourceQuote: string;
  accountId: string;
  siteId: string;
  dbQuoteId: string;
  dbQuoteNumber: string;
}

export interface CreateQuoteInput {
  client: string;
  site?: string;
  value?: number;
  followUp?: string;
  quoteNotes?: string;
  runId?: string | null;
  stageProgressId?: string | null;
}

export interface CreateQuoteResult {
  ok: boolean;
  error?: string;
  quote?: Stage1QuoteRecord;
}

/**
 * Create a Stage 1 sandbox lead + quote.
 * This deliberately avoids Core. Quote conversion later creates a Stage 1 job.
 */
export async function createQuote(input: CreateQuoteInput): Promise<CreateQuoteResult> {
  const clientName = input.client?.trim() || "Unnamed client";
  const address = input.site?.trim() || clientName;
  const value = Number.isFinite(input.value as number) ? Number(input.value) : 0;
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "A valid session is required to create a Stage 1 quote." };
  const runId = await resolveRunId(input.runId);
  if (!runId) return { ok: false, error: "Active Autopsy run is required to create a Stage 1 quote." };

  try {
    const stageProgressId = input.stageProgressId ?? await resolveStageProgressId(runId);

    const { data: lead, error: leadErr } = await supabase
      .from("stage1_leads")
      .insert({
        autopsy_run_id: runId,
        stage_progress_id: stageProgressId,
        client_name: clientName,
        site_address: address,
        source: "stage1_quote_board",
        status: "quoted",
        estimated_value: value,
        notes: input.quoteNotes?.trim() || null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (leadErr) return { ok: false, error: `Lead: ${leadErr.message}` };

    const { data, error } = await supabase
      .from("stage1_quotes")
      .insert({
        autopsy_run_id: runId,
        stage_progress_id: stageProgressId,
        stage1_lead_id: lead.id,
        client_name: clientName,
        site_address: address,
        amount: value,
        status: "sent",
        issued_at: new Date().toISOString(),
        follow_up_due_at: dateToIso(input.followUp),
        quote_notes: input.quoteNotes?.trim() || null,
        created_by: userId,
      })
      .select("id, quote_sequence_number, created_at, follow_up_due_at")
      .single();
    if (error) return { ok: false, error: `Quote: ${error.message}` };

    return {
      ok: true,
      quote: {
        dbId: data.id as string,
        number: makeQuoteNumber(data.quote_sequence_number),
        client: clientName,
        site: address,
        value,
        status: "Sent",
        quoteDate: isoDate(data.created_at as string),
        followUp: input.followUp ?? isoDate(data.follow_up_due_at as string),
        reason: "",
        notes: input.quoteNotes?.trim() || undefined,
        accountId: "stage1",
        siteId: "stage1",
        converted: false,
        createdAt: data.created_at as string,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Create an accepted quote and Stage 1 job in the sandbox. */
export async function provisionJob(input: ProvisionJobInput): Promise<ProvisionJobResult> {
  const created = await createQuote({
    client: input.client,
    site: input.site,
    value: input.value,
    quoteNotes: input.quoteNotes,
    runId: input.runId,
    stageProgressId: input.stageProgressId,
  });
  if (!created.ok || !created.quote) return { ok: false, error: created.error };

  const accepted = await convertQuoteToJob({
    quoteId: created.quote.dbId,
    accountId: "stage1",
    siteId: "stage1",
  });
  if (!accepted.ok) return { ok: false, error: accepted.error };

  return {
    ok: true,
    jobId: accepted.jobId,
    quoteId: created.quote.dbId,
    quoteNumber: created.quote.number,
  };
}

/** Persist workspace fields against Stage 1 job only. */
export async function persistJobProgress(input: PersistProgressInput): Promise<PersistProgressResult> {
  try {
    const patch: Record<string, unknown> = {};
    if (input.scheduledDate) patch.scheduled_date = input.scheduledDate;
    patch.completed_at = input.completed ? new Date().toISOString() : null;
    if (input.jobSite?.trim()) patch.job_title = input.jobSite.trim();

    const { error } = await supabase
      .from("stage1_jobs")
      .update(patch)
      .eq("id", input.jobId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setQuoteOutcome(
  quoteId: string,
  status: UiQuoteStatus,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const patch: Record<string, unknown> = { status: uiToDbStatus(status) };
    const now = new Date().toISOString();
    if (status === "Accepted") patch.accepted_at = now;
    if (status === "Declined" || status === "Rejected") {
      patch.rejected_at = now;
      patch.rejection_reason = reason?.trim() || null;
    }
    if (status === "Expired") patch.rejected_at = now;

    const { error } = await supabase.from("stage1_quotes").update(patch).eq("id", quoteId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface ConvertQuoteInput {
  quoteId: string;
  accountId: string;
  siteId: string;
}

export interface ConvertQuoteResult {
  ok: boolean;
  error?: string;
  jobId?: string;
  jobNumber?: string;
}

/** Convert a Stage 1 sandbox quote into a Stage 1 sandbox job. */
export async function convertQuoteToJob(input: ConvertQuoteInput): Promise<ConvertQuoteResult> {
  try {
    const userId = await currentUserId();
    if (!userId) return { ok: false, error: "A valid session is required to convert a Stage 1 quote." };

    const { data: quote, error: quoteLoadErr } = await supabase
      .from("stage1_quotes")
      .select("id,autopsy_run_id,stage_progress_id,client_name,site_address,amount,quote_sequence_number")
      .eq("id", input.quoteId)
      .single();
    if (quoteLoadErr) return { ok: false, error: `Quote load: ${quoteLoadErr.message}` };

    const nowIso = new Date().toISOString();
    const { error: accErr } = await supabase
      .from("stage1_quotes")
      .update({ status: "accepted", accepted_at: nowIso })
      .eq("id", input.quoteId);
    if (accErr) return { ok: false, error: `Quote accept: ${accErr.message}` };

    const { data: job, error: jobErr } = await supabase
      .from("stage1_jobs")
      .insert({
        autopsy_run_id: quote.autopsy_run_id,
        stage_progress_id: quote.stage_progress_id,
        client_name: quote.client_name,
        job_title: quote.site_address || quote.client_name,
        job_status: "draft",
        notes: `Created from Stage 1 quote ${makeQuoteNumber(quote.quote_sequence_number)}.`,
        created_by: userId,
      })
      .select("id, job_sequence_number")
      .single();
    if (jobErr) return { ok: false, error: `Job: ${jobErr.message}` };

    await supabase.from("stage1_quotes").update({ stage1_job_id: job.id }).eq("id", input.quoteId);

    return {
      ok: true,
      jobId: job.id as string,
      jobNumber: `J-${job.job_sequence_number ?? ""}`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Load the Stage 1 sandbox quote board + sandbox job ledger. */
export async function loadStage1Board(runId?: string | null): Promise<{
  quotes: Stage1QuoteRecord[];
  jobs: Stage1JobRecord[];
}> {
  const resolvedRunId = await resolveRunId(runId);
  const quoteQuery = supabase
    .from("stage1_quotes")
    .select("id,quote_sequence_number,client_name,site_address,amount,status,created_at,follow_up_due_at,rejection_reason,quote_notes,stage1_job_id")
    .is("stage1_job_id", null)
    .order("created_at", { ascending: false })
    .limit(200);
  const jobQuery = supabase
    .from("stage1_jobs")
    .select("id,job_status,job_sequence_number,created_at,autopsy_run_id,client_name,job_title")
    .order("created_at", { ascending: false })
    .limit(200);

  const [qRes, jRes] = await Promise.all([
    resolvedRunId ? quoteQuery.eq("autopsy_run_id", resolvedRunId) : quoteQuery,
    resolvedRunId ? jobQuery.eq("autopsy_run_id", resolvedRunId) : jobQuery,
  ]);

  if (qRes.error) throw qRes.error;
  if (jRes.error) throw jRes.error;

  const quotes: Stage1QuoteRecord[] = (qRes.data ?? []).map((q: any) => ({
    dbId: q.id,
    number: makeQuoteNumber(q.quote_sequence_number),
    client: q.client_name ?? "Unknown client",
    site: q.site_address ?? "",
    value: moneyNumber(q.amount),
    status: dbToUiStatus(q.status),
    quoteDate: isoDate(q.created_at),
    followUp: isoDate(q.follow_up_due_at),
    reason: q.rejection_reason ?? "",
    notes: q.quote_notes ?? undefined,
    accountId: "stage1",
    siteId: "stage1",
    converted: false,
    createdAt: q.created_at,
  }));

  const jobs: Stage1JobRecord[] = (jRes.data ?? []).map((j: any) => ({
    jobId: j.id,
    jobNumber: `J-${j.job_sequence_number ?? ""}`,
    client: j.client_name ?? "Unknown client",
    site: j.job_title ?? "",
    value: 0,
    status: j.job_status ?? "draft",
    sourceQuote: "",
    accountId: "stage1",
    siteId: "stage1",
    dbQuoteId: "",
    dbQuoteNumber: "",
  }));

  return { quotes, jobs };
}

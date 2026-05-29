import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Job provisioning
//
// The Job / Contract Site Detail screen is a *workspace* over an existing job.
// A job only becomes real once an accepted quote is converted. That conversion
// must produce a genuine row in the existing `jobs` table — the single source
// of truth — together with the parent records the schema requires by foreign
// key (account -> site -> pipeline -> quote -> job).
//
// We deliberately do NOT create a parallel "Stage 1 job" entity. Everything
// hangs off the real `jobs.id` returned here.
// ---------------------------------------------------------------------------

export interface ProvisionJobInput {
  client: string;
  site?: string;
  value?: number;
  quoteNotes?: string;
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

/**
 * Create (or reuse) the Core entity chain and a real job row.
 * Returns the generated `jobs.id` so the workspace can persist against it.
 */
export async function provisionJob(input: ProvisionJobInput): Promise<ProvisionJobResult> {
  const clientName = input.client?.trim() || "Unnamed client";
  const address = input.site?.trim() || clientName;
  const value = Number.isFinite(input.value as number) ? Number(input.value) : 0;

  try {
    // 1. Account — reuse an existing one with the same name where possible.
    let accountId: string | undefined;
    const { data: existingAcc } = await supabase
      .from("accounts")
      .select("id")
      .eq("name", clientName)
      .limit(1)
      .maybeSingle();
    if (existingAcc?.id) {
      accountId = existingAcc.id as string;
    } else {
      const { data, error } = await supabase
        .from("accounts")
        .insert({ name: clientName })
        .select("id")
        .single();
      if (error) return { ok: false, error: `Account: ${error.message}` };
      accountId = data.id as string;
    }

    // 2. Site — reuse by account + address where possible.
    let siteId: string | undefined;
    const { data: existingSite } = await supabase
      .from("sites")
      .select("id")
      .eq("account_id", accountId)
      .eq("address", address)
      .limit(1)
      .maybeSingle();
    if (existingSite?.id) {
      siteId = existingSite.id as string;
    } else {
      const { data, error } = await supabase
        .from("sites")
        .insert({ account_id: accountId, address, name: clientName })
        .select("id")
        .single();
      if (error) return { ok: false, error: `Site: ${error.message}` };
      siteId = data.id as string;
    }

    // 3. Pipeline entry (required parent for a quote).
    const { data: pipe, error: pipeErr } = await supabase
      .from("pipeline")
      .insert({ account_id: accountId, site_id: siteId, stage: "lead", value })
      .select("id")
      .single();
    if (pipeErr) return { ok: false, error: `Pipeline: ${pipeErr.message}` };

    // 4. Quote — created already accepted, since this is the conversion step.
    const nowIso = new Date().toISOString();
    const { data: quote, error: quoteErr } = await supabase
      .from("quotes")
      .insert({
        pipeline_id: pipe.id,
        site_id: siteId,
        amount: value,
        status: "accepted",
        accepted_at: nowIso,
        quote_notes: input.quoteNotes || null,
      })
      .select("id, quote_number")
      .single();
    if (quoteErr) return { ok: false, error: `Quote: ${quoteErr.message}` };

    // 5. Job — the real source-of-truth row.
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .insert({
        quote_id: quote.id,
        account_id: accountId,
        site_id: siteId,
        status: "completed",
        relationship_context: "new_job",
      })
      .select("id")
      .single();
    if (jobErr) return { ok: false, error: `Job: ${jobErr.message}` };

    // 6. Link the quote back to the job for lineage.
    await supabase.from("quotes").update({ job_id: job.id }).eq("id", quote.id);

    return {
      ok: true,
      jobId: job.id as string,
      accountId,
      siteId,
      quoteId: quote.id as string,
      quoteNumber: (quote.quote_number as string) ?? undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface PersistProgressInput {
  jobId: string;
  siteId?: string;
  jobSite?: string;
  scheduledDate?: string; // yyyy-mm-dd
  completed?: boolean;
}

export interface PersistProgressResult {
  ok: boolean;
  error?: string;
}

/**
 * Persist the workspace fields that the existing `jobs` / `sites` tables can
 * actually hold, against the real job_id. Returns ok:false with a message if
 * the Data API rejects the write so the caller can surface it honestly.
 */
export async function persistJobProgress(input: PersistProgressInput): Promise<PersistProgressResult> {
  try {
    const jobPatch: Record<string, unknown> = {};
    if (input.scheduledDate) jobPatch.scheduled_date = input.scheduledDate;
    jobPatch.completed_at = input.completed ? new Date().toISOString() : null;

    const { error: jobErr } = await supabase
      .from("jobs")
      .update(jobPatch)
      .eq("id", input.jobId);
    if (jobErr) return { ok: false, error: jobErr.message };

    if (input.siteId && input.jobSite && input.jobSite.trim()) {
      const { error: siteErr } = await supabase
        .from("sites")
        .update({ address: input.jobSite.trim() })
        .eq("id", input.siteId);
      if (siteErr) return { ok: false, error: siteErr.message };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ===========================================================================
// Builds 2–4 — quote lifecycle persisted on the existing Core `quotes` table.
//
// Single source of truth: every quote is a real `quotes` row reached through the
// Account -> Site -> Pipeline -> Quote chain. quote_number is generated by the
// database. No Stage-1 duplicate tables are created. Converting an accepted quote
// reuses that exact quote row (lineage preserved) rather than minting a new chain.
// ===========================================================================

// UI status labels <-> stored lowercase status on quotes.status (free text).
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
  // Accept yyyy-mm-dd from <input type="date">; store as ISO timestamp.
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

// Reuse-or-create the Account -> Site -> Pipeline chain a quote requires.
async function ensureChain(
  clientName: string,
  address: string,
  value: number,
): Promise<{ ok: true; accountId: string; siteId: string; pipelineId: string } | { ok: false; error: string }> {
  // Account
  let accountId: string;
  const { data: existingAcc } = await supabase
    .from("accounts").select("id").eq("name", clientName).limit(1).maybeSingle();
  if (existingAcc?.id) accountId = existingAcc.id as string;
  else {
    const { data, error } = await supabase.from("accounts").insert({ name: clientName }).select("id").single();
    if (error) return { ok: false, error: `Account: ${error.message}` };
    accountId = data.id as string;
  }
  // Site
  let siteId: string;
  const { data: existingSite } = await supabase
    .from("sites").select("id").eq("account_id", accountId).eq("address", address).limit(1).maybeSingle();
  if (existingSite?.id) siteId = existingSite.id as string;
  else {
    const { data, error } = await supabase
      .from("sites").insert({ account_id: accountId, address, name: clientName }).select("id").single();
    if (error) return { ok: false, error: `Site: ${error.message}` };
    siteId = data.id as string;
  }
  // Pipeline
  const { data: pipe, error: pipeErr } = await supabase
    .from("pipeline").insert({ account_id: accountId, site_id: siteId, stage: "lead", value }).select("id").single();
  if (pipeErr) return { ok: false, error: `Pipeline: ${pipeErr.message}` };
  return { ok: true, accountId, siteId, pipelineId: pipe.id as string };
}

// A quote as the Stage 1 board consumes it (decoupled from page-level types).
export interface Stage1QuoteRecord {
  dbId: string;
  number: string;          // quote_number (DB generated)
  client: string;
  site: string;
  value: number;
  status: UiQuoteStatus;
  quoteDate: string;       // yyyy-mm-dd
  followUp: string;        // yyyy-mm-dd
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
  followUp?: string; // yyyy-mm-dd
  quoteNotes?: string;
}

export interface CreateQuoteResult {
  ok: boolean;
  error?: string;
  quote?: Stage1QuoteRecord;
}

/** Build 2 — create a real quote (status "sent") and return its DB quote_number. */
export async function createQuote(input: CreateQuoteInput): Promise<CreateQuoteResult> {
  const clientName = input.client?.trim() || "Unnamed client";
  const address = input.site?.trim() || clientName;
  const value = Number.isFinite(input.value as number) ? Number(input.value) : 0;
  try {
    const chain = await ensureChain(clientName, address, value);
    if (!chain.ok) return { ok: false, error: chain.error };
    const { data, error } = await supabase
      .from("quotes")
      .insert({
        pipeline_id: chain.pipelineId,
        site_id: chain.siteId,
        amount: value,
        status: "sent",
        issued_at: new Date().toISOString(),
        follow_up_due_at: dateToIso(input.followUp),
        quote_notes: input.quoteNotes?.trim() || null,
      })
      .select("id, quote_number, created_at")
      .single();
    if (error) return { ok: false, error: `Quote: ${error.message}` };
    return {
      ok: true,
      quote: {
        dbId: data.id as string,
        number: (data.quote_number as string) ?? "",
        client: clientName,
        site: address,
        value,
        status: "Sent",
        quoteDate: (data.created_at as string)?.slice(0, 10) ?? "",
        followUp: input.followUp ?? "",
        reason: "",
        notes: input.quoteNotes?.trim() || undefined,
        accountId: chain.accountId,
        siteId: chain.siteId,
        converted: false,
        createdAt: data.created_at as string,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Build 3 — persist a quote outcome (Sent / Declined / Expired; Accepted goes via convert). */
export async function setQuoteOutcome(
  quoteId: string,
  status: UiQuoteStatus,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const patch: Record<string, unknown> = { status: uiToDbStatus(status) };
    const now = new Date().toISOString();
    if (status === "Declined" || status === "Rejected") {
      patch.rejected_at = now;
      patch.rejection_reason = reason?.trim() || null;
    }
    if (status === "Expired") patch.rejected_at = now;
    const { error } = await supabase.from("quotes").update(patch).eq("id", quoteId);
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

/** Build 4 — convert the EXISTING accepted quote into a real job (lineage preserved). */
export async function convertQuoteToJob(input: ConvertQuoteInput): Promise<ConvertQuoteResult> {
  try {
    const nowIso = new Date().toISOString();
    const { error: accErr } = await supabase
      .from("quotes")
      .update({ status: "accepted", accepted_at: nowIso })
      .eq("id", input.quoteId);
    if (accErr) return { ok: false, error: `Quote accept: ${accErr.message}` };

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .insert({
        quote_id: input.quoteId,
        account_id: input.accountId,
        site_id: input.siteId,
        status: "completed",
        relationship_context: "new_job",
      })
      .select("id, job_sequence_number")
      .single();
    if (jobErr) return { ok: false, error: `Job: ${jobErr.message}` };

    await supabase.from("quotes").update({ job_id: job.id }).eq("id", input.quoteId);
    return {
      ok: true,
      jobId: job.id as string,
      jobNumber: `J-${job.job_sequence_number ?? ""}`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const pickClient = (q: any): string =>
  q?.sites?.accounts?.name ?? q?.pipeline?.accounts?.name ?? "Unknown client";
const pickAccountId = (q: any): string =>
  q?.sites?.account_id ?? q?.pipeline?.account_id ?? "";

/** Load the persisted quote board + job ledger so Stage 1 survives refresh. */
export async function loadStage1Board(): Promise<{
  quotes: Stage1QuoteRecord[];
  jobs: Stage1JobRecord[];
}> {
  const quoteSel =
    "id,quote_number,amount,status,created_at,follow_up_due_at,rejection_reason,quote_notes,job_id,site_id," +
    "sites(address,account_id,accounts(name)),pipeline(account_id,accounts(name))";
  const jobSel =
    "id,status,job_sequence_number,created_at,account_id,site_id,quote_id," +
    "quotes!jobs_quote_id_fkey(quote_number,amount),accounts(name),sites(address)";

  const [qRes, jRes] = await Promise.all([
    supabase.from("quotes").select(quoteSel).is("job_id", null).order("created_at", { ascending: false }).limit(200),
    supabase.from("jobs").select(jobSel).order("created_at", { ascending: false }).limit(200),
  ]);

  const quotes: Stage1QuoteRecord[] = (qRes.data ?? []).map((q: any) => ({
    dbId: q.id,
    number: q.quote_number ?? "",
    client: pickClient(q),
    site: q.sites?.address ?? "",
    value: Number(q.amount ?? 0),
    status: dbToUiStatus(q.status),
    quoteDate: (q.created_at as string)?.slice(0, 10) ?? "",
    followUp: (q.follow_up_due_at as string)?.slice(0, 10) ?? "",
    reason: q.rejection_reason ?? "",
    notes: q.quote_notes ?? undefined,
    accountId: pickAccountId(q),
    siteId: q.site_id ?? "",
    converted: false,
    createdAt: q.created_at,
  }));

  const jobs: Stage1JobRecord[] = (jRes.data ?? []).map((j: any) => ({
    jobId: j.id,
    jobNumber: `J-${j.job_sequence_number ?? ""}`,
    client: j.accounts?.name ?? "Unknown client",
    site: j.sites?.address ?? "",
    value: Number(j.quotes?.amount ?? 0),
    status: j.status ?? "completed",
    sourceQuote: j.quotes?.quote_number ?? "",
    accountId: j.account_id ?? "",
    siteId: j.site_id ?? "",
    dbQuoteId: j.quote_id ?? "",
    dbQuoteNumber: j.quotes?.quote_number ?? "",
  }));

  return { quotes, jobs };
}
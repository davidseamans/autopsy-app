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
import { supabase } from "@/lib/supabase";

export type Stage1QuoteSummary = {
  id: string;
  number: string;
  clientName: string;
  status: string;
  totalIncGst: number;
  issuedAt: string;
  jobId: string | null;
};

export type Stage1FunnelSnapshot = {
  leadCount: number;
  quotes: Stage1QuoteSummary[];
};

export type Stage1LeadActivity = {
  id: string;
  activity_date: string;
  method: string;
  attempts: number;
  contacts_made: number;
  leads_generated: number;
  created_at: string;
};

export type NewStage1LeadActivity = Omit<Stage1LeadActivity, "id" | "created_at">;

export async function loadStage1Funnel(runId: string): Promise<Stage1FunnelSnapshot> {
  const [leadResult, quoteResult] = await Promise.all([
    supabase
      .from("stage1_funnel_totals")
      .select("lead_count")
      .eq("autopsy_run_id", runId)
      .maybeSingle(),
    supabase
      .from("stage1_quotes")
      .select("id,quote_sequence_number,client_name,status,total_inc_gst,amount,issued_at,stage1_job_id")
      .eq("autopsy_run_id", runId)
      .order("issued_at", { ascending: false })
      .limit(200),
  ]);
  if (leadResult.error) throw new Error(leadResult.error.message);
  if (quoteResult.error) throw new Error(quoteResult.error.message);

  return {
    leadCount: Number(leadResult.data?.lead_count ?? 0),
    quotes: (quoteResult.data ?? []).map((quote) => ({
      id: String(quote.id),
      number: `Q-${quote.quote_sequence_number}`,
      clientName: String(quote.client_name),
      status: String(quote.status),
      totalIncGst: Number(quote.total_inc_gst ?? quote.amount ?? 0),
      issuedAt: String(quote.issued_at),
      jobId: quote.stage1_job_id ? String(quote.stage1_job_id) : null,
    })),
  };
}

export async function saveStage1LeadCount(runId: string, leadCount: number): Promise<number> {
  const safeCount = Math.max(0, Math.trunc(leadCount));
  const { data, error } = await supabase.rpc("set_stage1_lead_count", {
    p_run_id: runId,
    p_lead_count: safeCount,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? safeCount);
}

export async function loadStage1LeadActivities(runId: string): Promise<Stage1LeadActivity[]> {
  const { data, error } = await supabase
    .from("stage1_lead_activities")
    .select("id,activity_date,method,attempts,contacts_made,leads_generated,created_at")
    .eq("autopsy_run_id", runId)
    .order("activity_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    activity_date: String(row.activity_date),
    method: String(row.method),
    attempts: Number(row.attempts ?? 0),
    contacts_made: Number(row.contacts_made ?? 0),
    leads_generated: Number(row.leads_generated ?? 0),
    created_at: String(row.created_at),
  }));
}

export async function createStage1LeadActivity(runId: string, activity: NewStage1LeadActivity): Promise<Stage1LeadActivity> {
  const { data, error } = await supabase
    .from("stage1_lead_activities")
    .insert({ autopsy_run_id: runId, ...activity })
    .select("id,activity_date,method,attempts,contacts_made,leads_generated,created_at")
    .single();
  if (error) throw new Error(error.message);
  return {
    id: String(data.id),
    activity_date: String(data.activity_date),
    method: String(data.method),
    attempts: Number(data.attempts ?? 0),
    contacts_made: Number(data.contacts_made ?? 0),
    leads_generated: Number(data.leads_generated ?? 0),
    created_at: String(data.created_at),
  };
}

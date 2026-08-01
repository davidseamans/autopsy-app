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

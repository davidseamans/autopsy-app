import { supabase } from "@/lib/supabase";

export type Stage1LeadStatus = "new" | "quoted" | "won" | "lost";

export type Stage1Lead = {
  id: string;
  runId: string;
  clientName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  siteAddress: string;
  source: string;
  status: Stage1LeadStatus;
  estimatedValue: number;
  nextActionAt: string;
  notes: string;
  createdAt: string;
  activeQuoteId: string | null;
  activeQuoteNumber: string | null;
  jobId: string | null;
};

type LeadRow = Record<string, unknown> & { id: string };
type QuoteRow = Record<string, unknown> & { id: string; stage1_lead_id: string };

export async function createStage1Lead(input: {
  runId: string;
  clientName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  siteAddress: string;
  source: string;
  estimatedValue: number;
  nextActionAt: string;
  notes: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("create_stage1_lead", {
    p_run_id: input.runId,
    p_client_name: input.clientName,
    p_contact_name: input.contactName,
    p_contact_email: input.contactEmail,
    p_contact_phone: input.contactPhone,
    p_site_address: input.siteAddress,
    p_source: input.source,
    p_estimated_value: input.estimatedValue,
    p_next_action_at: input.nextActionAt || null,
    p_notes: input.notes,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.lead_id) throw new Error("The lead was not created.");
  return String(row.lead_id);
}

export async function fetchStage1Lead(leadId: string): Promise<Stage1Lead> {
  const leads = await loadStage1Leads(undefined, leadId);
  const lead = leads[0];
  if (!lead) throw new Error("Lead not found.");
  return lead;
}

export async function loadStage1Leads(runId?: string, leadId?: string): Promise<Stage1Lead[]> {
  let leadQuery = supabase
    .from("stage1_leads")
    .select("id,autopsy_run_id,client_name,contact_name,contact_email,contact_phone,site_address,source,status,estimated_value,next_action_at,notes,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (runId) leadQuery = leadQuery.eq("autopsy_run_id", runId);
  if (leadId) leadQuery = leadQuery.eq("id", leadId);

  const { data: leadData, error: leadError } = await leadQuery;
  if (leadError) throw new Error(leadError.message);
  const rows = (leadData ?? []) as LeadRow[];
  if (!rows.length) return [];

  const leadIds = rows.map((row) => String(row.id));
  const { data: quoteData, error: quoteError } = await supabase
    .from("stage1_quotes")
    .select("id,stage1_lead_id,stage1_job_id,quote_sequence_number,status,created_at")
    .in("stage1_lead_id", leadIds)
    .order("created_at", { ascending: false });
  if (quoteError) throw new Error(quoteError.message);

  const latestQuote = new Map<string, QuoteRow>();
  for (const quote of (quoteData ?? []) as QuoteRow[]) {
    const key = String(quote.stage1_lead_id);
    if (!latestQuote.has(key)) latestQuote.set(key, quote);
  }

  return rows.map((row) => {
    const quote = latestQuote.get(String(row.id));
    return {
      id: String(row.id),
      runId: String(row.autopsy_run_id),
      clientName: String(row.client_name ?? ""),
      contactName: String(row.contact_name ?? ""),
      contactEmail: String(row.contact_email ?? ""),
      contactPhone: String(row.contact_phone ?? ""),
      siteAddress: String(row.site_address ?? ""),
      source: String(row.source ?? "Other"),
      status: normaliseStatus(row.status),
      estimatedValue: Number(row.estimated_value ?? 0),
      nextActionAt: row.next_action_at ? String(row.next_action_at) : "",
      notes: String(row.notes ?? ""),
      createdAt: String(row.created_at ?? ""),
      activeQuoteId: quote ? String(quote.id) : null,
      activeQuoteNumber: quote?.quote_sequence_number ? `Q-${quote.quote_sequence_number}` : null,
      jobId: quote?.stage1_job_id ? String(quote.stage1_job_id) : null,
    };
  });
}

function normaliseStatus(value: unknown): Stage1LeadStatus {
  const status = String(value ?? "new").toLowerCase();
  if (status === "quoted" || status === "won" || status === "lost") return status;
  return "new";
}

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

export type NewStage1PotentialCustomer = {
  client_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  site_address: string | null;
};

export type Stage1LeadRecord = {
  id: string;
  client_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  site_address: string | null;
  source: string;
  status: string;
  estimated_value: number;
  next_action_at: string | null;
  notes: string | null;
  created_at: string;
};

export type NewStage1LeadRecord = Omit<Stage1LeadRecord, "id" | "status" | "created_at">;

const LEAD_FIELDS = "id,client_name,contact_name,contact_email,contact_phone,site_address,source,status,estimated_value,next_action_at,notes,created_at";

function mapLeadRecord(row: Record<string, unknown>): Stage1LeadRecord {
  return {
    id: String(row.id),
    client_name: String(row.client_name),
    contact_name: row.contact_name ? String(row.contact_name) : null,
    contact_email: row.contact_email ? String(row.contact_email) : null,
    contact_phone: row.contact_phone ? String(row.contact_phone) : null,
    site_address: row.site_address ? String(row.site_address) : null,
    source: String(row.source ?? "Other"),
    status: String(row.status ?? "new"),
    estimated_value: Number(row.estimated_value ?? 0),
    next_action_at: row.next_action_at ? String(row.next_action_at) : null,
    notes: row.notes ? String(row.notes) : null,
    created_at: String(row.created_at),
  };
}

export async function loadStage1LeadRecords(runId: string): Promise<Stage1LeadRecord[]> {
  const { data, error } = await supabase
    .from("stage1_leads")
    .select(LEAD_FIELDS)
    .eq("autopsy_run_id", runId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapLeadRecord(row));
}

export async function createStage1LeadRecord(runId: string, lead: NewStage1LeadRecord): Promise<Stage1LeadRecord> {
  const { data: created, error: createError } = await supabase.rpc("create_stage1_lead", {
    p_run_id: runId,
    p_client_name: lead.client_name,
    p_contact_name: lead.contact_name,
    p_contact_email: lead.contact_email,
    p_contact_phone: lead.contact_phone,
    p_site_address: lead.site_address,
    p_source: lead.source,
    p_estimated_value: lead.estimated_value,
    p_next_action_at: lead.next_action_at,
    p_notes: lead.notes,
  });
  if (createError) throw new Error(createError.message);
  const leadId = Array.isArray(created) ? created[0]?.lead_id : created?.lead_id;
  if (!leadId) throw new Error("Lead was created but its record id was not returned.");
  const { data, error } = await supabase.from("stage1_leads").select(LEAD_FIELDS).eq("id", leadId).single();
  if (error) throw new Error(error.message);
  return mapLeadRecord(data);
}

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

export async function createStage1LeadActivityWithContacts(
  runId: string,
  activity: NewStage1LeadActivity,
  potentialCustomers: NewStage1PotentialCustomer[],
): Promise<{ activities: Stage1LeadActivity[]; leads: Stage1LeadRecord[] }> {
  const { error } = await supabase.rpc("create_stage1_lead_activity_with_contacts", {
    p_run_id: runId,
    p_activity_date: activity.activity_date,
    p_method: activity.method,
    p_attempts: activity.attempts,
    p_contacts_made: activity.contacts_made,
    p_leads_generated: activity.leads_generated,
    p_potential_customers: potentialCustomers,
  });
  if (error) throw new Error(error.message);
  const [activities, leads] = await Promise.all([
    loadStage1LeadActivities(runId),
    loadStage1LeadRecords(runId),
  ]);
  return { activities, leads };
}

export async function updateStage1LeadContact(
  contactId: string,
  patch: Pick<NewStage1PotentialCustomer, "contact_name" | "contact_email" | "contact_phone" | "site_address">,
): Promise<Stage1LeadRecord> {
  if (!patch.contact_email?.trim() && !patch.contact_phone?.trim()) {
    throw new Error("A phone number or email is required.");
  }
  const { data, error } = await supabase
    .from("stage1_leads")
    .update({
      contact_name: patch.contact_name?.trim() || null,
      contact_email: patch.contact_email?.trim() || null,
      contact_phone: patch.contact_phone?.trim() || null,
      site_address: patch.site_address?.trim() || null,
    })
    .eq("id", contactId)
    .select(LEAD_FIELDS)
    .single();
  if (error) throw new Error(error.message);
  return mapLeadRecord(data);
}

export async function loadStage1Contact(contactId: string): Promise<Stage1LeadRecord> {
  const { data, error } = await supabase
    .from("stage1_leads")
    .select(LEAD_FIELDS)
    .eq("id", contactId)
    .single();
  if (error) throw new Error(error.message);
  return mapLeadRecord(data);
}

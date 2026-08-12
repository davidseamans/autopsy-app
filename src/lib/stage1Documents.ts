import { supabase } from "@/lib/supabase";
import type { Stage1CleanTypePricingRule } from "@/lib/stage1Pricing";

export type { Stage1CleanTypePricingRule } from "@/lib/stage1Pricing";

export type QuoteLineDraft = {
  description: string;
  estimatedHours: number;
};

export type Stage1QuoteDocument = {
  id: string;
  runId: string;
  number: string;
  status: string;
  issuedAt: string;
  validUntil: string | null;
  clientName: string;
  clientContactName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  siteAddress: string | null;
  serviceDescription: string | null;
  paymentTerms: string | null;
  cleanTypeCode: string | null;
  cleanTypeLabel: string | null;
  pricingRuleVersion: number | null;
  labourServiceAmountExGst: number;
  estimatedConsumablesCost: number;
  consumablesSellAmount: number;
  subtotalExGst: number;
  gstAmount: number;
  totalIncGst: number;
  jobId: string | null;
  jobNumber: string | null;
  lines: Array<{
    id: string;
    position: number;
    description: string;
    estimatedHours: number;
    chargeOutRateExGst: number;
    lineTotalExGst: number;
  }>;
  invoice: null | {
    id: string;
    number: string;
    issuedAt: string;
    dueDate: string | null;
    status: string;
    issuerBusinessName: string;
    issuerRegisteredName: string;
    issuerAbn: string;
    issuerContactName: string;
    issuerPhone: string;
    issuerEmail: string;
  };
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function fetchStage1CleanTypePricingRules(): Promise<Stage1CleanTypePricingRule[]> {
  const { data, error } = await supabase
    .from("stage1_clean_type_pricing_rules")
    .select("code,label,guidance,rule_version,consumables_cost_per_hour,minimum_consumables_cost,target_consumables_margin_pct")
    .eq("active", true)
    .order("display_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((rule) => ({
    code: String(rule.code),
    label: String(rule.label),
    guidance: String(rule.guidance),
    ruleVersion: Number(rule.rule_version),
    consumablesCostPerHour: Number(rule.consumables_cost_per_hour),
    minimumConsumablesCost: Number(rule.minimum_consumables_cost),
    targetConsumablesMarginPct: Number(rule.target_consumables_margin_pct),
  }));
}

export async function createStandardQuote(input: {
  runId: string;
  clientName: string;
  clientContactName: string;
  clientEmail: string;
  clientPhone: string;
  siteAddress: string;
  serviceDescription: string;
  validUntil: string;
  paymentTerms: string;
  cleanTypeCode: string;
  chargeOutRateExGst: number;
  items: QuoteLineDraft[];
  contactId?: string | null;
}) {
  const { data, error } = await supabase.rpc(
    input.contactId ? "create_stage1_guided_quote_from_contact" : "create_stage1_guided_quote",
    {
      ...(input.contactId ? { p_contact_id: input.contactId } : { p_run_id: input.runId }),
      p_client_name: input.clientName,
      p_client_contact_name: input.clientContactName,
      p_client_email: input.clientEmail,
      p_client_phone: input.clientPhone,
      p_site_address: input.siteAddress,
      p_service_description: input.serviceDescription,
      p_valid_until: input.validUntil,
      p_payment_terms: input.paymentTerms,
      p_clean_type_code: input.cleanTypeCode,
      p_items: input.items.map((item) => ({
        description: item.description,
        quantity: item.estimatedHours,
        unitPriceExGst: input.chargeOutRateExGst,
      })),
    },
  );
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.quote_id) throw new Error("The quote was not created.");
  return {
    quoteId: String(row.quote_id),
    quoteNumber: `Q-${row.quote_sequence_number}`,
    totalIncGst: Number(row.total_inc_gst ?? 0),
  };
}

export async function acceptStage1Quote(quoteId: string) {
  const { data, error } = await supabase.rpc("accept_stage1_quote", { p_quote_id: quoteId });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.job_id) throw new Error("The job was not created.");
  const sequence = Number(row.job_sequence_number);
  if (!Number.isInteger(sequence) || sequence <= 0) throw new Error("The job was created without a valid job number.");
  return { jobId: String(row.job_id), jobNumber: `J-${sequence}` };
}

export async function createInvoiceFromQuote(quoteId: string, dueDate: string) {
  const { data, error } = await supabase.rpc("create_stage1_invoice_from_quote", {
    p_quote_id: quoteId,
    p_due_date: dueDate,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.invoice_id) throw new Error("The invoice was not created.");
  return {
    invoiceId: String(row.invoice_id),
    invoiceNumber: String(row.invoice_reference),
  };
}

export async function setStage1QuoteRejected(quoteId: string, rejected: boolean) {
  const { error } = await supabase.rpc("set_stage1_quote_outcome", {
    p_quote_id: quoteId,
    p_status: rejected ? "rejected" : "sent",
    p_reason: null,
  });
  if (error) throw new Error(error.message);
}

export async function fetchStage1QuoteDocument(quoteId: string): Promise<Stage1QuoteDocument> {
  const { data: quote, error: quoteError } = await supabase
    .from("stage1_quotes")
    .select("id,autopsy_run_id,quote_sequence_number,status,issued_at,valid_until,client_name,client_contact_name,client_email,client_phone,site_address,service_description,payment_terms,clean_type_code,clean_type_label,pricing_rule_version,labour_service_amount_ex_gst,estimated_consumables_cost,consumables_sell_amount,subtotal_ex_gst,gst_amount,total_inc_gst,amount,stage1_job_id")
    .eq("id", quoteId)
    .single();
  if (quoteError) throw new Error(quoteError.message);

  const [lineResult, invoiceResult, jobResult] = await Promise.all([
    supabase
      .from("stage1_quote_line_items")
      .select("id,line_position,description,quantity,unit_price_ex_gst,line_total_ex_gst")
      .eq("stage1_quote_id", quoteId)
      .order("line_position", { ascending: true }),
    supabase
      .from("stage1_revenue_events")
      .select("id,reference,created_at,event_date,due_date,invoice_status,issuer_business_name,issuer_registered_name,issuer_abn,issuer_contact_name,issuer_phone,issuer_email")
      .eq("source_quote_id", quoteId)
      .eq("revenue_type", "invoice")
      .maybeSingle(),
    quote.stage1_job_id
      ? supabase.from("stage1_jobs").select("id,job_sequence_number").eq("id", quote.stage1_job_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (lineResult.error) throw new Error(lineResult.error.message);
  if (invoiceResult.error) throw new Error(invoiceResult.error.message);
  if (jobResult.error) throw new Error(jobResult.error.message);

  const total = Number(quote.total_inc_gst ?? quote.amount ?? 0);
  const subtotal = Number(quote.subtotal_ex_gst ?? total / 1.1);
  const gst = Number(quote.gst_amount ?? total - subtotal);
  const invoice = invoiceResult.data;
  return {
    id: String(quote.id),
    runId: String(quote.autopsy_run_id),
    number: `Q-${quote.quote_sequence_number}`,
    status: String(quote.status),
    issuedAt: String(quote.issued_at),
    validUntil: quote.valid_until ? String(quote.valid_until) : null,
    clientName: String(quote.client_name),
    clientContactName: quote.client_contact_name ? String(quote.client_contact_name) : null,
    clientEmail: quote.client_email ? String(quote.client_email) : null,
    clientPhone: quote.client_phone ? String(quote.client_phone) : null,
    siteAddress: quote.site_address ? String(quote.site_address) : null,
    serviceDescription: quote.service_description ? String(quote.service_description) : null,
    paymentTerms: quote.payment_terms ? String(quote.payment_terms) : null,
    cleanTypeCode: quote.clean_type_code ? String(quote.clean_type_code) : null,
    cleanTypeLabel: quote.clean_type_label ? String(quote.clean_type_label) : null,
    pricingRuleVersion: quote.pricing_rule_version == null ? null : Number(quote.pricing_rule_version),
    labourServiceAmountExGst: Number(quote.labour_service_amount_ex_gst ?? subtotal),
    estimatedConsumablesCost: Number(quote.estimated_consumables_cost ?? 0),
    consumablesSellAmount: Number(quote.consumables_sell_amount ?? 0),
    subtotalExGst: subtotal,
    gstAmount: gst,
    totalIncGst: total,
    jobId: quote.stage1_job_id ? String(quote.stage1_job_id) : null,
    jobNumber: jobResult.data?.job_sequence_number ? `J-${jobResult.data.job_sequence_number}` : null,
    lines: (lineResult.data ?? []).map((line) => ({
      id: String(line.id),
      position: Number(line.line_position),
      description: String(line.description),
      estimatedHours: Number(line.quantity),
      chargeOutRateExGst: Number(line.unit_price_ex_gst),
      lineTotalExGst: Number(line.line_total_ex_gst),
    })),
    invoice: invoice
      ? {
          id: String(invoice.id),
          number: String(invoice.reference),
          issuedAt: String(invoice.event_date ?? invoice.created_at),
          dueDate: invoice.due_date ? String(invoice.due_date) : null,
          status: String(invoice.invoice_status ?? "issued"),
          issuerBusinessName: String(invoice.issuer_business_name ?? ""),
          issuerRegisteredName: String(invoice.issuer_registered_name ?? ""),
          issuerAbn: String(invoice.issuer_abn ?? ""),
          issuerContactName: String(invoice.issuer_contact_name ?? ""),
          issuerPhone: String(invoice.issuer_phone ?? ""),
          issuerEmail: String(invoice.issuer_email ?? ""),
        }
      : null,
  };
}

export function describeDocumentError(error: unknown): string {
  const message = errorMessage(error);
  if (message.includes("function") && message.includes("schema cache")) {
    return "The Stage 1 document migration has not been deployed yet.";
  }
  return message;
}

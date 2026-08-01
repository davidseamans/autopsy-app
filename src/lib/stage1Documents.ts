import { supabase } from "@/lib/supabase";

export type QuoteLineDraft = {
  description: string;
  quantity: number;
  unitPriceExGst: number;
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
  subtotalExGst: number;
  gstAmount: number;
  totalIncGst: number;
  jobId: string | null;
  jobNumber: string | null;
  lines: Array<{
    id: string;
    position: number;
    description: string;
    quantity: number;
    unitPriceExGst: number;
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
  items: QuoteLineDraft[];
}) {
  const { data, error } = await supabase.rpc("create_stage1_quote", {
    p_run_id: input.runId,
    p_client_name: input.clientName,
    p_client_contact_name: input.clientContactName,
    p_client_email: input.clientEmail,
    p_client_phone: input.clientPhone,
    p_site_address: input.siteAddress,
    p_service_description: input.serviceDescription,
    p_valid_until: input.validUntil,
    p_payment_terms: input.paymentTerms,
    p_items: input.items,
  });
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
  return { jobId: String(row.job_id), jobNumber: `J-${row.job_sequence_number}` };
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

export async function fetchStage1QuoteDocument(quoteId: string): Promise<Stage1QuoteDocument> {
  const { data: quote, error: quoteError } = await supabase
    .from("stage1_quotes")
    .select("id,autopsy_run_id,quote_sequence_number,status,issued_at,valid_until,client_name,client_contact_name,client_email,client_phone,site_address,service_description,payment_terms,subtotal_ex_gst,gst_amount,total_inc_gst,amount,stage1_job_id")
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
    subtotalExGst: subtotal,
    gstAmount: gst,
    totalIncGst: total,
    jobId: quote.stage1_job_id ? String(quote.stage1_job_id) : null,
    jobNumber: jobResult.data?.job_sequence_number ? `J-${jobResult.data.job_sequence_number}` : null,
    lines: (lineResult.data ?? []).map((line) => ({
      id: String(line.id),
      position: Number(line.line_position),
      description: String(line.description),
      quantity: Number(line.quantity),
      unitPriceExGst: Number(line.unit_price_ex_gst),
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

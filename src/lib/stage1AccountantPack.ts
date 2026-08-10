import { computeGstSplit } from "@/lib/gst";
import type { ProofUnit } from "@/pages/Stage1";
import type { EvidenceRecord } from "@/lib/stage1Evidence";

type Business = { businessName: string; registeredName: string; abn: string; gstRegistered: boolean } | null;
type PackInput = { units: ProofUnit[]; business: Business; runId: string | null; generatedAt?: Date };
type PackFile = string | Uint8Array;

const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const csv = (rows: unknown[][]) => rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
const jobNo = (unit: ProofUnit) => unit.jobSequenceNumber != null ? `J-${unit.jobSequenceNumber}` : unit.jobNumber ?? `J-${unit.n}`;
const money = (value: number) => value.toFixed(2);
const invoiceLines = (unit: ProofUnit) => unit.invoiceLines?.length ? unit.invoiceLines : unit.invoiceAmount ? [{ id: "legacy", date: unit.invoiceDate, ref: unit.invoiceRef, description: "Customer invoice", amount: unit.invoiceAmount, gstTreatment: unit.invoiceGstTreatment, gstAmount: unit.invoiceGstAmount, gstOverridden: unit.invoiceGstOverridden }] : [];
const paymentLines = (unit: ProofUnit) => unit.paymentLines?.length ? unit.paymentLines : unit.paymentAmount ? [{ id: "legacy", date: unit.paymentDate, description: "Payment received", amount: unit.paymentAmount, method: unit.paymentMethod }] : [];
const split = (amount = 0, treatment?: string, gstAmount?: number, overridden?: boolean) => computeGstSplit({ inclusive: amount, treatment: treatment as Parameters<typeof computeGstSplit>[0]["treatment"], gstOverride: gstAmount, overridden });
const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export function buildAccountantPackFiles({ units, business, runId, generatedAt = new Date() }: PackInput): Record<string, PackFile> {
  const jobs = units.filter((unit) => unit.lifecycle !== "voided");
  const invoiceRows: unknown[][] = [["Job", "Customer", "Date", "Reference", "Description", "Gross incl GST", "GST", "Net ex GST"]];
  const paymentRows: unknown[][] = [["Job", "Customer", "Date", "Description", "Amount", "Method"]];
  const costRows: unknown[][] = [["Job", "Customer", "Date", "Reference", "Description", "Gross incl GST", "GST", "Net ex GST"]];
  const expenseRows: unknown[][] = [["Job", "Date", "Supplier", "Description", "Gross incl GST", "GST", "Net ex GST"]];
  const jobRows: unknown[][] = [["Job", "Customer", "Site", "Status", "Source quote", "Estimated hours", "Actual hours", "Invoices incl GST", "Payments", "Outstanding", "Job costs incl GST"]];
  let invoices = 0, payments = 0, costs = 0, expenses = 0;
  for (const unit of jobs) {
    const unitInvoices = invoiceLines(unit); const unitPayments = paymentLines(unit); const unitCosts = unit.costLines ?? [];
    const invoiceTotal = unitInvoices.reduce((sum, line) => sum + (line.amount ?? 0), 0);
    const paymentTotal = unitPayments.reduce((sum, line) => sum + (line.amount ?? 0), 0);
    const costTotal = unitCosts.reduce((sum, line) => sum + (line.amount ?? 0), 0);
    jobRows.push([jobNo(unit), unit.client, unit.jobSite, unit.status, unit.sourceQuote, unit.quotedLabourHours, unit.actualLabourHours, money(invoiceTotal), money(paymentTotal), money(invoiceTotal - paymentTotal), money(costTotal)]);
    for (const line of unitInvoices) { const value = split(line.amount, line.gstTreatment, line.gstAmount, line.gstOverridden); invoices += value.inclusive; invoiceRows.push([jobNo(unit), unit.client, line.date, line.ref, line.description, money(value.inclusive), money(value.gst), money(value.exGst)]); }
    for (const line of unitPayments) { payments += line.amount ?? 0; paymentRows.push([jobNo(unit), unit.client, line.date, line.description, money(line.amount ?? 0), line.method]); }
    for (const line of unitCosts) { const value = split(line.amount, line.gstTreatment, line.gstAmount, line.gstOverridden); costs += value.inclusive; costRows.push([jobNo(unit), unit.client, line.date, line.docName, line.description, money(value.inclusive), money(value.gst), money(value.exGst)]); }
    for (const line of unit.gbExpenses ?? []) { const value = split(line.amount, line.gstIncluded === false ? "no_gst" : "gst_included"); expenses += value.inclusive; expenseRows.push([jobNo(unit), line.expenseDate, line.supplier, line.description, money(value.inclusive), money(value.gst), money(value.exGst)]); }
  }
  const summary = csv([["5JD Accountant Pack"], ["Generated", generatedAt.toISOString()], ["Autopsy run", runId], ["Business name", business?.businessName], ["Registered name", business?.registeredName], ["ABN", business?.abn], ["GST registered", business?.gstRegistered ? "Yes" : "No"], [], ["Reconciliation", "Amount"], ["Customer invoices incl GST", money(invoices)], ["Payments received", money(payments)], ["Outstanding", money(invoices - payments)], ["Job costs incl GST", money(costs)], ["General expenses incl GST", money(expenses)]]);
  const readme = `5JD ACCOUNTANT PACK\n\nThis is a practical handover from First 5 Jobs, not an audit file or accounting advice.\n\nBefore importing or entering anything, check whether QBO or bank feeds already contain the same transactions. Do not duplicate them. The accountant decides whether to use bank-feed data, these CSVs, summary journals, or a combination.\n\nFiles\n- summary.csv: simple reconciliation totals\n- jobs.csv: one row per 5JD job\n- invoices.csv, payments.csv, job-costs.csv, general-expenses.csv: transaction detail\n- attachments.csv: index linking original files to transaction date and amount\n- attachments/: the original files uploaded during 5JD\n- job-detail-reports.html: printable job summaries\n\nThe pack can be downloaded again whenever details change.\n`;
  const cards = jobs.map((unit) => `<section><h2>${esc(jobNo(unit))} - ${esc(unit.client)}</h2><dl><dt>Site</dt><dd>${esc(unit.jobSite || "-")}</dd><dt>Status</dt><dd>${esc(unit.status)}</dd><dt>Source quote</dt><dd>${esc(unit.sourceQuote || "-")}</dd><dt>Estimated / actual hours</dt><dd>${esc(unit.quotedLabourHours ?? "-")} / ${esc(unit.actualLabourHours ?? "-")}</dd></dl><h3>Invoices</h3><p>$${money(invoiceLines(unit).reduce((sum, line) => sum + (line.amount ?? 0), 0))}</p><h3>Payments</h3><p>$${money(paymentLines(unit).reduce((sum, line) => sum + (line.amount ?? 0), 0))}</p><h3>Job costs</h3><p>$${money((unit.costLines ?? []).reduce((sum, line) => sum + (line.amount ?? 0), 0))}</p></section>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>5JD Job Detail Reports</title><style>body{font:14px Arial,sans-serif;color:#172033;margin:32px}header{border-bottom:3px solid #123b63}section{break-after:page;padding:12px 0}h1,h2{color:#123b63}dl{display:grid;grid-template-columns:180px 1fr;gap:6px}dt{font-weight:bold}dd{margin:0}@media print{body{margin:14mm}}</style></head><body><header><h1>First 5 Jobs - Job Detail Reports</h1><p>${esc(business?.businessName || "Business not supplied")} | ABN ${esc(business?.abn || "-")} | Generated ${esc(generatedAt.toLocaleString("en-AU"))}</p><p>Practical handover only. Check QBO and bank feeds before entering transactions.</p></header>${cards}</body></html>`;
  return { "README.txt": readme, "summary.csv": summary, "jobs.csv": csv(jobRows), "invoices.csv": csv(invoiceRows), "payments.csv": csv(paymentRows), "job-costs.csv": csv(costRows), "general-expenses.csv": csv(expenseRows), "job-detail-reports.html": html };
}

const safeName = (value: string) => value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "attachment";
const blobBytes = async (blob: Blob) => {
  if (typeof blob.arrayBuffer === "function") return new Uint8Array(await blob.arrayBuffer());
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
};
const attachmentTransaction = (units: ProofUnit[], record: EvidenceRecord) => {
  for (const unit of units) {
    const invoice = invoiceLines(unit).find((line) => line.id === record.linkRef);
    if (invoice) return { job: jobNo(unit), customer: unit.client, date: invoice.date, amount: invoice.amount };
    const payment = paymentLines(unit).find((line) => line.id === record.linkRef);
    if (payment) return { job: jobNo(unit), customer: unit.client, date: payment.date, amount: payment.amount };
    const cost = unit.costLines?.find((line) => line.id === record.linkRef);
    if (cost) return { job: jobNo(unit), customer: unit.client, date: cost.date, amount: cost.amount };
    const expense = unit.gbExpenses?.find((line) => line.id === record.linkRef);
    if (expense) return { job: jobNo(unit), customer: unit.client, date: expense.expenseDate, amount: expense.amount };
  }
  return { job: "", customer: "", date: record.uploadedAt.slice(0, 10), amount: undefined };
};

export async function addAccountantPackAttachments(files: Record<string, PackFile>, units: ProofUnit[], records: EvidenceRecord[], downloader: (record: EvidenceRecord) => Promise<Blob>) {
  const index: unknown[][] = [["Job", "Customer", "Transaction date", "Amount", "Attachment type", "Linked transaction", "Original filename", "Pack filename"]];
  const used = new Set<string>();
  for (const record of records) {
    const transaction = attachmentTransaction(units, record);
    const stem = [transaction.date || "no-date", transaction.amount != null ? money(transaction.amount) : "no-amount", transaction.job || "unlinked", record.fileName].map(safeName).join("_");
    let name = `attachments/${stem}`;
    for (let suffix = 2; used.has(name); suffix++) name = `attachments/${stem}_${suffix}`;
    used.add(name);
    const blob = await downloader(record);
    files[name] = await blobBytes(blob);
    index.push([transaction.job, transaction.customer, transaction.date, transaction.amount != null ? money(transaction.amount) : "", record.evidenceType, record.linkLabel, record.fileName, name]);
  }
  files["attachments.csv"] = csv(index);
  return files;
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (bytes: Uint8Array) => { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; };
const u16 = (value: number) => new Uint8Array([value & 255, (value >>> 8) & 255]);
const u32 = (value: number) => new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);

export function zipAccountantPack(files: Record<string, PackFile>) {
  const encoder = new TextEncoder(); const local: BlobPart[] = []; const central: BlobPart[] = []; let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const filename = encoder.encode(name); const data = typeof content === "string" ? encoder.encode(content) : content; const crc = crc32(data);
    const header = [u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(filename.length), u16(0), filename, data]; local.push(...header);
    central.push(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(filename.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), filename);
    offset += header.reduce((sum, part) => sum + part.byteLength, 0);
  }
  const centralSize = central.reduce((sum, part) => sum + part.byteLength, 0); const count = Object.keys(files).length;
  return new Blob([...local, ...central, u32(0x06054b50), u16(0), u16(0), u16(count), u16(count), u32(centralSize), u32(offset), u16(0)], { type: "application/zip" });
}

export async function downloadAccountantPack(input: PackInput & { attachments?: EvidenceRecord[]; attachmentDownloader?: (record: EvidenceRecord) => Promise<Blob> }) {
  const files = buildAccountantPackFiles(input);
  if (input.attachments && input.attachmentDownloader) {
    await addAccountantPackAttachments(files, input.units, input.attachments, input.attachmentDownloader);
  } else {
    files["attachments.csv"] = csv([["Job", "Customer", "Transaction date", "Amount", "Attachment type", "Linked transaction", "Original filename", "Pack filename"]]);
  }
  const blob = zipAccountantPack(files); const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = `5jd-accountant-pack-${new Date().toISOString().slice(0, 10)}.zip`; anchor.click(); URL.revokeObjectURL(url);
}

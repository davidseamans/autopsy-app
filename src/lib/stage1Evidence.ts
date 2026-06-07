// ============================================================================
// Stage 1 Evidence Persistence
// ----------------------------------------------------------------------------
// Supporting paperwork (transaction-related documents) is persisted in the
// canonical Lovable Cloud backend, scoped to the active Autopsy run and linked
// to the relevant transaction line (job, invoice/revenue line, cost line, or
// quote/approval).
//
// Doctrine:
//   - Documentation supports business maturity, not surveillance.
//   - Evidence = transaction-related paperwork (quotes, invoices, receipts,
//     work orders, job photos, customer approvals, relevant correspondence).
//   - Evidence is NOT financial surveillance. We never request bank statements
//     or unrelated private financial records.
//
// Canonical persistence (replaces the previous IndexedDB store):
//   - Binary files live in the private Supabase Storage bucket
//     `stage1-evidence`, under a run-scoped path.
//   - Metadata lives in `public.stage1_evidence` and is written ONLY through
//     the run-scoped RPC `register_stage1_evidence(...)`, so Supabase resolves
//     identity and ownership server-side.
//   - Reads are run-scoped table selects guarded by RLS; downloads use signed
//     URLs against the private bucket.
//
// This module never touches margin, GST, RPC access, auth, or Stage 2 gating.
// ============================================================================

import { supabase } from "@/lib/supabase";

const BUCKET = "stage1-evidence";
const TABLE = "stage1_evidence";

export type EvidenceLinkType = "job" | "invoice" | "cost" | "quote";

export type EvidenceType =
  | "Accepted Quote"
  | "Invoice"
  | "Supplier Receipt"
  | "Work Order"
  | "Job Photo"
  | "Customer Approval"
  | "Relevant Correspondence";

export const EVIDENCE_TYPES: EvidenceType[] = [
  "Accepted Quote",
  "Invoice",
  "Supplier Receipt",
  "Work Order",
  "Job Photo",
  "Customer Approval",
  "Relevant Correspondence",
];

/** Persisted metadata for an attached document. */
export interface EvidenceRecord {
  id: string;
  runId: string;
  /** Which kind of transaction line this paperwork supports. */
  linkType: EvidenceLinkType;
  /** Stable reference to the specific transaction line within the run. */
  linkRef: string;
  /** Human-readable label of the linked transaction (for display). */
  linkLabel: string;
  evidenceType: EvidenceType;
  fileName: string;
  contentType: string;
  size: number;
  /** ISO timestamp of when the paperwork was attached. */
  uploadedAt: string;
  /** Object path within the `stage1-evidence` storage bucket. */
  storagePath: string;
}

/** Shape of a `public.stage1_evidence` row returned by the Data API. */
interface EvidenceRow {
  id: string;
  run_id: string;
  link_type: EvidenceLinkType;
  link_ref: string;
  link_label: string;
  evidence_type: EvidenceType;
  file_name: string;
  content_type: string;
  size: number | string | null;
  storage_path: string;
  uploaded_at: string;
}

function fromRow(row: EvidenceRow): EvidenceRecord {
  return {
    id: row.id,
    runId: row.run_id,
    linkType: row.link_type,
    linkRef: row.link_ref,
    linkLabel: row.link_label,
    evidenceType: row.evidence_type,
    fileName: row.file_name,
    contentType: row.content_type,
    size: Number(row.size ?? 0) || 0,
    uploadedAt: row.uploaded_at,
    storagePath: row.storage_path,
  };
}

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `ev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sanitizeFileName(name: string): string {
  return (name || "file").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120);
}

/**
 * Attach a file to a transaction line. The binary is uploaded to the private
 * `stage1-evidence` bucket, then metadata is registered via the run-scoped
 * RPC `register_stage1_evidence`. Returns the persisted metadata.
 */
export async function addEvidence(input: {
  runId: string;
  linkType: EvidenceLinkType;
  linkRef: string;
  linkLabel: string;
  evidenceType: EvidenceType;
  file: File;
}): Promise<EvidenceRecord> {
  const id = makeId();
  const contentType = input.file.type || "application/octet-stream";
  const storagePath = `${input.runId}/${input.linkType}/${input.linkRef}/${id}-${sanitizeFileName(input.file.name)}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, input.file, { contentType, upsert: false });
  if (upErr) throw upErr;

  const { data, error } = await supabase.rpc("register_stage1_evidence", {
    p_evidence_id: id,
    p_run_id: input.runId,
    p_link_type: input.linkType,
    p_link_ref: input.linkRef,
    p_link_label: input.linkLabel,
    p_evidence_type: input.evidenceType,
    p_file_name: input.file.name,
    p_content_type: contentType,
    p_size: input.file.size,
    p_storage_path: storagePath,
  });
  if (error) {
    // Roll back the orphaned object so storage and metadata stay consistent.
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    throw error;
  }

  const row = (Array.isArray(data) ? data[0] : data) as EvidenceRow | null;
  if (row) return fromRow(row);
  // RPC may return only the id; fall back to the values we just wrote.
  return {
    id,
    runId: input.runId,
    linkType: input.linkType,
    linkRef: input.linkRef,
    linkLabel: input.linkLabel,
    evidenceType: input.evidenceType,
    fileName: input.file.name,
    contentType,
    size: input.file.size,
    uploadedAt: new Date().toISOString(),
    storagePath,
  };
}

/** List paperwork attached to a specific transaction line. */
export async function listEvidence(
  runId: string,
  linkType: EvidenceLinkType,
  linkRef: string,
): Promise<EvidenceRecord[]> {
  if (!runId) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("run_id", runId)
    .eq("link_type", linkType)
    .eq("link_ref", linkRef)
    .order("uploaded_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as EvidenceRow[]).map(fromRow);
}

/** List all paperwork for a run (for run-level summaries). */
export async function listRunEvidence(runId: string): Promise<EvidenceRecord[]> {
  if (!runId) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("run_id", runId)
    .order("uploaded_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as EvidenceRow[]).map(fromRow);
}

/** Open / view / download a stored attachment. Returns a signed URL. */
export async function getEvidenceUrl(
  id: string,
): Promise<{ url: string; record: EvidenceRecord } | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const record = fromRow(data as EvidenceRow);
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(record.storagePath, 60 * 60);
  if (signErr || !signed?.signedUrl) return null;
  return { url: signed.signedUrl, record };
}

/** Remove a stored attachment. Missing paperwork never blocks the job. */
export async function deleteEvidence(id: string): Promise<void> {
  const { data } = await supabase
    .from(TABLE)
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();
  const storagePath = (data as { storage_path?: string } | null)?.storage_path;
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
  if (storagePath) {
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
  }
}

export const EVIDENCE_LINK_LABELS: Record<EvidenceLinkType, string> = {
  job: "Job record",
  invoice: "Revenue line",
  cost: "Cost line",
  quote: "Quote / approval",
};

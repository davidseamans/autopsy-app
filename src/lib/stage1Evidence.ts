// ============================================================================
// Stage 1 Evidence Persistence
// ----------------------------------------------------------------------------
// Supporting paperwork (transaction-related documents) is persisted locally in
// IndexedDB, scoped to the active Autopsy run and linked to the relevant
// transaction line (job, invoice/revenue line, cost line, or quote/approval).
//
// Doctrine:
//   - Documentation supports business maturity, not surveillance.
//   - Evidence = transaction-related paperwork (quotes, invoices, receipts,
//     work orders, job photos, customer approvals, relevant correspondence).
//   - Evidence is NOT financial surveillance. We never request bank statements
//     or unrelated private financial records.
//
// Why IndexedDB:
//   - Files (including job photos) are stored as Blobs, so they survive a page
//     refresh, and survive logout/login on the same device (auth sign-out only
//     clears the session token, not stored paperwork).
//   - Records are keyed by runId so re-opening the same run restores exactly
//     that run's paperwork, attached to the correct transaction line.
//
// This module never touches margin, GST, RPC access, auth, or Stage 2 gating.
// ============================================================================

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
}

/** A stored record plus its binary payload. */
interface StoredEvidence extends EvidenceRecord {
  blob: Blob;
}

const DB_NAME = "autopsy_stage1_evidence";
const STORE = "evidence";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex("runId", "runId", { unique: false });
        os.createIndex("run_link", ["runId", "linkType", "linkRef"], { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db: IDBDatabase, mode: IDBTransactionMode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function stripBlob(rec: StoredEvidence): EvidenceRecord {
  const { blob: _blob, ...meta } = rec;
  return meta;
}

/** Attach a file to a transaction line. Returns the persisted metadata. */
export async function addEvidence(input: {
  runId: string;
  linkType: EvidenceLinkType;
  linkRef: string;
  linkLabel: string;
  evidenceType: EvidenceType;
  file: File;
}): Promise<EvidenceRecord> {
  const db = await openDb();
  const rec: StoredEvidence = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `ev-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    runId: input.runId,
    linkType: input.linkType,
    linkRef: input.linkRef,
    linkLabel: input.linkLabel,
    evidenceType: input.evidenceType,
    fileName: input.file.name,
    contentType: input.file.type || "application/octet-stream",
    size: input.file.size,
    uploadedAt: new Date().toISOString(),
    blob: input.file,
  };
  await new Promise<void>((resolve, reject) => {
    const req = tx(db, "readwrite").put(rec);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  return stripBlob(rec);
}

/** List paperwork attached to a specific transaction line. */
export async function listEvidence(
  runId: string,
  linkType: EvidenceLinkType,
  linkRef: string,
): Promise<EvidenceRecord[]> {
  if (!runId) return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const idx = tx(db, "readonly").index("run_link");
    const req = idx.getAll(IDBKeyRange.only([runId, linkType, linkRef]));
    req.onsuccess = () =>
      resolve(
        (req.result as StoredEvidence[])
          .map(stripBlob)
          .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt)),
      );
    req.onerror = () => reject(req.error);
  });
}

/** List all paperwork for a run (for run-level summaries). */
export async function listRunEvidence(runId: string): Promise<EvidenceRecord[]> {
  if (!runId) return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const idx = tx(db, "readonly").index("runId");
    const req = idx.getAll(IDBKeyRange.only(runId));
    req.onsuccess = () =>
      resolve((req.result as StoredEvidence[]).map(stripBlob));
    req.onerror = () => reject(req.error);
  });
}

/** Open / view / download a stored attachment. Returns an object URL. */
export async function getEvidenceUrl(id: string): Promise<{ url: string; record: EvidenceRecord } | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readonly").get(id);
    req.onsuccess = () => {
      const rec = req.result as StoredEvidence | undefined;
      if (!rec) return resolve(null);
      resolve({ url: URL.createObjectURL(rec.blob), record: stripBlob(rec) });
    };
    req.onerror = () => reject(req.error);
  });
}

/** Remove a stored attachment. Missing paperwork never blocks the job. */
export async function deleteEvidence(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const req = tx(db, "readwrite").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export const EVIDENCE_LINK_LABELS: Record<EvidenceLinkType, string> = {
  job: "Job record",
  invoice: "Revenue line",
  cost: "Cost line",
  quote: "Quote / approval",
};

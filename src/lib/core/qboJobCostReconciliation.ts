export type QboCostSource = "Bill" | "Purchase" | "JournalEntry" | "VendorCredit";
export type CostConfidence = "actual" | "provisional" | "derived";

export interface QboJobCostLine {
  sourceType: QboCostSource;
  transactionId: string;
  lineId: string;
  jobId: string;
  amount: number;
  currencyCode: string;
  billableStatus: "billable" | "not_billable" | "unspecified";
  sourceUpdatedAt: string;
}

export interface OperationalCostEvidence {
  id: string;
  jobId: string;
  qboSourceKey: string | null;
  evidenceType: "worker_extra_charge" | "stock_issue" | "other";
  recoverabilityClaimed: boolean;
  quantity: number | null;
  unit: string | null;
  amount: number | null;
  confidence: "provisional" | "derived";
}

export interface ReconciliationRow {
  status: "matched" | "qbo_only" | "operational_only";
  jobId: string;
  qboSourceKey: string | null;
  operationalEvidenceId: string | null;
  costAmount: number | null;
  costConfidence: CostConfidence;
}

export interface ChargeCandidate {
  id: string;
  jobId: string;
  qboSourceKey: string | null;
  operationalEvidenceId: string | null;
  signals: Array<"accounts_payable" | "worker">;
  status: "review_required";
}

export interface JobCostReconciliationResult {
  actualJobCosts: QboJobCostLine[];
  reconciliation: ReconciliationRow[];
  chargeCandidates: ChargeCandidate[];
  contribution: {
    actualCost: number;
    provisionalCost: number;
    derivedCost: number;
  };
  duplicateQboLinesIgnored: number;
}

export function qboCostSourceKey(line: Pick<QboJobCostLine, "sourceType" | "transactionId" | "lineId">) {
  if (!line.transactionId.trim() || !line.lineId.trim()) {
    throw new Error("QBO cost evidence requires transaction and line identity.");
  }
  return `${line.sourceType}:${line.transactionId}:${line.lineId}`;
}

export function reconcileNonLabourJobCosts(input: {
  qboLines: QboJobCostLine[];
  operationalEvidence: OperationalCostEvidence[];
}): JobCostReconciliationResult {
  const qboByKey = new Map<string, QboJobCostLine>();
  let duplicateQboLinesIgnored = 0;

  for (const line of input.qboLines) {
    if (!line.jobId.trim() || !/^[A-Z]{3}$/.test(line.currencyCode)) {
      throw new Error("QBO Job cost requires Job identity and a three-letter currency.");
    }
    if (!Number.isFinite(line.amount)) {
      throw new Error("QBO Job cost amount must be finite.");
    }
    const key = qboCostSourceKey(line);
    const prior = qboByKey.get(key);
    if (prior) {
      if (JSON.stringify(prior) !== JSON.stringify(line)) {
        throw new Error(`Conflicting QBO cost duplicate: ${key}`);
      }
      duplicateQboLinesIgnored += 1;
      continue;
    }
    qboByKey.set(key, line);
  }

  const evidenceByQboKey = new Map<string, OperationalCostEvidence>();
  for (const evidence of input.operationalEvidence) {
    if (evidence.evidenceType === "stock_issue" && evidence.confidence === "provisional") {
      if (evidence.amount !== null) {
        throw new Error("A stock issue cannot assert inventory valuation as provisional actual cost.");
      }
    }
    if (evidence.qboSourceKey) {
      if (evidenceByQboKey.has(evidence.qboSourceKey)) {
        throw new Error(`Multiple operational records claim QBO cost ${evidence.qboSourceKey}.`);
      }
      evidenceByQboKey.set(evidence.qboSourceKey, evidence);
    }
  }

  const reconciliation: ReconciliationRow[] = [];
  const chargeCandidates: ChargeCandidate[] = [];
  const matchedEvidence = new Set<string>();

  for (const [key, line] of qboByKey) {
    const evidence = evidenceByQboKey.get(key);
    if (evidence && evidence.jobId !== line.jobId) {
      throw new Error(`Operational evidence and QBO cost disagree on Job for ${key}.`);
    }
    if (evidence) matchedEvidence.add(evidence.id);
    reconciliation.push({
      status: evidence ? "matched" : "qbo_only",
      jobId: line.jobId,
      qboSourceKey: key,
      operationalEvidenceId: evidence?.id ?? null,
      costAmount: line.amount,
      costConfidence: "actual",
    });

    const signals: ChargeCandidate["signals"] = [];
    if (line.billableStatus === "billable") signals.push("accounts_payable");
    if (evidence?.recoverabilityClaimed) signals.push("worker");
    if (signals.length > 0) {
      chargeCandidates.push({
        id: evidence ? `charge:operational:${evidence.id}` : `charge:qbo:${key}`,
        jobId: line.jobId,
        qboSourceKey: key,
        operationalEvidenceId: evidence?.id ?? null,
        signals,
        status: "review_required",
      });
    }
  }

  for (const evidence of input.operationalEvidence) {
    if (matchedEvidence.has(evidence.id)) continue;
    reconciliation.push({
      status: "operational_only",
      jobId: evidence.jobId,
      qboSourceKey: evidence.qboSourceKey,
      operationalEvidenceId: evidence.id,
      costAmount: evidence.amount,
      costConfidence: evidence.confidence,
    });
    if (evidence.recoverabilityClaimed) {
      chargeCandidates.push({
        id: `charge:operational:${evidence.id}`,
        jobId: evidence.jobId,
        qboSourceKey: evidence.qboSourceKey,
        operationalEvidenceId: evidence.id,
        signals: ["worker"],
        status: "review_required",
      });
    }
  }

  return {
    actualJobCosts: [...qboByKey.values()],
    reconciliation,
    chargeCandidates,
    contribution: {
      actualCost: [...qboByKey.values()].reduce((sum, line) => sum + line.amount, 0),
      provisionalCost: input.operationalEvidence
        .filter((evidence) => !matchedEvidence.has(evidence.id) && evidence.confidence === "provisional")
        .reduce((sum, evidence) => sum + (evidence.amount ?? 0), 0),
      derivedCost: input.operationalEvidence
        .filter((evidence) => !matchedEvidence.has(evidence.id) && evidence.confidence === "derived")
        .reduce((sum, evidence) => sum + (evidence.amount ?? 0), 0),
    },
    duplicateQboLinesIgnored,
  };
}

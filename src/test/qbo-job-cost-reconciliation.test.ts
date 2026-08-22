import { describe, expect, it } from "vitest";
import {
  qboCostSourceKey,
  reconcileNonLabourJobCosts,
  type OperationalCostEvidence,
  type QboJobCostLine,
} from "@/lib/core/qboJobCostReconciliation";

const qboLine: QboJobCostLine = {
  sourceType: "Bill",
  transactionId: "bill-100",
  lineId: "1",
  jobId: "job-a",
  amount: 55,
  currencyCode: "AUD",
  billableStatus: "billable",
  sourceUpdatedAt: "2026-08-22T10:00:00Z",
};

const workerEvidence: OperationalCostEvidence = {
  id: "extra-1",
  jobId: "job-a",
  qboSourceKey: qboCostSourceKey(qboLine),
  evidenceType: "worker_extra_charge",
  recoverabilityClaimed: true,
  quantity: 5,
  unit: "item",
  amount: null,
  confidence: "provisional",
};

describe("BOS-E04 QBO non-labour Job-cost reconciliation", () => {
  it("puts every unique QBO Job cost into actual cost before matching", () => {
    const result = reconcileNonLabourJobCosts({
      qboLines: [qboLine],
      operationalEvidence: [],
    });
    expect(result.actualJobCosts).toEqual([qboLine]);
    expect(result.contribution.actualCost).toBe(55);
    expect(result.reconciliation[0].status).toBe("qbo_only");
  });

  it("matches Worker and A/P evidence into one Charge Candidate", () => {
    const result = reconcileNonLabourJobCosts({
      qboLines: [qboLine],
      operationalEvidence: [workerEvidence],
    });
    expect(result.reconciliation[0].status).toBe("matched");
    expect(result.chargeCandidates).toEqual([{
      id: "charge:operational:extra-1",
      jobId: "job-a",
      qboSourceKey: "Bill:bill-100:1",
      operationalEvidenceId: "extra-1",
      signals: ["accounts_payable", "worker"],
      status: "review_required",
    }]);
  });

  it("keeps QBO-only cost visible and actionable", () => {
    const result = reconcileNonLabourJobCosts({
      qboLines: [{ ...qboLine, billableStatus: "unspecified" }],
      operationalEvidence: [],
    });
    expect(result.reconciliation).toMatchObject([{
      status: "qbo_only",
      qboSourceKey: "Bill:bill-100:1",
      costConfidence: "actual",
    }]);
    expect(result.chargeCandidates).toEqual([]);
  });

  it("keeps operational-only cost provisional or derived", () => {
    const result = reconcileNonLabourJobCosts({
      qboLines: [],
      operationalEvidence: [{
        ...workerEvidence,
        id: "derived-1",
        qboSourceKey: null,
        evidenceType: "other",
        amount: 30,
        confidence: "derived",
      }],
    });
    expect(result.contribution).toEqual({ actualCost: 0, provisionalCost: 0, derivedCost: 30 });
    expect(result.reconciliation[0].status).toBe("operational_only");
  });

  it("lets stock evidence support quantity and charging without inventory valuation", () => {
    const result = reconcileNonLabourJobCosts({
      qboLines: [],
      operationalEvidence: [{
        ...workerEvidence,
        id: "stock-1",
        qboSourceKey: null,
        evidenceType: "stock_issue",
        quantity: 5,
      }],
    });
    expect(result.contribution.actualCost).toBe(0);
    expect(result.chargeCandidates).toHaveLength(1);
    expect(() => reconcileNonLabourJobCosts({
      qboLines: [],
      operationalEvidence: [{ ...workerEvidence, evidenceType: "stock_issue", amount: 20 }],
    })).toThrow("cannot assert inventory valuation");
  });

  it("ignores identical QBO replay and rejects conflicting duplicates", () => {
    expect(reconcileNonLabourJobCosts({
      qboLines: [qboLine, qboLine],
      operationalEvidence: [],
    }).duplicateQboLinesIgnored).toBe(1);
    expect(() => reconcileNonLabourJobCosts({
      qboLines: [qboLine, { ...qboLine, amount: 56 }],
      operationalEvidence: [],
    })).toThrow("Conflicting QBO cost duplicate");
  });

  it("rejects cross-Job operational matching", () => {
    expect(() => reconcileNonLabourJobCosts({
      qboLines: [qboLine],
      operationalEvidence: [{ ...workerEvidence, jobId: "job-b" }],
    })).toThrow("disagree on Job");
  });

  it("rejects two operational records claiming one QBO cost", () => {
    expect(() => reconcileNonLabourJobCosts({
      qboLines: [qboLine],
      operationalEvidence: [workerEvidence, { ...workerEvidence, id: "extra-2" }],
    })).toThrow("Multiple operational records claim QBO cost");
  });
});

import { describe, expect, it } from "vitest";
import type { PayrollTimesheetSubmission } from "@/lib/core/payrollBoundary";
import {
  automaticPayrollRetryAllowed,
  buildPayrollProofItem,
  partitionEmploymentHeroTimesheets,
  payrollExportBlockers,
  reconcileQboLabourCost,
  resolvePayrollSubmissionState,
  type PayrollAllocationKind,
  type PayrollProofItem,
} from "@/lib/core/payrollJobCostProof";

const tenantId = "91000000-0000-4000-8000-000000000001";

function submission(index: number): PayrollTimesheetSubmission {
  return {
    sourceTimeEntryId: `91000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    employeeExternalId: "pending-mapping",
    workDate: "2026-08-22",
    units: 2,
    unitType: "hours",
    startedAt: "2026-08-22T08:00:00+10:00",
    endedAt: "2026-08-22T10:00:00+10:00",
    breakMinutes: 0,
  };
}

function proofItem(
  index: number,
  kind: PayrollAllocationKind,
  dimension: string,
): PayrollProofItem {
  return buildPayrollProofItem({
    tenantId,
    submission: submission(index),
    allocation: {
      kind,
      internalId: `92000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    },
    evidence: {
      employeeExternalId: `employee-${index}`,
      workTypeExternalId: "ordinary-hours",
      allocationDimensionExternalId: dimension,
      workerMappingProven: true,
      workTypeMappingProven: true,
      allocationDimensionProven: true,
      requestCorrelationProven: true,
    },
  });
}

describe("BOS-E03 payroll and Job-cost proof harness", () => {
  it("fails closed while any external mapping or correlation fact is unproved", () => {
    const blockers = payrollExportBlockers({
      employeeExternalId: "employee-1",
      workTypeExternalId: "ordinary-hours",
      allocationDimensionExternalId: null,
      workerMappingProven: true,
      workTypeMappingProven: true,
      allocationDimensionProven: false,
      requestCorrelationProven: false,
    });
    expect(blockers.map((blocker) => blocker.code)).toEqual([
      "allocation_dimension_unproved",
      "request_correlation_unproved",
    ]);
  });

  it("gives approved time one permanent BuildOS export identity", () => {
    const first = proofItem(1, "job", "dimension-job-a");
    const retry = proofItem(1, "job", "dimension-job-a");
    expect(first.idempotencyKey).toBe(
      `employment-hero:${tenantId}:${submission(1).sourceTimeEntryId}`,
    );
    expect(retry.idempotencyKey).toBe(first.idempotencyKey);
  });

  it("respects Employment Hero's documented maximum batch size of ten", () => {
    expect(partitionEmploymentHeroTimesheets(Array.from({ length: 21 }, (_, i) => i))).toEqual([
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
      [20],
    ]);
  });

  it("treats a timeout as unknown and blocks blind automatic retry", () => {
    const unknown = resolvePayrollSubmissionState({
      previous: { status: "prepared", externalTimesheetId: null, message: null },
      outcome: { type: "timeout", message: "Provider outcome unavailable" },
    });
    expect(unknown.status).toBe("unknown");
    expect(automaticPayrollRetryAllowed(unknown)).toBe(false);
  });

  it("preserves accepted external identity across safe replay", () => {
    const accepted = resolvePayrollSubmissionState({
      previous: { status: "prepared", externalTimesheetId: null, message: null },
      outcome: { type: "accepted", externalTimesheetId: "eh-time-100" },
    });
    expect(resolvePayrollSubmissionState({
      previous: accepted,
      outcome: { type: "accepted", externalTimesheetId: "eh-time-100" },
    })).toEqual(accepted);
    expect(() => resolvePayrollSubmissionState({
      previous: accepted,
      outcome: { type: "accepted", externalTimesheetId: "eh-time-101" },
    })).toThrow("cannot be rebound");
  });

  it("reconciles two Jobs, an approved pool and overhead without duplication", () => {
    const exports = [
      proofItem(1, "job", "job-a"),
      proofItem(2, "job", "job-b"),
      proofItem(3, "approved_pool", "warranty-pool"),
      proofItem(4, "overhead", "management"),
    ];
    const result = reconcileQboLabourCost({
      exports,
      costLines: [
        { transactionId: "journal-1", lineId: "1", amount: 120, allocationDimensionExternalId: "job-a", dimensionStatus: "proven" },
        { transactionId: "journal-1", lineId: "2", amount: 90, allocationDimensionExternalId: "job-b", dimensionStatus: "proven" },
        { transactionId: "journal-1", lineId: "3", amount: 25, allocationDimensionExternalId: "warranty-pool", dimensionStatus: "proven" },
        { transactionId: "journal-1", lineId: "4", amount: 40, allocationDimensionExternalId: "management", dimensionStatus: "proven" },
        { transactionId: "journal-1", lineId: "1", amount: 120, allocationDimensionExternalId: "job-a", dimensionStatus: "proven" },
      ],
    });
    expect([...result.matched.values()]).toEqual([120, 90, 25, 40]);
    expect(result.duplicateLinesIgnored).toBe(1);
    expect(result.blockers).toEqual([]);
  });

  it("shows missing QBO dimension granularity as a blocker", () => {
    const result = reconcileQboLabourCost({
      exports: [proofItem(1, "job", "job-a")],
      costLines: [{
        transactionId: "journal-2",
        lineId: "1",
        amount: 120,
        allocationDimensionExternalId: null,
        dimensionStatus: "unproved",
      }],
    });
    expect(result.matched.size).toBe(0);
    expect(result.blockers).toEqual([
      "QBO line journal-2:1 has no proved allocation dimension.",
    ]);
  });

  it("rejects conflicting duplicate QBO evidence", () => {
    expect(() => reconcileQboLabourCost({
      exports: [proofItem(1, "job", "job-a")],
      costLines: [
        { transactionId: "journal-3", lineId: "1", amount: 120, allocationDimensionExternalId: "job-a", dimensionStatus: "proven" },
        { transactionId: "journal-3", lineId: "1", amount: 121, allocationDimensionExternalId: "job-a", dimensionStatus: "proven" },
      ],
    })).toThrow("Conflicting QBO duplicate");
  });
});

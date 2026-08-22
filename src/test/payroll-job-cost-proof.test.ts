import { describe, expect, it } from "vitest";
import type { PayrollTimesheetSubmission } from "@/lib/core/payrollBoundary";
import {
  automaticPayrollRetryAllowed,
  buildPayrollProofItem,
  partitionEmploymentHeroTimesheets,
  payrollExportBlockers,
  reconcileQboLabourCost,
  resolvePayrollSubmissionState,
  type PayrollAllocation,
  type PayrollProofItem,
  type QboLabourCostLine,
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

function jobAllocation(index: number, customer: string, project: string): PayrollAllocation {
  return {
    kind: "job",
    internalId: `92000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    customerProject: {
      internalCustomerId: `93000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      qboCustomerId: customer,
      qboProjectId: project,
      qboProjectParentCustomerId: customer,
      mappingProven: true,
    },
  };
}

function nonJobAllocation(
  index: number,
  kind: "approved_pool" | "overhead",
): PayrollAllocation {
  return {
    kind,
    internalId: `92000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  };
}

function proofItem(
  index: number,
  allocation: PayrollAllocation,
  costCentre: string,
): PayrollProofItem {
  return buildPayrollProofItem({
    tenantId,
    submission: submission(index),
    allocation,
    evidence: {
      employeeExternalId: `employee-${index}`,
      workTypeExternalId: "ordinary-hours",
      payrollAllocationExternalId: costCentre,
      workerMappingProven: true,
      workTypeMappingProven: true,
      payrollAllocationMappingProven: true,
      requestCorrelationProven: true,
    },
  });
}

function qboLine(
  overrides: Partial<QboLabourCostLine> & Pick<QboLabourCostLine, "lineId" | "kind">,
): QboLabourCostLine {
  return {
    transactionId: "journal-1",
    amount: 100,
    qboCustomerId: null,
    qboProjectId: null,
    qboProjectParentCustomerId: null,
    governedNonJobAllocationExternalId: null,
    mappingStatus: "proven",
    ...overrides,
  };
}

describe("BOS-E03 payroll and Job-cost proof harness", () => {
  it("fails closed while any external mapping or correlation fact is unproved", () => {
    const blockers = payrollExportBlockers({
      employeeExternalId: "employee-1",
      workTypeExternalId: "ordinary-hours",
      payrollAllocationExternalId: null,
      workerMappingProven: true,
      workTypeMappingProven: true,
      payrollAllocationMappingProven: false,
      requestCorrelationProven: false,
    });
    expect(blockers.map((blocker) => blocker.code)).toEqual([
      "payroll_allocation_mapping_unproved",
      "request_correlation_unproved",
    ]);
  });

  it("blocks direct labour unless the QBO Project belongs to the expected Customer", () => {
    const allocation = jobAllocation(1, "customer-a", "project-a");
    if (allocation.kind !== "job") throw new Error("Test fixture is not a Job.");
    allocation.customerProject.qboProjectParentCustomerId = "customer-b";

    expect(() => proofItem(1, allocation, "eh-cost-centre-a")).toThrow(
      "requires a proved QBO Project under the expected QBO Customer",
    );
  });

  it("gives approved time one permanent BuildOS export identity", () => {
    const allocation = jobAllocation(1, "customer-a", "project-a");
    const first = proofItem(1, allocation, "eh-cost-centre-a");
    const retry = proofItem(1, allocation, "eh-cost-centre-a");
    expect(first.idempotencyKey).toBe(
      `employment-hero:${tenantId}:${submission(1).sourceTimeEntryId}`,
    );
    expect(retry.idempotencyKey).toBe(first.idempotencyKey);
  });

  it("uses a configured provider batch size instead of embedding an unproved API limit", () => {
    expect(
      partitionEmploymentHeroTimesheets(Array.from({ length: 12 }, (_, i) => i), 5),
    ).toEqual([
      [0, 1, 2, 3, 4],
      [5, 6, 7, 8, 9],
      [10, 11],
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
    expect(
      resolvePayrollSubmissionState({
        previous: accepted,
        outcome: { type: "accepted", externalTimesheetId: "eh-time-100" },
      }),
    ).toEqual(accepted);
    expect(() =>
      resolvePayrollSubmissionState({
        previous: accepted,
        outcome: { type: "accepted", externalTimesheetId: "eh-time-101" },
      }),
    ).toThrow("cannot be rebound");
  });

  it("reconciles multiple Projects at QBO journal-line level", () => {
    const exports = [
      proofItem(1, jobAllocation(1, "customer-a", "project-a"), "eh-job-a"),
      proofItem(2, jobAllocation(2, "customer-b", "project-b"), "eh-job-b"),
      proofItem(3, nonJobAllocation(3, "approved_pool"), "warranty-pool"),
      proofItem(4, nonJobAllocation(4, "overhead"), "management"),
    ];
    const firstJobLine = qboLine({
      lineId: "1",
      kind: "job",
      amount: 120,
      qboCustomerId: "customer-a",
      qboProjectId: "project-a",
      qboProjectParentCustomerId: "customer-a",
    });
    const result = reconcileQboLabourCost({
      exports,
      costLines: [
        firstJobLine,
        qboLine({
          lineId: "2",
          kind: "job",
          amount: 90,
          qboCustomerId: "customer-b",
          qboProjectId: "project-b",
          qboProjectParentCustomerId: "customer-b",
        }),
        qboLine({
          lineId: "3",
          kind: "approved_pool",
          amount: 25,
          governedNonJobAllocationExternalId: "warranty-pool",
        }),
        qboLine({
          lineId: "4",
          kind: "overhead",
          amount: 40,
          governedNonJobAllocationExternalId: "management",
        }),
        firstJobLine,
      ],
    });
    expect([...result.matched.values()]).toEqual([120, 90, 25, 40]);
    expect(result.duplicateLinesIgnored).toBe(1);
    expect(result.blockers).toEqual([]);
  });

  it("does not accept QBO Class or Location as a substitute for Customer/Project", () => {
    const result = reconcileQboLabourCost({
      exports: [
        proofItem(1, jobAllocation(1, "customer-a", "project-a"), "eh-job-a"),
      ],
      costLines: [
        qboLine({
          transactionId: "journal-2",
          lineId: "1",
          kind: "job",
          qboClassId: "project-a",
          qboLocationId: "customer-a",
        }),
      ],
    });
    expect(result.matched.size).toBe(0);
    expect(result.blockers).toEqual([
      "QBO line journal-2:1 has no proved Customer/Project relationship.",
    ]);
  });

  it("blocks a Project whose returned parent Customer does not match", () => {
    const result = reconcileQboLabourCost({
      exports: [
        proofItem(1, jobAllocation(1, "customer-a", "project-a"), "eh-job-a"),
      ],
      costLines: [
        qboLine({
          transactionId: "journal-3",
          lineId: "1",
          kind: "job",
          qboCustomerId: "customer-a",
          qboProjectId: "project-a",
          qboProjectParentCustomerId: "customer-b",
        }),
      ],
    });
    expect(result.blockers).toEqual([
      "QBO line journal-3:1 has no proved Customer/Project relationship.",
    ]);
  });

  it("rejects conflicting duplicate QBO evidence", () => {
    expect(() =>
      reconcileQboLabourCost({
        exports: [
          proofItem(1, jobAllocation(1, "customer-a", "project-a"), "eh-job-a"),
        ],
        costLines: [
          qboLine({
            transactionId: "journal-4",
            lineId: "1",
            kind: "job",
            amount: 120,
            qboCustomerId: "customer-a",
            qboProjectId: "project-a",
            qboProjectParentCustomerId: "customer-a",
          }),
          qboLine({
            transactionId: "journal-4",
            lineId: "1",
            kind: "job",
            amount: 121,
            qboCustomerId: "customer-a",
            qboProjectId: "project-a",
            qboProjectParentCustomerId: "customer-a",
          }),
        ],
      }),
    ).toThrow("Conflicting QBO duplicate");
  });
});

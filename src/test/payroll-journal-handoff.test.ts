import { describe, expect, it } from "vitest";
import type { PayrollTimesheetSubmission } from "@/lib/core/payrollBoundary";
import {
  buildPayrollProofItem,
  type PayrollAllocation,
  type PayrollProofItem,
} from "@/lib/core/payrollJobCostProof";
import {
  buildQboPayrollJournalInstruction,
  type EmploymentHeroFinalisedJournalLine,
} from "@/lib/core/payrollJournalHandoff";

const tenantId = "94000000-0000-4000-8000-000000000001";

function submission(index: number): PayrollTimesheetSubmission {
  return {
    sourceTimeEntryId: `94100000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    employeeExternalId: `employee-${index}`,
    workDate: "2026-08-23",
    units: 2,
    unitType: "hours",
    startedAt: "2026-08-23T08:00:00+10:00",
    endedAt: "2026-08-23T10:00:00+10:00",
    breakMinutes: 0,
  };
}

function jobAllocation(index: number, customer: string, project: string): PayrollAllocation {
  return {
    kind: "job",
    internalId: `94200000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    customerProject: {
      internalCustomerId: `94300000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      qboCustomerId: customer,
      qboProjectId: project,
      qboProjectParentCustomerId: customer,
      mappingProven: true,
    },
  };
}

function proof(
  index: number,
  allocation: PayrollAllocation,
  externalAllocation: string,
): PayrollProofItem {
  return buildPayrollProofItem({
    tenantId,
    submission: submission(index),
    allocation,
    evidence: {
      employeeExternalId: `employee-${index}`,
      workTypeExternalId: "ordinary-hours",
      payrollAllocationExternalId: externalAllocation,
      workerMappingProven: true,
      workTypeMappingProven: true,
      payrollAllocationMappingProven: true,
      requestCorrelationProven: true,
    },
  });
}

function journalLine(
  overrides: Partial<EmploymentHeroFinalisedJournalLine> &
    Pick<EmploymentHeroFinalisedJournalLine, "sourceLineId" | "role" | "postingType" | "amount">,
): EmploymentHeroFinalisedJournalLine {
  return {
    accountExternalId: "qbo-account-wages",
    description: "Payroll journal proof",
    payrollAllocationExternalId: null,
    ...overrides,
  };
}

function buildInput() {
  const exports = [
    proof(1, jobAllocation(1, "customer-a", "project-a"), "allocation-job-a"),
    proof(2, jobAllocation(2, "customer-b", "project-b"), "allocation-job-b"),
    proof(
      3,
      {
        kind: "overhead",
        internalId: "94200000-0000-4000-8000-000000000003",
      },
      "allocation-overhead",
    ),
  ];
  const journalLines: EmploymentHeroFinalisedJournalLine[] = [
    journalLine({
      sourceLineId: "eh-line-1",
      role: "direct_labour",
      postingType: "Debit",
      amount: 120.25,
      payrollAllocationExternalId: "allocation-job-a",
    }),
    journalLine({
      sourceLineId: "eh-line-2",
      role: "direct_labour",
      postingType: "Debit",
      amount: 89.75,
      payrollAllocationExternalId: "allocation-job-b",
    }),
    journalLine({
      sourceLineId: "eh-line-3",
      role: "overhead",
      postingType: "Debit",
      amount: 40,
      payrollAllocationExternalId: "allocation-overhead",
    }),
    journalLine({
      sourceLineId: "eh-line-4",
      role: "payroll_clearing",
      postingType: "Credit",
      amount: 250,
      accountExternalId: "qbo-account-payroll-clearing",
    }),
  ];
  return { exports, journalLines };
}

describe("BOS-E03 governed Employment Hero journal handoff", () => {
  it("converts authoritative direct-labour lines to QBO Project entities", () => {
    const result = buildQboPayrollJournalInstruction({
      tenantId,
      employmentHeroPayRunId: "eh-pay-run-1",
      employmentHeroJournalId: "eh-journal-1",
      finalisedAt: "2026-08-23T08:00:00+10:00",
      nativeEmploymentHeroQboExportDisabled: true,
      ...buildInput(),
    });

    expect(result.lines.map((line) => line.entity?.entityRefValue ?? null)).toEqual([
      "project-a",
      "project-b",
      null,
      null,
    ]);
    expect(result.idempotencyKey).toBe(
      `employment-hero-payroll-journal:${tenantId}:eh-pay-run-1:eh-journal-1`,
    );
  });

  it("blocks duplicate accounting when native QBO export remains enabled", () => {
    expect(() =>
      buildQboPayrollJournalInstruction({
        tenantId,
        employmentHeroPayRunId: "eh-pay-run-1",
        employmentHeroJournalId: "eh-journal-1",
        finalisedAt: "2026-08-23T08:00:00+10:00",
        nativeEmploymentHeroQboExportDisabled: false,
        ...buildInput(),
      }),
    ).toThrow("Native Employment Hero QBO export must be disabled");
  });

  it("rejects an unbalanced finalised payroll journal", () => {
    const input = buildInput();
    input.journalLines[3].amount = 249;
    expect(() =>
      buildQboPayrollJournalInstruction({
        tenantId,
        employmentHeroPayRunId: "eh-pay-run-1",
        employmentHeroJournalId: "eh-journal-1",
        finalisedAt: "2026-08-23T08:00:00+10:00",
        nativeEmploymentHeroQboExportDisabled: true,
        ...input,
      }),
    ).toThrow("journal is not balanced");
  });

  it("rejects direct labour without an exact Employment Hero allocation", () => {
    const input = buildInput();
    input.journalLines[0].payrollAllocationExternalId = "unknown-job";
    expect(() =>
      buildQboPayrollJournalInstruction({
        tenantId,
        employmentHeroPayRunId: "eh-pay-run-1",
        employmentHeroJournalId: "eh-journal-1",
        finalisedAt: "2026-08-23T08:00:00+10:00",
        nativeEmploymentHeroQboExportDisabled: true,
        ...input,
      }),
    ).toThrow("Unmapped Employment Hero allocation");
  });
});

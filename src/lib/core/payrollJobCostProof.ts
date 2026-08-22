import { z } from "zod";
import type { PayrollTimesheetSubmission } from "@/lib/core/payrollBoundary";

const uuid = z.string().uuid();

export const PAYROLL_ALLOCATION_KINDS = [
  "job",
  "approved_pool",
  "overhead",
] as const;

export type PayrollAllocationKind = (typeof PAYROLL_ALLOCATION_KINDS)[number];

export interface QboCustomerProjectMapping {
  internalCustomerId: string;
  qboCustomerId: string;
  qboProjectId: string;
  qboProjectParentCustomerId: string;
  mappingProven: boolean;
}

export type PayrollAllocation =
  | {
      kind: "job";
      internalId: string;
      customerProject: QboCustomerProjectMapping;
    }
  | {
      kind: "approved_pool" | "overhead";
      internalId: string;
    };

export interface PayrollMappingEvidence {
  employeeExternalId: string | null;
  workTypeExternalId: string | null;
  payrollCostCentreExternalId: string | null;
  workerMappingProven: boolean;
  workTypeMappingProven: boolean;
  payrollCostCentreMappingProven: boolean;
  requestCorrelationProven: boolean;
}

export interface PayrollProofItem extends PayrollTimesheetSubmission {
  tenantId: string;
  idempotencyKey: string;
  workTypeExternalId: string;
  allocation: PayrollAllocation;
  payrollCostCentreExternalId: string;
}

export interface PayrollProofBlocker {
  code:
    | "worker_mapping_unproved"
    | "work_type_mapping_unproved"
    | "payroll_cost_centre_mapping_unproved"
    | "qbo_customer_project_mapping_unproved"
    | "request_correlation_unproved";
  message: string;
}

export function payrollExportBlockers(
  evidence: PayrollMappingEvidence,
  allocation?: PayrollAllocation,
): PayrollProofBlocker[] {
  const blockers: PayrollProofBlocker[] = [];
  if (!evidence.workerMappingProven || !evidence.employeeExternalId) {
    blockers.push({
      code: "worker_mapping_unproved",
      message: "Employment Hero Worker mapping is not proved.",
    });
  }
  if (!evidence.workTypeMappingProven || !evidence.workTypeExternalId) {
    blockers.push({
      code: "work_type_mapping_unproved",
      message: "Employment Hero work-type mapping is not proved.",
    });
  }
  if (
    !evidence.payrollCostCentreMappingProven ||
    !evidence.payrollCostCentreExternalId
  ) {
    blockers.push({
      code: "payroll_cost_centre_mapping_unproved",
      message: "The Employment Hero Cost Centre mapping is not proved.",
    });
  }
  if (allocation?.kind === "job" && !validCustomerProjectMapping(allocation)) {
    blockers.push({
      code: "qbo_customer_project_mapping_unproved",
      message:
        "Direct Job labour requires a proved QBO Project under the expected QBO Customer.",
    });
  }
  if (!evidence.requestCorrelationProven) {
    blockers.push({
      code: "request_correlation_unproved",
      message:
        "Provider response correlation is not proved; automatic retry could duplicate time.",
    });
  }
  return blockers;
}

export function buildPayrollProofItem(input: {
  tenantId: string;
  submission: PayrollTimesheetSubmission;
  allocation: PayrollAllocation;
  evidence: PayrollMappingEvidence;
}): PayrollProofItem {
  uuid.parse(input.tenantId);
  uuid.parse(input.submission.sourceTimeEntryId);
  uuid.parse(input.allocation.internalId);
  if (input.allocation.kind === "job") {
    uuid.parse(input.allocation.customerProject.internalCustomerId);
  }
  const blockers = payrollExportBlockers(input.evidence, input.allocation);
  if (blockers.length > 0) {
    throw new Error(blockers.map((blocker) => blocker.message).join(" "));
  }

  return {
    ...input.submission,
    tenantId: input.tenantId,
    employeeExternalId: input.evidence.employeeExternalId!,
    workTypeExternalId: input.evidence.workTypeExternalId!,
    allocation: input.allocation,
    payrollCostCentreExternalId: input.evidence.payrollCostCentreExternalId!,
    idempotencyKey: `employment-hero:${input.tenantId}:${input.submission.sourceTimeEntryId}`,
  };
}

function validCustomerProjectMapping(
  allocation: Extract<PayrollAllocation, { kind: "job" }>,
) {
  const mapping = allocation.customerProject;
  return (
    mapping.mappingProven &&
    Boolean(mapping.qboCustomerId.trim()) &&
    Boolean(mapping.qboProjectId.trim()) &&
    Boolean(mapping.qboProjectParentCustomerId.trim()) &&
    mapping.qboProjectParentCustomerId === mapping.qboCustomerId
  );
}

export function partitionEmploymentHeroTimesheets<T>(
  items: T[],
  configuredMaximum: number,
): T[][] {
  if (!Number.isInteger(configuredMaximum) || configuredMaximum < 1) {
    throw new Error("The configured Employment Hero batch maximum must be a positive integer.");
  }
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += configuredMaximum) {
    batches.push(items.slice(index, index + configuredMaximum));
  }
  return batches;
}

export type PayrollSubmissionState =
  | { status: "prepared"; externalTimesheetId: null; message: null }
  | { status: "accepted"; externalTimesheetId: string; message: null }
  | { status: "rejected"; externalTimesheetId: null; message: string }
  | { status: "unknown"; externalTimesheetId: null; message: string };

export function resolvePayrollSubmissionState(input: {
  previous: PayrollSubmissionState;
  outcome:
    | { type: "accepted"; externalTimesheetId: string }
    | { type: "rejected"; message: string }
    | { type: "timeout"; message: string };
}): PayrollSubmissionState {
  if (input.previous.status === "accepted") {
    if (
      input.outcome.type === "accepted" &&
      input.outcome.externalTimesheetId === input.previous.externalTimesheetId
    ) {
      return input.previous;
    }
    throw new Error("Accepted payroll time cannot be rebound or downgraded.");
  }
  if (input.outcome.type === "accepted") {
    if (!input.outcome.externalTimesheetId.trim()) {
      throw new Error("Accepted payroll time requires a permanent external ID.");
    }
    return {
      status: "accepted",
      externalTimesheetId: input.outcome.externalTimesheetId,
      message: null,
    };
  }
  if (input.outcome.type === "rejected") {
    return {
      status: "rejected",
      externalTimesheetId: null,
      message: input.outcome.message,
    };
  }
  return {
    status: "unknown",
    externalTimesheetId: null,
    message: input.outcome.message,
  };
}

export function automaticPayrollRetryAllowed(state: PayrollSubmissionState) {
  return state.status === "prepared" || state.status === "rejected";
}

export interface QboLabourCostLine {
  transactionId: string;
  lineId: string;
  amount: number;
  kind: PayrollAllocationKind;
  qboCustomerId: string | null;
  qboProjectId: string | null;
  qboProjectParentCustomerId: string | null;
  governedNonJobAllocationExternalId: string | null;
  mappingStatus: "proven" | "unproved" | "unmapped";
  qboClassId?: string | null;
  qboLocationId?: string | null;
}

export interface PayrollCostReconciliation {
  matched: Map<string, number>;
  blockers: string[];
  duplicateLinesIgnored: number;
}

export function reconcileQboLabourCost(input: {
  exports: PayrollProofItem[];
  costLines: QboLabourCostLine[];
}): PayrollCostReconciliation {
  const jobToAllocation = new Map<string, string>();
  const nonJobToAllocation = new Map<string, string>();

  for (const item of input.exports) {
    const allocationKey = `${item.allocation.kind}:${item.allocation.internalId}`;
    if (item.allocation.kind === "job") {
      const mapping = item.allocation.customerProject;
      jobToAllocation.set(
        `${mapping.qboCustomerId}:${mapping.qboProjectId}`,
        allocationKey,
      );
    } else {
      nonJobToAllocation.set(
        `${item.allocation.kind}:${item.payrollCostCentreExternalId}`,
        allocationKey,
      );
    }
  }

  const seen = new Map<string, QboLabourCostLine>();
  const matched = new Map<string, number>();
  const blockers: string[] = [];
  let duplicateLinesIgnored = 0;

  for (const line of input.costLines) {
    if (!line.transactionId.trim() || !line.lineId.trim() || !Number.isFinite(line.amount)) {
      throw new Error("QBO labour-cost evidence requires transaction, line and amount identity.");
    }
    const evidenceKey = `${line.transactionId}:${line.lineId}`;
    const prior = seen.get(evidenceKey);
    if (prior) {
      if (JSON.stringify(prior) !== JSON.stringify(line)) {
        throw new Error(`Conflicting QBO duplicate: ${evidenceKey}`);
      }
      duplicateLinesIgnored += 1;
      continue;
    }
    seen.set(evidenceKey, line);

    if (line.mappingStatus !== "proven") {
      blockers.push(`QBO line ${evidenceKey} has no proved labour-cost mapping.`);
      continue;
    }

    let allocationKey: string | undefined;
    if (line.kind === "job") {
      if (
        !line.qboCustomerId ||
        !line.qboProjectId ||
        !line.qboProjectParentCustomerId ||
        line.qboProjectParentCustomerId !== line.qboCustomerId
      ) {
        blockers.push(
          `QBO line ${evidenceKey} has no proved Customer/Project relationship.`,
        );
        continue;
      }
      allocationKey = jobToAllocation.get(
        `${line.qboCustomerId}:${line.qboProjectId}`,
      );
      if (!allocationKey) {
        blockers.push(`QBO line ${evidenceKey} has an unmapped Customer/Project.`);
        continue;
      }
    } else {
      if (!line.governedNonJobAllocationExternalId) {
        blockers.push(
          `QBO line ${evidenceKey} has no governed non-Job allocation reference.`,
        );
        continue;
      }
      allocationKey = nonJobToAllocation.get(
        `${line.kind}:${line.governedNonJobAllocationExternalId}`,
      );
      if (!allocationKey) {
        blockers.push(`QBO line ${evidenceKey} has an unmapped non-Job allocation.`);
        continue;
      }
    }

    matched.set(allocationKey, (matched.get(allocationKey) ?? 0) + line.amount);
  }

  return { matched, blockers, duplicateLinesIgnored };
}

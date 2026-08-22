import { z } from "zod";
import type { PayrollProofItem } from "@/lib/core/payrollJobCostProof";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });

export type EmploymentHeroJournalLineRole =
  | "direct_labour"
  | "approved_pool"
  | "overhead"
  | "payroll_clearing"
  | "payroll_liability";

export interface EmploymentHeroFinalisedJournalLine {
  sourceLineId: string;
  accountExternalId: string;
  description: string;
  postingType: "Debit" | "Credit";
  amount: number;
  role: EmploymentHeroJournalLineRole;
  payrollAllocationExternalId: string | null;
}

export interface QboPayrollJournalInstructionLine {
  sourceLineId: string;
  accountExternalId: string;
  description: string;
  postingType: "Debit" | "Credit";
  amount: number;
  entity:
    | {
        type: "Customer";
        entityRefValue: string;
        qboCustomerId: string;
        qboProjectId: string;
        qboProjectParentCustomerId: string;
      }
    | null;
}

export interface QboPayrollJournalInstruction {
  tenantId: string;
  employmentHeroPayRunId: string;
  employmentHeroJournalId: string;
  finalisedAt: string;
  idempotencyKey: string;
  lines: QboPayrollJournalInstructionLine[];
}

export function buildQboPayrollJournalInstruction(input: {
  tenantId: string;
  employmentHeroPayRunId: string;
  employmentHeroJournalId: string;
  finalisedAt: string;
  nativeEmploymentHeroQboExportDisabled: boolean;
  exports: PayrollProofItem[];
  journalLines: EmploymentHeroFinalisedJournalLine[];
}): QboPayrollJournalInstruction {
  uuid.parse(input.tenantId);
  timestamp.parse(input.finalisedAt);
  requireText(input.employmentHeroPayRunId, "Employment Hero Pay Run ID");
  requireText(input.employmentHeroJournalId, "Employment Hero journal ID");
  if (!input.nativeEmploymentHeroQboExportDisabled) {
    throw new Error(
      "Native Employment Hero QBO export must be disabled before BuildOS creates the governed QBO journal instruction.",
    );
  }
  if (input.journalLines.length === 0) {
    throw new Error("A finalised Employment Hero journal requires at least one line.");
  }

  const allocationByExternalId = buildAllocationIndex(input.exports, input.tenantId);
  const sourceLineIds = new Set<string>();
  let debitCents = 0;
  let creditCents = 0;

  const lines = input.journalLines.map((line) => {
    requireText(line.sourceLineId, "Employment Hero journal line ID");
    requireText(line.accountExternalId, "QBO account mapping");
    if (sourceLineIds.has(line.sourceLineId)) {
      throw new Error(`Duplicate Employment Hero journal line: ${line.sourceLineId}`);
    }
    sourceLineIds.add(line.sourceLineId);

    const amountCents = toPositiveCents(line.amount);
    if (line.postingType === "Debit") debitCents += amountCents;
    else creditCents += amountCents;

    const entity = resolveLineEntity(line, allocationByExternalId);
    return {
      sourceLineId: line.sourceLineId,
      accountExternalId: line.accountExternalId,
      description: line.description,
      postingType: line.postingType,
      amount: amountCents / 100,
      entity,
    } satisfies QboPayrollJournalInstructionLine;
  });

  if (debitCents !== creditCents) {
    throw new Error(
      `Employment Hero journal is not balanced: debits ${debitCents} cents; credits ${creditCents} cents.`,
    );
  }

  return {
    tenantId: input.tenantId,
    employmentHeroPayRunId: input.employmentHeroPayRunId,
    employmentHeroJournalId: input.employmentHeroJournalId,
    finalisedAt: input.finalisedAt,
    idempotencyKey: [
      "employment-hero-payroll-journal",
      input.tenantId,
      input.employmentHeroPayRunId,
      input.employmentHeroJournalId,
    ].join(":"),
    lines,
  };
}

function buildAllocationIndex(exports: PayrollProofItem[], tenantId: string) {
  const index = new Map<string, PayrollProofItem>();
  for (const item of exports) {
    if (item.tenantId !== tenantId) {
      throw new Error("Payroll journal allocation evidence crossed a Tenant boundary.");
    }
    const prior = index.get(item.payrollAllocationExternalId);
    if (
      prior &&
      `${prior.allocation.kind}:${prior.allocation.internalId}` !==
        `${item.allocation.kind}:${item.allocation.internalId}`
    ) {
      throw new Error(
        `Employment Hero allocation is bound to more than one BuildOS record: ${item.payrollAllocationExternalId}`,
      );
    }
    index.set(item.payrollAllocationExternalId, item);
  }
  return index;
}

function resolveLineEntity(
  line: EmploymentHeroFinalisedJournalLine,
  allocationByExternalId: Map<string, PayrollProofItem>,
): QboPayrollJournalInstructionLine["entity"] {
  if (line.role === "payroll_clearing" || line.role === "payroll_liability") {
    if (line.payrollAllocationExternalId) {
      throw new Error(`${line.role} must not carry a Job allocation.`);
    }
    return null;
  }

  if (!line.payrollAllocationExternalId) {
    throw new Error(`${line.role} requires an Employment Hero allocation reference.`);
  }
  const proof = allocationByExternalId.get(line.payrollAllocationExternalId);
  if (!proof) {
    throw new Error(
      `Unmapped Employment Hero allocation: ${line.payrollAllocationExternalId}`,
    );
  }

  if (line.role === "direct_labour") {
    if (line.postingType !== "Debit" || proof.allocation.kind !== "job") {
      throw new Error("Direct labour must be a debit bound to a BuildOS Job.");
    }
    const mapping = proof.allocation.customerProject;
    if (
      !mapping.mappingProven ||
      mapping.qboProjectParentCustomerId !== mapping.qboCustomerId
    ) {
      throw new Error("Direct labour has no proved QBO Customer/Project relationship.");
    }
    return {
      type: "Customer",
      entityRefValue: mapping.qboProjectId,
      qboCustomerId: mapping.qboCustomerId,
      qboProjectId: mapping.qboProjectId,
      qboProjectParentCustomerId: mapping.qboProjectParentCustomerId,
    };
  }

  if (proof.allocation.kind !== line.role) {
    throw new Error(
      `Employment Hero allocation kind does not match journal role: ${line.payrollAllocationExternalId}`,
    );
  }
  if (line.postingType !== "Debit") {
    throw new Error(`${line.role} labour must be a debit.`);
  }
  return null;
}

function toPositiveCents(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Employment Hero journal line amount must be positive and finite.");
  }
  const cents = Math.round(amount * 100);
  if (Math.abs(amount * 100 - cents) > 0.000001) {
    throw new Error("Employment Hero journal line amount must use two decimal places.");
  }
  return cents;
}

function requireText(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} is required.`);
}

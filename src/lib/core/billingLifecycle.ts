export type BillingMode = "routine" | "progress" | "final";
export type BillableSourceType = "approved_work" | "extra_charge" | "variation";

export interface BillableSource {
  id: string;
  jobId: string;
  occurredAt: string;
  sourceType: BillableSourceType;
  description: string;
  quantity: number;
  unitAmount: number;
  approved: boolean;
  recurring: boolean;
  standingAuthorityId: string | null;
}

export interface CommercialException {
  id: string;
  jobId: string;
  type: "unresolved_labour" | "unresolved_material" | "unapproved_variation" | "cost_lag" | "credit" | "deposit";
  description: string;
  resolved: boolean;
}

export interface BillingProposalLine {
  sourceId: string;
  sourceType: BillableSourceType;
  description: string;
  quantity: number;
  unitAmount: number;
  amount: number;
}

export interface BillingProposal {
  id: string;
  tenantId: string;
  accountId: string;
  jobId: string;
  mode: BillingMode;
  cutoffAt: string;
  lines: BillingProposalLine[];
  unresolvedExceptions: CommercialException[];
  status: "proposed";
}

export interface AuthorisedBillingInstruction {
  id: string;
  proposalId: string;
  tenantId: string;
  accountId: string;
  jobId: string;
  authorisedBy: string;
  authorisedAt: string;
  status: "authorised";
}

export interface BuildOsInvoice {
  id: string;
  instructionId: string;
  proposalId: string;
  tenantId: string;
  accountId: string;
  jobId: string;
  invoiceNumber: string;
  currencyCode: string;
  lines: BillingProposalLine[];
  total: number;
  issuedAt: string;
  delivery: {
    status: "pending" | "delivered" | "failed";
    destination: string;
  };
}

export interface QboInvoiceCommand {
  transactionType: "Invoice";
  buildOsInvoiceId: string;
  idempotencyKey: string;
  accountId: string;
  jobId: string;
  currencyCode: string;
  lines: BillingProposalLine[];
  total: number;
}

export interface QboInvoiceMirror {
  buildOsInvoiceId: string;
  qboInvoiceId: string;
  qboSyncToken: string;
  mirroredAt: string;
}

export interface InvoiceAdjustment {
  id: string;
  originalBuildOsInvoiceId: string;
  type: "credit" | "void" | "supplementary_invoice";
  reason: string;
}

export interface ReceivableProjection {
  buildOsInvoiceId: string;
  qboInvoiceId: string;
  balance: number;
  paymentStatus: "unpaid" | "part_paid" | "paid" | "void";
  source: "qbo";
  observedAt: string;
}

function requireIdentity(label: string, value: string) {
  if (!value.trim()) throw new Error(`${label} is required.`);
}

function parseInstant(label: string, value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp.`);
  return parsed;
}

export function buildBillingProposal(input: {
  id: string;
  tenantId: string;
  accountId: string;
  jobId: string;
  mode: BillingMode;
  cutoffAt: string;
  sources: BillableSource[];
  exceptions: CommercialException[];
}): BillingProposal {
  requireIdentity("Proposal identity", input.id);
  requireIdentity("Tenant identity", input.tenantId);
  requireIdentity("Account identity", input.accountId);
  requireIdentity("Job identity", input.jobId);
  const cutoff = parseInstant("Billing cut-off", input.cutoffAt);
  const seen = new Set<string>();

  const lines = input.sources.flatMap((source): BillingProposalLine[] => {
    if (source.jobId !== input.jobId || !source.approved || parseInstant("Billable source time", source.occurredAt) > cutoff) {
      return [];
    }
    if (seen.has(source.id)) throw new Error(`Duplicate billable source: ${source.id}`);
    seen.add(source.id);
    if (source.recurring && !source.standingAuthorityId) {
      throw new Error(`Recurring source ${source.id} lacks explicit standing authority.`);
    }
    if (!(source.quantity > 0) || !Number.isFinite(source.unitAmount)) {
      throw new Error(`Billable source ${source.id} has invalid quantity or price.`);
    }
    return [{
      sourceId: source.id,
      sourceType: source.sourceType,
      description: source.description,
      quantity: source.quantity,
      unitAmount: source.unitAmount,
      amount: source.quantity * source.unitAmount,
    }];
  });

  const unresolvedExceptions = input.exceptions.filter(
    (exception) => exception.jobId === input.jobId && !exception.resolved,
  );
  if (input.mode !== "final" && unresolvedExceptions.some((exception) => exception.type === "credit" || exception.type === "deposit")) {
    throw new Error("Credits and deposits must be exposed through a final Billing Proposal.");
  }

  return {
    id: input.id,
    tenantId: input.tenantId,
    accountId: input.accountId,
    jobId: input.jobId,
    mode: input.mode,
    cutoffAt: input.cutoffAt,
    lines,
    unresolvedExceptions,
    status: "proposed",
  };
}

export function authoriseBillingProposal(input: {
  instructionId: string;
  proposal: BillingProposal;
  authorisedBy: string;
  authorisedAt: string;
  acceptedExceptionIds?: string[];
}): AuthorisedBillingInstruction {
  requireIdentity("Billing instruction identity", input.instructionId);
  requireIdentity("Authorising actor", input.authorisedBy);
  parseInstant("Authorisation time", input.authorisedAt);
  if (input.proposal.lines.length === 0) throw new Error("An empty Billing Proposal cannot be authorised.");

  if (input.proposal.mode === "final") {
    const accepted = new Set(input.acceptedExceptionIds ?? []);
    const unacknowledged = input.proposal.unresolvedExceptions.filter((exception) => !accepted.has(exception.id));
    if (unacknowledged.length > 0) {
      throw new Error(`Final billing exceptions require explicit acknowledgement: ${unacknowledged.map((item) => item.id).join(", ")}`);
    }
  }

  return {
    id: input.instructionId,
    proposalId: input.proposal.id,
    tenantId: input.proposal.tenantId,
    accountId: input.proposal.accountId,
    jobId: input.proposal.jobId,
    authorisedBy: input.authorisedBy,
    authorisedAt: input.authorisedAt,
    status: "authorised",
  };
}

export function issueBuildOsInvoice(input: {
  id: string;
  invoiceNumber: string;
  instruction: AuthorisedBillingInstruction;
  proposal: BillingProposal;
  currencyCode: string;
  issuedAt: string;
  destination: string;
}): BuildOsInvoice {
  requireIdentity("BuildOS Invoice identity", input.id);
  requireIdentity("Invoice number", input.invoiceNumber);
  requireIdentity("Delivery destination", input.destination);
  parseInstant("Invoice issue time", input.issuedAt);
  if (!/^[A-Z]{3}$/.test(input.currencyCode)) throw new Error("Invoice currency must be a three-letter code.");
  if (input.instruction.proposalId !== input.proposal.id) throw new Error("Billing Instruction does not authorise this proposal.");
  if (input.instruction.tenantId !== input.proposal.tenantId || input.instruction.jobId !== input.proposal.jobId) {
    throw new Error("Billing Instruction lineage does not match the proposal.");
  }

  return {
    id: input.id,
    instructionId: input.instruction.id,
    proposalId: input.proposal.id,
    tenantId: input.proposal.tenantId,
    accountId: input.proposal.accountId,
    jobId: input.proposal.jobId,
    invoiceNumber: input.invoiceNumber,
    currencyCode: input.currencyCode,
    lines: input.proposal.lines,
    total: input.proposal.lines.reduce((sum, line) => sum + line.amount, 0),
    issuedAt: input.issuedAt,
    delivery: { status: "pending", destination: input.destination },
  };
}

export function createQboInvoiceCommand(invoice: BuildOsInvoice): QboInvoiceCommand {
  return {
    transactionType: "Invoice",
    buildOsInvoiceId: invoice.id,
    idempotencyKey: `buildos-invoice:${invoice.id}`,
    accountId: invoice.accountId,
    jobId: invoice.jobId,
    currencyCode: invoice.currencyCode,
    lines: invoice.lines,
    total: invoice.total,
  };
}

export function recordQboInvoiceMirror(
  existing: QboInvoiceMirror | null,
  result: QboInvoiceMirror,
): QboInvoiceMirror {
  if (existing === null) return result;
  if (existing.buildOsInvoiceId !== result.buildOsInvoiceId || existing.qboInvoiceId !== result.qboInvoiceId) {
    throw new Error("A BuildOS Invoice cannot be remapped to a different QBO Invoice.");
  }
  return existing.qboSyncToken === result.qboSyncToken ? existing : result;
}

export function linkInvoiceAdjustment(input: InvoiceAdjustment): InvoiceAdjustment {
  requireIdentity("Adjustment identity", input.id);
  requireIdentity("Original BuildOS Invoice identity", input.originalBuildOsInvoiceId);
  requireIdentity("Adjustment reason", input.reason);
  return { ...input };
}

export function projectQboReceivable(input: ReceivableProjection): ReceivableProjection {
  if (input.source !== "qbo") throw new Error("Receivable state must be projected from QBO.");
  if (!Number.isFinite(input.balance) || input.balance < 0) throw new Error("QBO balance must be a non-negative amount.");
  parseInstant("Receivable observation time", input.observedAt);
  return { ...input };
}

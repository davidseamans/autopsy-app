import { describe, expect, it } from "vitest";
import {
  authoriseBillingProposal,
  buildBillingProposal,
  createQboInvoiceCommand,
  issueBuildOsInvoice,
  linkInvoiceAdjustment,
  projectQboReceivable,
  recordQboInvoiceMirror,
  type BillableSource,
} from "../lib/core/billingLifecycle";

const sources: BillableSource[] = [
  {
    id: "work-1",
    jobId: "job-1",
    occurredAt: "2026-08-20T08:00:00Z",
    sourceType: "approved_work",
    description: "Progress clean",
    quantity: 2,
    unitAmount: 100,
    approved: true,
    recurring: false,
    standingAuthorityId: null,
  },
  {
    id: "extra-1",
    jobId: "job-1",
    occurredAt: "2026-08-20T09:00:00Z",
    sourceType: "extra_charge",
    description: "Five toilet rolls",
    quantity: 5,
    unitAmount: 3,
    approved: true,
    recurring: false,
    standingAuthorityId: null,
  },
  {
    id: "variation-1",
    jobId: "job-1",
    occurredAt: "2026-08-21T09:00:00Z",
    sourceType: "variation",
    description: "Additional area",
    quantity: 1,
    unitAmount: 80,
    approved: true,
    recurring: false,
    standingAuthorityId: null,
  },
];

function proposal(mode: "routine" | "progress" | "final" = "progress") {
  return buildBillingProposal({
    id: "proposal-1",
    tenantId: "tenant-1",
    accountId: "account-1",
    jobId: "job-1",
    mode,
    cutoffAt: "2026-08-20T23:59:59Z",
    sources,
    exceptions: [],
  });
}

describe("BOS-E05 billing lifecycle", () => {
  it("collects approved work and Extras only through the cut-off", () => {
    const result = proposal();
    expect(result.lines.map((line) => line.sourceId)).toEqual(["work-1", "extra-1"]);
    expect(result.lines.reduce((sum, line) => sum + line.amount, 0)).toBe(215);
  });

  it("excludes unapproved and other-Job sources", () => {
    const result = buildBillingProposal({
      ...proposal(),
      id: "proposal-2",
      sources: [
        { ...sources[0], id: "unapproved", approved: false },
        { ...sources[0], id: "other-job", jobId: "job-2" },
      ],
      exceptions: [],
    });
    expect(result.lines).toEqual([]);
  });

  it("rejects duplicate source identity", () => {
    expect(() => buildBillingProposal({
      ...proposal(),
      sources: [sources[0], sources[0]],
      exceptions: [],
    })).toThrow("Duplicate billable source");
  });

  it("requires explicit standing authority for recurring billing", () => {
    expect(() => buildBillingProposal({
      ...proposal(),
      sources: [{ ...sources[0], recurring: true }],
      exceptions: [],
    })).toThrow("lacks explicit standing authority");
  });

  it("accepts recurring billing inside standing authority", () => {
    const result = buildBillingProposal({
      ...proposal(),
      sources: [{ ...sources[0], recurring: true, standingAuthorityId: "authority-1" }],
      exceptions: [],
    });
    expect(result.lines).toHaveLength(1);
  });

  it("exposes unresolved final billing exceptions", () => {
    const result = buildBillingProposal({
      ...proposal("final"),
      sources,
      exceptions: [{ id: "lag-1", jobId: "job-1", type: "cost_lag", description: "Supplier invoice outstanding", resolved: false }],
    });
    expect(result.unresolvedExceptions.map((item) => item.id)).toEqual(["lag-1"]);
  });

  it("requires final exceptions to be acknowledged before authority", () => {
    const finalProposal = buildBillingProposal({
      ...proposal("final"),
      sources,
      exceptions: [{ id: "lag-1", jobId: "job-1", type: "cost_lag", description: "Supplier invoice outstanding", resolved: false }],
    });
    expect(() => authoriseBillingProposal({
      instructionId: "instruction-1",
      proposal: finalProposal,
      authorisedBy: "owner-1",
      authorisedAt: "2026-08-21T01:00:00Z",
    })).toThrow("explicit acknowledgement");
  });

  it("creates one governed BuildOS Invoice from one authorised instruction", () => {
    const billingProposal = proposal();
    const instruction = authoriseBillingProposal({
      instructionId: "instruction-1",
      proposal: billingProposal,
      authorisedBy: "owner-1",
      authorisedAt: "2026-08-21T01:00:00Z",
    });
    const invoice = issueBuildOsInvoice({
      id: "invoice-1",
      invoiceNumber: "INV-0001",
      instruction,
      proposal: billingProposal,
      currencyCode: "AUD",
      issuedAt: "2026-08-21T02:00:00Z",
      destination: "accounts@example.com",
    });
    expect(invoice.total).toBe(215);
    expect(invoice.delivery.status).toBe("pending");
  });

  it("rejects an instruction for another proposal", () => {
    const billingProposal = proposal();
    const instruction = authoriseBillingProposal({
      instructionId: "instruction-1",
      proposal: billingProposal,
      authorisedBy: "owner-1",
      authorisedAt: "2026-08-21T01:00:00Z",
    });
    expect(() => issueBuildOsInvoice({
      id: "invoice-1",
      invoiceNumber: "INV-0001",
      instruction,
      proposal: { ...billingProposal, id: "proposal-2" },
      currencyCode: "AUD",
      issuedAt: "2026-08-21T02:00:00Z",
      destination: "accounts@example.com",
    })).toThrow("does not authorise");
  });

  it("commands a QBO Invoice transaction rather than a journal", () => {
    const billingProposal = proposal();
    const instruction = authoriseBillingProposal({
      instructionId: "instruction-1",
      proposal: billingProposal,
      authorisedBy: "owner-1",
      authorisedAt: "2026-08-21T01:00:00Z",
    });
    const invoice = issueBuildOsInvoice({
      id: "invoice-1",
      invoiceNumber: "INV-0001",
      instruction,
      proposal: billingProposal,
      currencyCode: "AUD",
      issuedAt: "2026-08-21T02:00:00Z",
      destination: "accounts@example.com",
    });
    expect(createQboInvoiceCommand(invoice)).toMatchObject({
      transactionType: "Invoice",
      buildOsInvoiceId: "invoice-1",
      idempotencyKey: "buildos-invoice:invoice-1",
    });
  });

  it("recovers the same QBO transaction on retry", () => {
    const mirror = {
      buildOsInvoiceId: "invoice-1",
      qboInvoiceId: "qbo-20",
      qboSyncToken: "0",
      mirroredAt: "2026-08-21T03:00:00Z",
    };
    expect(recordQboInvoiceMirror(mirror, mirror)).toBe(mirror);
  });

  it("rejects duplicate obligation remapping", () => {
    expect(() => recordQboInvoiceMirror(
      { buildOsInvoiceId: "invoice-1", qboInvoiceId: "qbo-20", qboSyncToken: "0", mirroredAt: "2026-08-21T03:00:00Z" },
      { buildOsInvoiceId: "invoice-1", qboInvoiceId: "qbo-21", qboSyncToken: "0", mirroredAt: "2026-08-21T03:01:00Z" },
    )).toThrow("cannot be remapped");
  });

  it("links credits, voids and supplements to the original invoice", () => {
    expect(linkInvoiceAdjustment({
      id: "credit-1",
      originalBuildOsInvoiceId: "invoice-1",
      type: "credit",
      reason: "Approved correction",
    }).originalBuildOsInvoiceId).toBe("invoice-1");
  });

  it("projects balance and payment status from QBO", () => {
    expect(projectQboReceivable({
      buildOsInvoiceId: "invoice-1",
      qboInvoiceId: "qbo-20",
      balance: 115,
      paymentStatus: "part_paid",
      source: "qbo",
      observedAt: "2026-08-22T00:00:00Z",
    })).toMatchObject({ balance: 115, paymentStatus: "part_paid", source: "qbo" });
  });

  it("does not accept a negative local receivable balance", () => {
    expect(() => projectQboReceivable({
      buildOsInvoiceId: "invoice-1",
      qboInvoiceId: "qbo-20",
      balance: -1,
      paymentStatus: "paid",
      source: "qbo",
      observedAt: "2026-08-22T00:00:00Z",
    })).toThrow("non-negative");
  });
});

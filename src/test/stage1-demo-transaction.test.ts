import { describe, expect, it } from "vitest";
import {
  STAGE1_DEMO_CLEAN_TYPES,
  STAGE1_DEMO_ACCEPTED_QUOTE_DOCUMENT,
  STAGE1_DEMO_QUOTE_DOCUMENT,
  STAGE1_DEMO_QUOTES,
} from "@/lib/stage1Demo";
import { calculateGuidedQuoteTotals } from "@/lib/stage1Pricing";
import Stage1DashboardSource from "@/pages/Stage1Dashboard?raw";

describe("Stage 1 demonstration transaction", () => {
  it("carries one calculation unchanged from the quote builder into the issued document", () => {
    const rule = STAGE1_DEMO_CLEAN_TYPES.find((item) => item.code === "initial") ?? null;
    const calculated = calculateGuidedQuoteTotals({
      items: STAGE1_DEMO_QUOTE_DOCUMENT.lines,
      chargeOutRateExGst: 80,
      rule,
    });

    expect(STAGE1_DEMO_QUOTE_DOCUMENT.labourServiceAmountExGst).toBe(calculated.serviceAmount);
    expect(STAGE1_DEMO_QUOTE_DOCUMENT.estimatedConsumablesCost).toBe(calculated.consumablesCost);
    expect(STAGE1_DEMO_QUOTE_DOCUMENT.consumablesSellAmount).toBe(calculated.consumablesSellAmount);
    expect(STAGE1_DEMO_QUOTE_DOCUMENT.subtotalExGst).toBe(calculated.subtotal);
    expect(STAGE1_DEMO_QUOTE_DOCUMENT.gstAmount).toBe(calculated.gst);
    expect(STAGE1_DEMO_QUOTE_DOCUMENT.totalIncGst).toBe(calculated.total);
    expect(STAGE1_DEMO_QUOTES.find((quote) => quote.id === STAGE1_DEMO_QUOTE_DOCUMENT.id)?.totalIncGst).toBe(calculated.total);
  });

  it("preserves the accepted quote, job and generated invoice lineage", () => {
    expect(STAGE1_DEMO_ACCEPTED_QUOTE_DOCUMENT.number).toBe("Q-1001");
    expect(STAGE1_DEMO_ACCEPTED_QUOTE_DOCUMENT.jobNumber).toBe("J-1");
    expect(STAGE1_DEMO_ACCEPTED_QUOTE_DOCUMENT.invoice?.number).toBe("INV-1");
    expect(STAGE1_DEMO_ACCEPTED_QUOTE_DOCUMENT.totalIncGst).toBe(2035);
    expect(STAGE1_DEMO_ACCEPTED_QUOTE_DOCUMENT.subtotalExGst + STAGE1_DEMO_ACCEPTED_QUOTE_DOCUMENT.gstAmount).toBe(2035);
  });

  it("carries the completed sample job through payment without leaving money owing", () => {
    expect(Stage1DashboardSource).toContain('paymentStatus: "Paid"');
    expect(Stage1DashboardSource).toContain('paymentAmount: 2035');
    expect(Stage1DashboardSource).toContain('description: "Payment received in full"');
    expect(Stage1DashboardSource).toContain('sandboxOutstandingAmount: 0');
  });
});

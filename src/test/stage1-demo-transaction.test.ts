import { describe, expect, it } from "vitest";
import {
  STAGE1_DEMO_CLEAN_TYPES,
  STAGE1_DEMO_QUOTE_DOCUMENT,
  STAGE1_DEMO_QUOTES,
} from "@/lib/stage1Demo";
import { calculateGuidedQuoteTotals } from "@/lib/stage1Pricing";

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
});

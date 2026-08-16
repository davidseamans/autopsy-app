import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const checkoutPanel = readFileSync("src/components/autopsy/AutopsyCheckoutPanel.tsx", "utf8");
const stripeServer = readFileSync("api/_lib/stripe-server.ts", "utf8");

describe("authoritative Discover price", () => {
  it("shows A$69 throughout the checkout UI", () => {
    expect(checkoutPanel).toContain("You can choose the $69 Autopsy.");
    expect(checkoutPanel).toContain("Choose Autopsy — $69 AUD");
    expect(checkoutPanel).not.toContain("$49");
  });

  it("creates A$69 orders against the governed Stripe price", () => {
    expect(stripeServer).toContain("AUTOPSY_AMOUNT_MINOR = 6900");
    expect(stripeServer).toContain('AUTOPSY_PRICE_ID = "price_1U5CJtRtVEYVgWvX9jN6dclH"');
    expect(stripeServer).not.toContain("4900");
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const checkoutPanel = readFileSync("src/components/autopsy/AutopsyCheckoutPanel.tsx", "utf8");
const checkoutServer = readFileSync("api/stripe/create-checkout-session.ts", "utf8");
const stripeServer = readFileSync("api/_lib/stripe-server.ts", "utf8");

describe("authoritative Discover price", () => {
  it("shows A$69 throughout the checkout UI", () => {
    expect(checkoutPanel).toContain("You can choose the $69 Autopsy.");
    expect(checkoutPanel).toContain("Choose Autopsy — $69 AUD");
  });

  it("creates only governed A$69 orders", () => {
    expect(stripeServer).toContain("AUTOPSY_AMOUNT_MINOR = 6900");
    expect(stripeServer).toContain('requireStripeEnv("STRIPE_AUTOPSY_PRICE_ID")');
    expect(stripeServer).toContain("assertAutopsyPriceAuthority");
    expect(checkoutServer).toContain("stripe.prices.retrieve(priceId)");
    expect(checkoutServer).toContain("assertAutopsyPriceAuthority(governedPrice)");
    expect(checkoutServer).toContain("autopsy-checkout-a69-");
  });
});

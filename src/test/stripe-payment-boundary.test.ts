import { afterEach, describe, expect, it } from "vitest";
import {
  AUTOPSY_AMOUNT_MINOR,
  AUTOPSY_CURRENCY,
  assertAutopsyPriceAuthority,
  createTestStripeClient,
  getAppBaseUrl,
  getAutopsyPriceId,
} from "../../api/_lib/stripe-server";

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe("Autopsy Stripe boundary", () => {
  it("keeps the authorised price fixed at A$69", () => {
    expect(AUTOPSY_AMOUNT_MINOR).toBe(6900);
    expect(AUTOPSY_CURRENCY).toBe("aud");
  });

  it("requires a server-configured Stripe price id", () => {
    process.env.STRIPE_AUTOPSY_PRICE_ID = "price_governed_a69";
    expect(getAutopsyPriceId()).toBe("price_governed_a69");
    process.env.STRIPE_AUTOPSY_PRICE_ID = "not_a_price";
    expect(() => getAutopsyPriceId()).toThrow(/Invalid Autopsy Stripe price id/);
  });

  it("accepts only an active one-time A$69 AUD test price", () => {
    expect(() => assertAutopsyPriceAuthority({
      id: "price_governed_a69",
      active: true,
      currency: "aud",
      livemode: false,
      type: "one_time",
      unit_amount: 6900,
    })).not.toThrow();

    expect(() => assertAutopsyPriceAuthority({
      id: "price_wrong_amount",
      active: true,
      currency: "aud",
      livemode: false,
      type: "one_time",
      unit_amount: 4900,
    })).toThrow(/authorised A\$69 Discover price/);
  });

  it("fails closed for live, recurring or inactive Stripe prices", () => {
    const basePrice = {
      id: "price_governed_a69",
      active: true,
      currency: "aud",
      livemode: false,
      type: "one_time" as const,
      unit_amount: 6900,
    };
    expect(() => assertAutopsyPriceAuthority({ ...basePrice, livemode: true })).toThrow(/Live Stripe prices/);
    expect(() => assertAutopsyPriceAuthority({ ...basePrice, type: "recurring" })).toThrow(/must be one-time/);
    expect(() => assertAutopsyPriceAuthority({ ...basePrice, active: false })).toThrow(/inactive/);
  });

  it("fails closed when a live Stripe key is supplied", () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_not_authorised";
    expect(() => createTestStripeClient()).toThrow(/Live Stripe credentials are not authorised/);
  });

  it("normalises the configured application origin", () => {
    process.env.APP_BASE_URL = "https://preview.example.test/";
    expect(getAppBaseUrl()).toBe("https://preview.example.test");
  });
});

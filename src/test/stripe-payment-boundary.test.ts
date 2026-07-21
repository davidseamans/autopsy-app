import { afterEach, describe, expect, it } from "vitest";
import {
  AUTOPSY_AMOUNT_MINOR,
  AUTOPSY_CURRENCY,
  createTestStripeClient,
  getAppBaseUrl,
} from "../../api/_lib/stripe-server";

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe("Autopsy Stripe boundary", () => {
  it("keeps the authorised price fixed at $49 AUD", () => {
    expect(AUTOPSY_AMOUNT_MINOR).toBe(4900);
    expect(AUTOPSY_CURRENCY).toBe("aud");
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


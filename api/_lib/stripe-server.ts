import Stripe from "stripe";

export const AUTOPSY_AMOUNT_MINOR = 6900;
export const AUTOPSY_CURRENCY = "aud";
export const AUTOPSY_PRICE_ID = "price_1U5CJtRtVEYVgWvX9jN6dclH";

function requireStripeEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

export function createTestStripeClient(): Stripe {
  const key = requireStripeEnv("STRIPE_SECRET_KEY");
  if (!key.startsWith("sk_test_")) {
    throw new Error("Live Stripe credentials are not authorised for this build.");
  }
  return new Stripe(key);
}

export function getAutopsyPriceId(): string {
  return AUTOPSY_PRICE_ID;
}

export function getAppBaseUrl(): string {
  return requireStripeEnv("APP_BASE_URL").replace(/\/$/, "");
}

export function getWebhookSecret(): string {
  const secret = requireStripeEnv("STRIPE_WEBHOOK_SECRET");
  if (!secret.startsWith("whsec_")) throw new Error("Invalid Stripe webhook secret.");
  return secret;
}


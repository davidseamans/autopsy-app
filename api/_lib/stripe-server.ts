import Stripe from "stripe";

export const AUTOPSY_AMOUNT_MINOR = 6900;
export const AUTOPSY_CURRENCY = "aud";

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
  const priceId = requireStripeEnv("STRIPE_AUTOPSY_PRICE_ID");
  if (!priceId.startsWith("price_")) throw new Error("Invalid Autopsy Stripe price id.");
  return priceId;
}

type GovernedAutopsyPrice = Pick<
  Stripe.Price,
  "id" | "active" | "currency" | "livemode" | "type" | "unit_amount"
>;

export function assertAutopsyPriceAuthority(price: GovernedAutopsyPrice): void {
  if (price.livemode) throw new Error("Live Stripe prices are not authorised for this build.");
  if (!price.active) throw new Error("The configured Autopsy Stripe price is inactive.");
  if (price.type !== "one_time") throw new Error("The configured Autopsy Stripe price must be one-time.");
  if (price.currency.toLowerCase() !== AUTOPSY_CURRENCY || price.unit_amount !== AUTOPSY_AMOUNT_MINOR) {
    throw new Error("The configured Stripe price does not match the authorised A$69 Discover price.");
  }
}

export function getAppBaseUrl(): string {
  return requireStripeEnv("APP_BASE_URL").replace(/\/$/, "");
}

export function getWebhookSecret(): string {
  const secret = requireStripeEnv("STRIPE_WEBHOOK_SECRET");
  if (!secret.startsWith("whsec_")) throw new Error("Invalid Stripe webhook secret.");
  return secret;
}

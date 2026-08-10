import type Stripe from "stripe";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { readRawBody } from "../_lib/raw-body.js";
import { createServiceClient } from "../_lib/supabase-server.js";
import { createTestStripeClient, getWebhookSecret } from "../_lib/stripe-server.js";

export const config = { api: { bodyParser: false } };

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const signature = req.headers["stripe-signature"];
    if (typeof signature !== "string") return res.status(400).json({ error: "Missing Stripe signature." });
    const stripe = createTestStripeClient();
    const event = stripe.webhooks.constructEvent(await readRawBody(req), signature, getWebhookSecret());
    if (event.livemode) return res.status(400).json({ error: "Live Stripe events are not authorised." });

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status !== "paid") return res.status(200).json({ received: true, pending: true });
      const orderId = session.metadata?.order_id;
      const userId = session.metadata?.user_id;
      if (!orderId || !userId || session.amount_total == null || !session.currency) {
        return res.status(400).json({ error: "Incomplete Checkout metadata." });
      }

      const { error } = await createServiceClient().rpc("record_paid_autopsy_checkout", {
        p_stripe_event_id: event.id,
        p_event_type: event.type,
        p_livemode: event.livemode,
        p_checkout_session_id: session.id,
        p_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
        p_order_id: orderId,
        p_user_id: userId,
        p_amount_minor: session.amount_total,
        p_currency: session.currency,
      });
      if (error) throw error;
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Stripe webhook rejected", error instanceof Error ? error.message : "unknown");
    return res.status(400).json({ error: "Webhook could not be verified or recorded." });
  }
}

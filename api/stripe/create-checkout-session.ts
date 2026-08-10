import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { authenticateRequest, createServiceClient } from "../_lib/supabase-server.js";
import {
  AUTOPSY_AMOUNT_MINOR,
  AUTOPSY_CURRENCY,
  createTestStripeClient,
  getAppBaseUrl,
  getAutopsyPriceId,
} from "../_lib/stripe-server.js";

type CheckoutBody = { conversationId?: string };

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: "A valid session is required." });

    const { conversationId } = (req.body ?? {}) as CheckoutBody;
    if (!conversationId) return res.status(400).json({ error: "A conversation is required." });

    const supabase = createServiceClient();
    const { data: conversation } = await supabase
      .from("initial_conversations")
      .select("id,user_id,status")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });

    const { data: existing } = await supabase
      .from("autopsy_orders")
      .select("id,status,stripe_checkout_session_id")
      .eq("conversation_id", conversationId)
      .maybeSingle();
    if (existing?.status === "paid") {
      return res.status(409).json({ error: "This Autopsy has already been paid." });
    }

    let orderId = existing?.id as string | undefined;
    if (!orderId) {
      const { data: order, error } = await supabase
        .from("autopsy_orders")
        .insert({
          user_id: user.id,
          conversation_id: conversationId,
          amount_minor: AUTOPSY_AMOUNT_MINOR,
          currency: AUTOPSY_CURRENCY,
        })
        .select("id")
        .single();
      if (error || !order) throw error ?? new Error("Could not create Autopsy order.");
      orderId = order.id;
    }

    const stripe = createTestStripeClient();
    const baseUrl = getAppBaseUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: getAutopsyPriceId(), quantity: 1 }],
      customer_email: user.email ?? undefined,
      client_reference_id: orderId,
      metadata: { order_id: orderId, user_id: user.id, conversation_id: conversationId },
      payment_intent_data: { metadata: { order_id: orderId, user_id: user.id } },
      success_url: `${baseUrl}/first-conversation?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/first-conversation?checkout=cancelled`,
    }, { idempotencyKey: `autopsy-checkout-${orderId}` });

    if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
    const { error: updateError } = await supabase
      .from("autopsy_orders")
      .update({ status: "checkout_created", stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("user_id", user.id);
    if (updateError) {
      await stripe.checkout.sessions.expire(session.id).catch(() => undefined);
      throw updateError;
    }

    return res.status(200).json({ checkoutUrl: session.url });
  } catch (error) {
    console.error("Autopsy Checkout creation failed", error instanceof Error ? error.message : "unknown");
    return res.status(500).json({ error: "Checkout could not be started." });
  }
}

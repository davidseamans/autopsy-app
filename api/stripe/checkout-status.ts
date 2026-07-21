import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { authenticateRequest, createServiceClient } from "../_lib/supabase-server.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await authenticateRequest(req);
  if (!user) return res.status(401).json({ error: "A valid session is required." });
  const sessionId = Array.isArray(req.query.session_id) ? req.query.session_id[0] : req.query.session_id;
  if (!sessionId) return res.status(400).json({ error: "Checkout session is required." });

  const { data: order, error } = await createServiceClient()
    .from("autopsy_orders")
    .select("id,status,paid_at,autopsy_entitlements(id,status)")
    .eq("stripe_checkout_session_id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: "Payment status could not be read." });
  if (!order) return res.status(404).json({ error: "Order not found." });

  const entitlements = Array.isArray(order.autopsy_entitlements) ? order.autopsy_entitlements : [];
  return res.status(200).json({
    status: order.status,
    paidAt: order.paid_at,
    entitlementId: entitlements[0]?.id ?? null,
    entitlementStatus: entitlements[0]?.status ?? null,
  });
}

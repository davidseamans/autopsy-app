import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const conversation = readFileSync("src/pages/FirstConversation.tsx", "utf8");
const checkout = readFileSync("src/components/autopsy/AutopsyCheckoutPanel.tsx", "utf8");

describe("Hudson Stripe handover", () => {
  it("reveals the governed checkout from Hudson's conversation", () => {
    expect(conversation).toContain("A conversation with Hudson");
    expect(conversation).toContain("messages.filter((message) => message.speaker !== \"system\").length >= 3");
    expect(conversation).toContain("<AutopsyCheckoutPanel conversationId={conversationId} />");
    expect(checkout).toContain('fetch("/api/stripe/create-checkout-session"');
    expect(checkout).toContain("Hudson · secure payment handover");
  });

  it("advances only after signed payment and active entitlement are read back", () => {
    expect(checkout).toContain('payload.status === "paid"');
    expect(checkout).toContain('payload.entitlementStatus === "active"');
    expect(checkout).toContain("Hudson has confirmed the signed Stripe payment and your active access");
    expect(checkout).toContain('to="/autopsy/paid"');
  });
});

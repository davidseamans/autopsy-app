export const HUDSON_PRACTICE_KEYS = [
  "customer_opening",
  "price_question",
  "scope_inspection",
  "quote_follow_up",
  "quote_rejection",
  "completion_referral",
] as const;

export type HudsonPracticeKey = (typeof HUDSON_PRACTICE_KEYS)[number];

export const HUDSON_PRACTICES: Record<HudsonPracticeKey, { title: string; purpose: string }> = {
  customer_opening: {
    title: "Open the customer conversation",
    purpose: "Introduce the business naturally and secure the next sensible step.",
  },
  price_question: {
    title: "Respond to a price question",
    purpose: "Explain the scope calmly without discounting against yourself.",
  },
  scope_inspection: {
    title: "Clarify an uncertain scope",
    purpose: "Ask enough useful questions to turn a vague request into quote-ready work.",
  },
  quote_follow_up: {
    title: "Follow up a written quote",
    purpose: "Confirm receipt, answer the real question and agree on a clear next step.",
  },
  quote_rejection: {
    title: "Handle a rejected quote",
    purpose: "Accept the decision professionally and ask once for useful feedback.",
  },
  completion_referral: {
    title: "Close well and ask for the next opportunity",
    purpose: "Confirm satisfaction, close the practical loop and make a natural referral request.",
  },
};

export function isHudsonPracticeKey(value: unknown): value is HudsonPracticeKey {
  return typeof value === "string" && HUDSON_PRACTICE_KEYS.includes(value as HudsonPracticeKey);
}

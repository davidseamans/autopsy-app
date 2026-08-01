export type Stage1CleanTypePricingRule = {
  code: string;
  label: string;
  guidance: string;
  ruleVersion: number;
  consumablesCostPerHour: number;
  minimumConsumablesCost: number;
  targetConsumablesMarginPct: number;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export function calculateGuidedQuoteTotals(input: {
  items: Array<{ estimatedHours: number }>;
  chargeOutRateExGst: number;
  rule: Stage1CleanTypePricingRule | null;
}) {
  const totalHours = input.items.reduce((sum, item) => sum + item.estimatedHours, 0);
  const serviceAmount = input.items.reduce(
    (sum, item) => sum + roundMoney(item.estimatedHours * input.chargeOutRateExGst),
    0,
  );
  const consumablesCost = input.rule
    ? Math.max(input.rule.minimumConsumablesCost, roundMoney(totalHours * input.rule.consumablesCostPerHour))
    : 0;
  const consumablesSellAmount = input.rule
    ? roundMoney(consumablesCost / (1 - input.rule.targetConsumablesMarginPct / 100))
    : 0;
  const subtotal = serviceAmount + consumablesSellAmount;
  const gst = roundMoney(subtotal * 0.10);
  return {
    totalHours,
    serviceAmount,
    consumablesCost,
    consumablesSellAmount,
    subtotal,
    gst,
    total: roundMoney(subtotal + gst),
  };
}

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { calculateGuidedQuoteTotals, type Stage1CleanTypePricingRule } from "@/lib/stage1Pricing";

const migration = readFileSync(
  resolve("supabase/migrations/20260801090000_stage1_guided_clean_type_pricing.sql"),
  "utf8",
);

const routine: Stage1CleanTypePricingRule = {
  code: "routine",
  label: "Routine clean",
  guidance: "Regular cleaning with ordinary consumables use.",
  ruleVersion: 1,
  consumablesCostPerHour: 1.5,
  minimumConsumablesCost: 5,
  targetConsumablesMarginPct: 30,
};

describe("Stage 1 guided clean-type pricing", () => {
  it("turns one clean-type choice into service, supplies, GST and total", () => {
    expect(calculateGuidedQuoteTotals({
      items: [{ estimatedHours: 4 }, { estimatedHours: 6 }],
      chargeOutRateExGst: 60,
      rule: routine,
    })).toEqual({
      totalHours: 10,
      serviceAmount: 600,
      consumablesCost: 15,
      consumablesSellAmount: 21.43,
      subtotal: 621.43,
      gst: 62.14,
      total: 683.57,
    });
  });

  it("uses the minimum supplies budget for a short routine clean", () => {
    const result = calculateGuidedQuoteTotals({
      items: [{ estimatedHours: 1 }],
      chargeOutRateExGst: 60,
      rule: routine,
    });
    expect(result.consumablesCost).toBe(5);
    expect(result.consumablesSellAmount).toBe(7.14);
  });

  it("keeps rules versioned, read-only to candidates and inside Stage 1", () => {
    expect(migration).toContain("public.stage1_clean_type_pricing_rules");
    expect(migration).toContain("rule_version integer");
    expect(migration).toContain("grant select on public.stage1_clean_type_pricing_rules to authenticated");
    expect(migration).not.toContain("grant insert on public.stage1_clean_type_pricing_rules to authenticated");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("create_stage1_guided_quote");
    expect(migration).not.toMatch(/public\.core_/i);
  });

  it("snapshots the estimate used by the quote for later job-cost comparison", () => {
    expect(migration).toContain("clean_type_label = v_rule.label");
    expect(migration).toContain("pricing_rule_version = v_rule.rule_version");
    expect(migration).toContain("estimated_consumables_cost = v_consumables_cost");
    expect(migration).toContain("consumables_sell_amount = v_consumables_sell");
  });
});

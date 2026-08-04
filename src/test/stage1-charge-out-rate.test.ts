import { describe, expect, it } from "vitest";
import { calculateChargeOutRate, calculatePriceCutConsequence } from "@/lib/stage1ChargeOutRate";

const example = {
  desiredHourlyEarnings: 35,
  billableHoursPerWeek: 25,
  weeklyBusinessCosts: 300,
  unbilledHoursPerWeek: 5,
  safetyMarginPercent: 15,
};

describe("First 5 Jobs charge-out-rate exercise", () => {
  it("shows what each billable hour must carry", () => {
    const result = calculateChargeOutRate(example);

    expect(result.cleaningPayPerBillableHour).toBe(35);
    expect(result.unbilledTimePerBillableHour).toBe(7);
    expect(result.businessCostsPerBillableHour).toBe(12);
    expect(result.safetyMarginPerBillableHour).toBeCloseTo(8.1);
    expect(result.chargeOutRateExGst).toBeCloseTo(62.1);
    expect(result.customerRateIncludingGst).toBeCloseTo(68.31);
  });

  it("makes the consequence of cutting the customer price visible", () => {
    const result = calculatePriceCutConsequence(example, 20);

    expect(result.reducedCustomerRateIncludingGst).toBeCloseTo(54.648);
    expect(result.availableHourlyEarnings).toBeCloseTo(31.4);
    expect(result.hourlyEarningsShortfall).toBeCloseTo(3.6);
  });

  it("handles empty or unrealistic inputs without producing invalid numbers", () => {
    const result = calculateChargeOutRate({
      desiredHourlyEarnings: -1,
      billableHoursPerWeek: 0,
      weeklyBusinessCosts: Number.NaN,
      unbilledHoursPerWeek: -5,
      safetyMarginPercent: 500,
    });

    expect(Object.values(result).every(Number.isFinite)).toBe(true);
    expect(result.chargeOutRateExGst).toBe(0);
  });
});

export type ChargeOutRateInputs = {
  desiredHourlyEarnings: number;
  billableHoursPerWeek: number;
  weeklyBusinessCosts: number;
  unbilledHoursPerWeek: number;
  safetyMarginPercent: number;
};

export type ChargeOutRateResult = {
  cleaningPayPerBillableHour: number;
  unbilledTimePerBillableHour: number;
  businessCostsPerBillableHour: number;
  baseCostPerBillableHour: number;
  safetyMarginPerBillableHour: number;
  chargeOutRateExGst: number;
  gstPerBillableHour: number;
  customerRateIncludingGst: number;
};

const nonNegative = (value: number) => Math.max(0, Number.isFinite(value) ? value : 0);

export function calculateChargeOutRate(input: ChargeOutRateInputs): ChargeOutRateResult {
  const billableHours = Math.max(1, nonNegative(input.billableHoursPerWeek));
  const desiredHourlyEarnings = nonNegative(input.desiredHourlyEarnings);
  const unbilledHours = nonNegative(input.unbilledHoursPerWeek);
  const weeklyBusinessCosts = nonNegative(input.weeklyBusinessCosts);
  const safetyMarginPercent = Math.min(100, nonNegative(input.safetyMarginPercent));

  const cleaningPayPerBillableHour = desiredHourlyEarnings;
  const unbilledTimePerBillableHour = (desiredHourlyEarnings * unbilledHours) / billableHours;
  const businessCostsPerBillableHour = weeklyBusinessCosts / billableHours;
  const baseCostPerBillableHour = cleaningPayPerBillableHour + unbilledTimePerBillableHour + businessCostsPerBillableHour;
  const safetyMarginPerBillableHour = baseCostPerBillableHour * (safetyMarginPercent / 100);
  const chargeOutRateExGst = baseCostPerBillableHour + safetyMarginPerBillableHour;
  const gstPerBillableHour = chargeOutRateExGst * 0.1;

  return {
    cleaningPayPerBillableHour,
    unbilledTimePerBillableHour,
    businessCostsPerBillableHour,
    baseCostPerBillableHour,
    safetyMarginPerBillableHour,
    chargeOutRateExGst,
    gstPerBillableHour,
    customerRateIncludingGst: chargeOutRateExGst + gstPerBillableHour,
  };
}

export function calculatePriceCutConsequence(input: ChargeOutRateInputs, cutPercent: number) {
  const result = calculateChargeOutRate(input);
  const billableHours = Math.max(1, nonNegative(input.billableHoursPerWeek));
  const totalWorkingHours = Math.max(1, billableHours + nonNegative(input.unbilledHoursPerWeek));
  const safeCutPercent = Math.min(100, nonNegative(cutPercent));
  const reducedCustomerRateIncludingGst = result.customerRateIncludingGst * (1 - safeCutPercent / 100);
  const reducedRateExGst = reducedCustomerRateIncludingGst / 1.1;
  const weeklyRevenueExGst = reducedRateExGst * billableHours;
  const availableHourlyEarnings = Math.max(0, (weeklyRevenueExGst - nonNegative(input.weeklyBusinessCosts)) / totalWorkingHours);
  const hourlyEarningsShortfall = Math.max(0, nonNegative(input.desiredHourlyEarnings) - availableHourlyEarnings);

  return {
    reducedCustomerRateIncludingGst,
    reducedRateExGst,
    availableHourlyEarnings,
    hourlyEarningsShortfall,
  };
}

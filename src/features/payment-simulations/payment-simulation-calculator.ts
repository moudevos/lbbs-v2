export type PaymentSimulationInput = {
  totalProduced: number;
  commissionableBase: number;
  commissionRate: number;
  additionalIncome: number;
  mandatoryDiscountRate: number;
  mandatoryDiscountEnabled: boolean;
  debtAmount: number;
  otherDeductions?: number;
};

const safe = (value: number) =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

export function calculatePaymentSimulation(input: PaymentSimulationInput) {
  const totalProduced = safe(input.totalProduced);
  const commissionableBase = safe(input.commissionableBase);
  const commissionRate = safe(input.commissionRate);
  const additionalIncome = safe(input.additionalIncome);
  const mandatoryDiscountRate = safe(input.mandatoryDiscountRate);
  const debtRequested = safe(input.debtAmount);
  const otherDeductions = safe(input.otherDeductions ?? 0);

  const commission = commissionableBase * commissionRate / 100;
  const grossPay = commission + additionalIncome;
  const mandatoryDiscount = input.mandatoryDiscountEnabled
    ? totalProduced * mandatoryDiscountRate / 100
    : 0;

  const beforeDebt = Math.max(
    0,
    grossPay - mandatoryDiscount - otherDeductions,
  );
  const debtApplied = Math.min(debtRequested, beforeDebt);
  const estimatedNet = Math.max(0, beforeDebt - debtApplied);

  return {
    totalProduced,
    commissionableBase,
    commissionRate,
    commission,
    additionalIncome,
    grossPay,
    mandatoryDiscountRate,
    mandatoryDiscount,
    otherDeductions,
    debtRequested,
    debtApplied,
    beforeDebt,
    estimatedNet,
  };
}

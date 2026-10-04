export function getLoanInterestSnapshot(
  debtType: string,
  principalAmount: number,
  interestRatePercent: number,
) {
  const principal = Math.round(Math.max(Number(principalAmount) || 0, 0) * 100) / 100;
  const rate = Number(interestRatePercent) || 0;
  const interest = debtType === "loan"
    ? Math.round(principal * rate) / 100
    : 0;
  return {
    principalAmount: principal,
    interestRatePercent: debtType === "loan" ? rate : 0,
    interestAmount: Math.round(interest * 100) / 100,
    totalDebt: Math.round((principal + interest) * 100) / 100,
  };
}

type DebtOrigin = {
  debtType: string;
  originalAmount: number;
  principalAmount?: number | null;
  interestRatePercent?: number | null;
  interestAmount?: number | null;
};

export function getDebtOriginSnapshot(debt: DebtOrigin) {
  const hasSnapshot = debt.principalAmount != null;
  return {
    hasSnapshot,
    principalAmount: hasSnapshot ? Number(debt.principalAmount) : Number(debt.originalAmount),
    interestRatePercent: hasSnapshot ? Number(debt.interestRatePercent ?? 0) : 0,
    interestAmount: hasSnapshot ? Number(debt.interestAmount ?? 0) : 0,
  };
}

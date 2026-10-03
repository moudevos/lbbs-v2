export type SettlementDraftPreviewInput = {
  percentageCommission: number;
  fixedCommissions: number;
  productBonuses: number;
  manualBonuses: number;
  mandatoryDiscount: number;
  otherDeductions: number;
  selectedDebtAmounts: Iterable<number>;
  totalOutstandingDebt: number;
};

const money = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

export function buildSettlementDraftPreview(input: SettlementDraftPreviewInput) {
  const percentageCommission = money(input.percentageCommission);
  const fixedCommissions = money(input.fixedCommissions);
  const productBonuses = money(input.productBonuses);
  const manualBonuses = money(input.manualBonuses);
  const mandatoryDiscount = money(input.mandatoryDiscount);
  const otherDeductions = money(input.otherDeductions);
  const selectedDebtTotal = money([...input.selectedDebtAmounts].reduce((total, amount) => total + Math.max(0, Number(amount) || 0), 0));
  const totalIncome = money(percentageCommission + fixedCommissions + productBonuses + manualBonuses);
  const netBeforeDebt = money(Math.max(totalIncome - mandatoryDiscount - otherDeductions, 0));
  const totalExpenses = money(mandatoryDiscount + otherDeductions + selectedDebtTotal);
  const netPay = money(Math.max(totalIncome - totalExpenses, 0));
  const maxAdditionalDebt = money(Math.max(netBeforeDebt - selectedDebtTotal, 0));
  const totalOutstandingDebt = money(Math.max(0, input.totalOutstandingDebt));
  const debtCoverageCapacity = netBeforeDebt;
  const debtExcess = money(Math.max(totalOutstandingDebt - debtCoverageCapacity, 0));
  const remainingDebtAfterSelection = money(Math.max(totalOutstandingDebt - selectedDebtTotal, 0));

  return {
    percentageCommission,
    fixedCommissions,
    productBonuses,
    manualBonuses,
    totalIncome,
    mandatoryDiscount,
    otherDeductions,
    selectedDebtTotal,
    totalExpenses,
    netBeforeDebt,
    netPay,
    maxAdditionalDebt,
    totalOutstandingDebt,
    debtCoverageCapacity,
    debtExcess,
    remainingDebtAfterSelection,
  };
}

export function getSettlementDebtMaximum(debtAvailable: number, netBeforeDebt: number, selectedDebtTotal: number, currentRowSelectedAmount: number) {
  const otherSelectedDebtTotal = Math.max(0, selectedDebtTotal - Math.max(0, currentRowSelectedAmount));
  return money(Math.min(Math.max(0, debtAvailable), Math.max(0, netBeforeDebt - otherSelectedDebtTotal)));
}

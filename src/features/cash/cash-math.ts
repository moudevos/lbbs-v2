export function calculateExpectedCash(input: {
  opening: number; openingIncrease?: number; openingDecrease?: number; cashSales?: number;
  income?: number; expense?: number; withdrawals?: number; adjustmentIncrease?: number; adjustmentDecrease?: number;
}) {
  return Number((input.opening + (input.openingIncrease ?? 0) - (input.openingDecrease ?? 0) + (input.cashSales ?? 0) + (input.income ?? 0) - (input.expense ?? 0) - (input.withdrawals ?? 0) + (input.adjustmentIncrease ?? 0) - (input.adjustmentDecrease ?? 0)).toFixed(2));
}

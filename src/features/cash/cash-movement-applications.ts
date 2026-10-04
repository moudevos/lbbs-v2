export type ApplicableCashMovement = {
  movementType: string;
  categoryCode: string;
  status: string;
  amount: number;
  appliedAmount: number;
};

export function getCashMovementAvailableAmount(amount: number, appliedAmount: number) {
  return Math.max(Number(amount) - Number(appliedAmount), 0);
}

export function isApplicablePosWithdrawal(movement: ApplicableCashMovement) {
  return movement.movementType === "expense"
    && movement.categoryCode === "cash_withdrawal"
    && movement.status === "active"
    && getCashMovementAvailableAmount(movement.amount, movement.appliedAmount) > 0;
}

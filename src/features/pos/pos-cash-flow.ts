export type PosCashMovementType = "income" | "expense";

const money = (value: unknown) => Number(value ?? 0) || 0;

export function getPosCashFlowPreview(expectedCash: number, movementType: PosCashMovementType, amount: number) {
  const expected = Math.max(0, money(expectedCash));
  const movement = Math.max(0, money(amount));
  const insufficientCash = movementType === "expense" && movement > expected;
  return {
    expectedCash: expected,
    amount: movement,
    insufficientCash,
    afterCash: movementType === "income" ? expected + movement : Math.max(expected - movement, 0),
  };
}

export function getPosCashMovementCategoryCode(movementType: PosCashMovementType) {
  return movementType === "income" ? "operational_income" : "cash_withdrawal";
}

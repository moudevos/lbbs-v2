export type PaymentSimulationInput = {
  gross: number;
  previousDeductions: number;
  mandatoryDiscountRate: number;
};

export function calculatePaymentSimulation(input: PaymentSimulationInput) {
  const gross = Number.isFinite(input.gross) ? Math.max(0, input.gross) : 0;
  const previousDeductions = Number.isFinite(input.previousDeductions)
    ? Math.max(0, input.previousDeductions)
    : 0;
  const rate = Number.isFinite(input.mandatoryDiscountRate)
    ? Math.max(0, input.mandatoryDiscountRate)
    : 0;
  const beforeDiscount = Math.max(0, gross - previousDeductions);
  // El descuento obligatorio pertenece a la producción generada, no al
  // saldo que queda luego de descontar deudas u otros conceptos.
  const mandatoryDiscount = gross * rate / 100;

  return {
    beforeDiscount,
    mandatoryDiscount,
    estimatedNet: Math.max(0, beforeDiscount - mandatoryDiscount),
  };
}

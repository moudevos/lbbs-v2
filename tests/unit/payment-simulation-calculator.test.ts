import { describe, expect, it } from "vitest";

import { calculatePaymentSimulation } from "@/features/payment-simulations/payment-simulation-calculator";

describe("simulacion temporal de pagos", () => {
  it("aplica deducciones antes del porcentaje obligatorio", () => {
    expect(calculatePaymentSimulation({ gross: 1_000, previousDeductions: 10, mandatoryDiscountRate: 1 })).toEqual({
      beforeDiscount: 990,
      mandatoryDiscount: 9.9,
      estimatedNet: 980.1,
    });
  });

  it("normaliza entradas negativas sin crear efectos persistentes", () => {
    expect(calculatePaymentSimulation({ gross: -10, previousDeductions: -2, mandatoryDiscountRate: -1 })).toEqual({
      beforeDiscount: 0,
      mandatoryDiscount: 0,
      estimatedNet: 0,
    });
  });
});

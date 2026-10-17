import { describe, expect, it } from "vitest";

import { calculatePaymentSimulation } from "@/features/payment-simulations/payment-simulation-calculator";

describe("simulación temporal de liquidación", () => {
  it("calcula comisión sobre base y descuento obligatorio sobre total producido", () => {
    expect(
      calculatePaymentSimulation({
        totalProduced: 1_000,
        commissionableBase: 780,
        commissionRate: 50,
        additionalIncome: 2,
        mandatoryDiscountEnabled: true,
        mandatoryDiscountRate: 1,
        debtAmount: 124,
        otherDeductions: 0,
      }),
    ).toEqual({
      totalProduced: 1_000,
      commissionableBase: 780,
      commissionRate: 50,
      commission: 390,
      additionalIncome: 2,
      grossPay: 392,
      mandatoryDiscountRate: 1,
      mandatoryDiscount: 10,
      otherDeductions: 0,
      debtRequested: 124,
      debtApplied: 124,
      beforeDebt: 382,
      estimatedNet: 258,
    });
  });

  it("limita la deuda aplicada al neto disponible", () => {
    const result = calculatePaymentSimulation({
      totalProduced: 500,
      commissionableBase: 400,
      commissionRate: 50,
      additionalIncome: 0,
      mandatoryDiscountEnabled: true,
      mandatoryDiscountRate: 1,
      debtAmount: 999,
      otherDeductions: 0,
    });

    expect(result.mandatoryDiscount).toBe(5);
    expect(result.beforeDebt).toBe(195);
    expect(result.debtRequested).toBe(999);
    expect(result.debtApplied).toBe(195);
    expect(result.estimatedNet).toBe(0);
  });

  it("permite desactivar el descuento obligatorio y normaliza negativos", () => {
    const result = calculatePaymentSimulation({
      totalProduced: -100,
      commissionableBase: -50,
      commissionRate: -1,
      additionalIncome: -3,
      mandatoryDiscountEnabled: false,
      mandatoryDiscountRate: 1,
      debtAmount: -20,
      otherDeductions: -5,
    });

    expect(result.grossPay).toBe(0);
    expect(result.mandatoryDiscount).toBe(0);
    expect(result.debtApplied).toBe(0);
    expect(result.estimatedNet).toBe(0);
  });
});

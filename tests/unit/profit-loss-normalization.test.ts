import { describe, expect, it } from "vitest";
import { getFinancialPostingLabel, isReconciled, reconcileProfitLoss } from "@/features/finance/profit-loss-lines";

const balanced = { serviceRevenue: 100, barbershopRevenue: 20, cafeteriaRevenue: 10, otherRevenue: -5, totalRevenue: 125, productCogs: 12, courtesyCost: 3, personnelCost: 20, directCosts: 35, grossProfit: 90, operatingExpenses: 10, operatingProfit: 80 };
describe("normalización de P&L", () => {
  it("reconcilia ingresos, costos, utilidad bruta y resultado operativo", () => expect(Object.values(reconcileProfitLoss(balanced)).every(isReconciled)).toBe(true));
  it("no oculta otros ingresos negativos", () => expect(balanced.otherRevenue).toBe(-5));
  it("admite ceros financieros legítimos", () => expect(Object.values(reconcileProfitLoss({ ...balanced, personnelCost: 0, directCosts: 15, grossProfit: 110, operatingProfit: 100 })).every(isReconciled)).toBe(true));
  it("detecta una diferencia mayor a un céntimo", () => expect(isReconciled(reconcileProfitLoss({ ...balanced, operatingProfit: 79.9 }).operatingProfit)).toBe(false));
  it("presenta códigos financieros con labels legibles", () => {
    expect(getFinancialPostingLabel("approved_settlement_personnel_cost")).toBe("Costo de personal por liquidación aprobada");
    expect(getFinancialPostingLabel("approved_settlement_personnel_cost_reversal")).toBe("Reversa de costo de personal");
    expect(getFinancialPostingLabel("sale_revenue_historical_reversal")).toBe("Reversa histórica de ingresos por ventas");
  });
  it("contextualiza los ajustes manuales y nunca expone snake_case desconocido", () => {
    expect(getFinancialPostingLabel("finance_manual_entry", "personnel_accrued_cost")).toBe("Ajuste manual de costo de personal");
    expect(getFinancialPostingLabel("future_finance_entry")).not.toContain("_");
  });
});

import { describe, expect, it } from "vitest";

import { buildSettlementFinancialSummary } from "@/features/settlements/settlement-document-summary";

describe("documento de liquidación: producción reconocida", () => {
  it("mantiene S/35 reconocido, S/2 de aporte y S/33 de base sin contaminar el 1%", () => {
    const summary = buildSettlementFinancialSummary(
      {
        total_service_count: 1,
        total_product_count: 0,
        total_reward_count: 0,
        recognized_production_total: 35,
        commissionable_base_total: 33,
        commission_rate: 50,
        percentage_commission_total: 16.5,
        mandatory_discount_base_amount: 35,
        mandatory_discount_rate: 1,
        mandatory_discount_amount: 0.35,
      },
      [{ recognized_production_amount_snapshot: 35, operational_contribution_snapshot: 2 }],
      [],
    );

    expect(summary.totalProduction).toBe(35);
    expect(summary.productionContribution).toBe(2);
    expect(summary.productionBase).toBe(33);
    expect(summary.incomes.find((line) => line.label === "Comisión porcentual")?.amount).toBe(16.5);
    expect(summary.expenses.find((line) => line.label === "Descuento obligatorio")?.amount).toBe(0.35);
  });
});

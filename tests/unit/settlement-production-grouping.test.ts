import { describe, expect, it } from "vitest";

import { groupSettlementProductionBySale } from "@/features/settlements/settlement-production-grouping";

describe("groupSettlementProductionBySale", () => {
  it("groups immutable service and product snapshots by sale reference", () => {
    const groups = groupSettlementProductionBySale(
      [{
        id: "service-1", accountingDate: "2026-10-01", saleReference: "VTA-0001", saleId: "",
        serviceName: "Corte", origin: "Venta normal", commercialValue: 100, recognized: 90,
        contribution: 5, commissionBase: 85, commissionRate: 50, commission: 42.5, fixedCommission: 0, isPercentageCommission: true,
      }],
      [{
        id: "product-1", accountingDate: "2026-10-01", saleReference: "VTA-0001", saleId: "",
        saleNumber: "VTA-0001", productName: "Pomada", family: "Productos de barbería",
        quantity: 1, salesGross: 15, recognized: 10, bonus: 2, origin: "Venta de producto",
      }],
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ reference: "VTA-0001", recognized: 100, contribution: 5, commissionBase: 85, commission: 44.5 });
  });

  it("uses a stable VTA fallback from the sale snapshot id", () => {
    const groups = groupSettlementProductionBySale(
      [{
        id: "service-2", accountingDate: "2026-10-02", saleReference: "", saleId: "abc12345-ffff",
        serviceName: "Afeitado", origin: "Cortesía", commercialValue: 0, recognized: 20,
        contribution: 0, commissionBase: 0, commissionRate: 0, commission: 0, fixedCommission: 10, isPercentageCommission: false,
      }],
      [],
    );

    expect(groups[0]?.reference).toBe("VTA-ABC12345");
  });
});

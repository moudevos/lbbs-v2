import { describe, expect, it } from "vitest";

import { getCourtesyAllowance, validateCourtesySelection, type CourtesyRule, type CourtesyValidationItem } from "@/features/pos/courtesy-validation";

const service: CourtesyValidationItem = { catalogId: "service-100", itemType: "service", quantity: 1, unitPrice: 100, isCourtesy: false, courtesyReason: null, categoryId: "cuts", isCourtesyAllowed: true };
const courtesy: CourtesyValidationItem = { catalogId: "product-courtesy", itemType: "product", quantity: 1, unitPrice: 20, isCourtesy: true, courtesyReason: "Promocion", categoryId: "care", isCourtesyAllowed: true };
const rule: CourtesyRule = {
  id: "rule-1", name: "Regla", branch_id: null, priority: 10, qualifying_service_id: null,
  qualifying_service_category_id: null, minimum_unit_amount: 100, maximum_courtesy_items: 1,
  maximum_courtesy_amount: 20, allow_with_reward: false, starts_at: null, ends_at: null, is_active: true,
  benefits: [{ id: "benefit-1", benefit_item_type: "product", service_id: null, product_id: "product-courtesy", service_category_id: null, product_category_id: null, max_quantity: 1, max_unit_amount: 20, is_active: true }],
};

describe("reglas de cortesias", () => {
  it("acepta servicio calificador y beneficio permitido", () => {
    expect(validateCourtesySelection({ branchId: "branch-1", hasReward: false, items: [service, courtesy], rules: [rule] }).ok).toBe(true);
  });

  it.each([
    ["sin servicio comercial", [courtesy], false],
    ["servicio inferior", [{ ...service, unitPrice: 99 }, courtesy], false],
    ["dos servicios inferiores no se suman", [{ ...service, catalogId: "a", unitPrice: 50 }, { ...service, catalogId: "b", unitPrice: 50 }, courtesy], false],
    ["exceso de beneficios", [service, { ...courtesy, quantity: 2 }], false],
    ["beneficio no permitido", [service, { ...courtesy, catalogId: "other" }], false],
    ["producto no habilitado", [service, { ...courtesy, isCourtesyAllowed: false }], false],
    ["reward incompatible", [service, courtesy], true],
    ["sin motivo", [service, { ...courtesy, courtesyReason: null }], false],
  ])("rechaza %s", (_name, items, hasReward) => {
    expect(validateCourtesySelection({ branchId: "branch-1", hasReward, items: items as CourtesyValidationItem[], rules: [rule] }).ok).toBe(false);
  });

  it("respeta alcance de sede y vigencia", () => {
    expect(validateCourtesySelection({ branchId: "branch-1", hasReward: false, items: [service, courtesy], rules: [{ ...rule, branch_id: "branch-2" }] }).ok).toBe(false);
    expect(validateCourtesySelection({ branchId: "branch-1", hasReward: false, items: [service, courtesy], rules: [{ ...rule, ends_at: "2020-01-01T00:00:00Z" }] }).ok).toBe(false);
  });

  it("multiplica el cupo por cada servicio y prioriza la regla específica", () => {
    const allowance = getCourtesyAllowance({
      branchId: "branch-1",
      hasReward: false,
      items: [{ ...service, quantity: 2 }, courtesy],
      rules: [{ ...rule, maximum_courtesy_items: 2 }],
    });

    expect(allowance.totalCapacity).toBe(4);
    expect(allowance.usedCapacity).toBe(1);
    expect(allowance.remainingCapacity).toBe(3);
    expect(allowance.eligibleProductIds.has("product-courtesy")).toBe(true);
    expect(allowance.productCapacity.get("product-courtesy")).toBe(2);
  });

  it("usa productos habilitados en catalogo cuando la regla no define productos", () => {
    const allowance = getCourtesyAllowance({
      branchId: "branch-1",
      hasReward: false,
      items: [service, { ...courtesy, isCourtesy: false }],
      rules: [{ ...rule, benefits: [], maximum_courtesy_items: 2 }],
    });

    expect(allowance.eligibleProductIds.has("product-courtesy")).toBe(true);
    expect(allowance.productCapacity.get("product-courtesy")).toBe(2);
  });

  it("prefiere el tramo de monto mas alto que aun aplica", () => {
    const allowance = getCourtesyAllowance({
      branchId: "branch-1",
      hasReward: false,
      items: [service, { ...courtesy, isCourtesy: false }],
      rules: [
        { ...rule, id: "general", minimum_unit_amount: 0, maximum_courtesy_items: 1, benefits: [] },
        { ...rule, id: "premium", minimum_unit_amount: 60, maximum_courtesy_items: 2, benefits: [] },
      ],
    });

    expect(allowance.totalCapacity).toBe(2);
  });
});

export type CourtesyValidationItem = {
  catalogId: string;
  itemType: "service" | "product";
  quantity: number;
  unitPrice: number;
  isCourtesy: boolean;
  courtesyReason: string | null;
  categoryId: string | null;
  isCourtesyAllowed: boolean;
};

export type CourtesyRuleBenefit = {
  id: string;
  benefit_item_type: "service" | "product";
  service_id: string | null;
  product_id: string | null;
  service_category_id: string | null;
  product_category_id: string | null;
  max_quantity: number;
  max_unit_amount: number | null;
  is_active: boolean;
};

export type CourtesyRule = {
  id: string;
  name: string;
  branch_id: string | null;
  priority: number;
  qualifying_service_id: string | null;
  qualifying_service_category_id: string | null;
  minimum_unit_amount: number;
  maximum_courtesy_items: number;
  maximum_courtesy_amount: number | null;
  allow_with_reward: boolean;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  benefits: CourtesyRuleBenefit[];
};

export type CourtesyValidationResult =
  | {
      ok: true;
      rule: CourtesyRule | null;
      benefitByCatalogId: Map<string, CourtesyRuleBenefit>;
      qualifyingCatalogId: string | null;
    }
  | { ok: false; message: string };

export type CourtesyAllowance = {
  totalCapacity: number;
  usedCapacity: number;
  remainingCapacity: number;
  eligibleProductIds: Set<string>;
  productCapacity: Map<string, number>;
};

function benefitMatches(item: CourtesyValidationItem, benefit: CourtesyRuleBenefit) {
  if (!benefit.is_active || benefit.benefit_item_type !== item.itemType) return false;
  if (item.itemType === "service") {
    return benefit.service_id === item.catalogId || (benefit.service_category_id !== null && benefit.service_category_id === item.categoryId);
  }
  return benefit.product_id === item.catalogId || (benefit.product_category_id !== null && benefit.product_category_id === item.categoryId);
}

export function validateCourtesySelection(input: {
  branchId: string;
  hasReward: boolean;
  items: CourtesyValidationItem[];
  rules: CourtesyRule[];
  now?: Date;
}): CourtesyValidationResult {
  const courtesyItems = input.items.filter((item) => item.isCourtesy);
  if (courtesyItems.length === 0) return { ok: false, message: "No hay cortesias para validar." };
  if (courtesyItems.some((item) => !item.courtesyReason?.trim())) {
    return { ok: false, message: "Debes registrar el motivo de cada cortesia." };
  }
  if (courtesyItems.some((item) => item.itemType === "product" && !item.isCourtesyAllowed)) {
    return { ok: false, message: "Uno de los productos no admite cortesia." };
  }

  const now = (input.now ?? new Date()).getTime();
  const activeRules = input.rules
    .filter((rule) => rule.is_active && (!rule.branch_id || rule.branch_id === input.branchId))
    .filter((rule) => !rule.starts_at || new Date(rule.starts_at).getTime() <= now)
    .filter((rule) => !rule.ends_at || new Date(rule.ends_at).getTime() >= now)
    .sort((left, right) => right.priority - left.priority);

  for (const rule of activeRules) {
    if (input.hasReward && !rule.allow_with_reward) continue;
    const qualifyingItem = input.items.find((item) =>
      !item.isCourtesy &&
      item.itemType === "service" &&
      item.unitPrice >= rule.minimum_unit_amount &&
      (!rule.qualifying_service_id || rule.qualifying_service_id === item.catalogId) &&
      (!rule.qualifying_service_category_id || rule.qualifying_service_category_id === item.categoryId));
    if (!qualifyingItem) continue;

    const totalQuantity = courtesyItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = courtesyItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    if (totalQuantity > rule.maximum_courtesy_items) continue;
    if (rule.maximum_courtesy_amount !== null && totalAmount > rule.maximum_courtesy_amount) continue;

    const benefitByCatalogId = new Map<string, CourtesyRuleBenefit>();
    let allBenefitsValid = true;
    for (const item of courtesyItems) {
      const benefit = rule.benefits.find((candidate) => benefitMatches(item, candidate));
      if (!benefit || item.quantity > benefit.max_quantity || (benefit.max_unit_amount !== null && item.unitPrice > benefit.max_unit_amount)) {
        allBenefitsValid = false;
        break;
      }
      benefitByCatalogId.set(item.catalogId, benefit);
    }
    if (allBenefitsValid) return { ok: true, rule, benefitByCatalogId, qualifyingCatalogId: qualifyingItem.catalogId };
  }

  // Una cortesia de servicio puede registrarse manualmente si ninguna regla aplica.
  // Las reglas siguen siendo obligatorias para productos y se usan para auditar cuando coinciden.
  if (courtesyItems.every((item) => item.itemType === "service")) {
    return {
      ok: true,
      rule: null,
      benefitByCatalogId: new Map(),
      qualifyingCatalogId: null,
    };
  }

  return {
    ok: false,
    message: "Los productos en cortesia requieren una regla activa aplicable para esta sede.",
  };
}

/**
 * Preview only. PostgreSQL validates this again on completion, so a stale
 * browser can never grant a courtesy by itself.
 */
export function getCourtesyAllowance(input: {
  branchId: string;
  hasReward: boolean;
  items: CourtesyValidationItem[];
  rules: CourtesyRule[];
  now?: Date;
}): CourtesyAllowance {
  const now = (input.now ?? new Date()).getTime();
  const rules = input.rules
    .filter((rule) => rule.is_active && (!rule.branch_id || rule.branch_id === input.branchId))
    .filter((rule) => !rule.starts_at || new Date(rule.starts_at).getTime() <= now)
    .filter((rule) => !rule.ends_at || new Date(rule.ends_at).getTime() >= now)
    .filter((rule) => !input.hasReward || rule.allow_with_reward)
    .sort((left, right) => {
      const leftSpecificity = Number(Boolean(left.qualifying_service_id)) * 2 + Number(Boolean(left.qualifying_service_category_id));
      const rightSpecificity = Number(Boolean(right.qualifying_service_id)) * 2 + Number(Boolean(right.qualifying_service_category_id));
      return rightSpecificity - leftSpecificity
        || right.minimum_unit_amount - left.minimum_unit_amount
        || right.priority - left.priority;
    });

  const matchedRules = input.items.flatMap((item) => {
    if (item.isCourtesy || item.itemType !== "service") return [];
    const effectiveUnitAmount = item.quantity > 0 ? Math.max(item.unitPrice, 0) : 0;
    const rule = rules.find((candidate) =>
      effectiveUnitAmount >= candidate.minimum_unit_amount
      && (!candidate.qualifying_service_id || candidate.qualifying_service_id === item.catalogId)
      && (!candidate.qualifying_service_category_id || candidate.qualifying_service_category_id === item.categoryId));
    return rule ? [{ rule, quantity: item.quantity }] : [];
  });

  const totalCapacity = matchedRules.reduce(
    (total, item) => total + item.rule.maximum_courtesy_items * item.quantity,
    0,
  );
  const usedCapacity = input.items
    .filter((item) => item.itemType === "product" && item.isCourtesy)
    .reduce((total, item) => total + item.quantity, 0);
  const eligibleProductIds = new Set<string>();
  const productCapacity = new Map<string, number>();

  for (const { rule, quantity } of matchedRules) {
    const benefits = rule.benefits.filter((benefit) => benefit.is_active && benefit.benefit_item_type === "product");
    if (benefits.length === 0) {
      for (const product of input.items.filter((item) => item.itemType === "product" && item.isCourtesyAllowed)) {
        eligibleProductIds.add(product.catalogId);
        productCapacity.set(
          product.catalogId,
          (productCapacity.get(product.catalogId) ?? 0) + rule.maximum_courtesy_items * quantity,
        );
      }
    }
    for (const benefit of benefits) {
      if (benefit.is_active && benefit.benefit_item_type === "product" && benefit.product_id) {
        eligibleProductIds.add(benefit.product_id);
        productCapacity.set(
          benefit.product_id,
          (productCapacity.get(benefit.product_id) ?? 0) + benefit.max_quantity * quantity,
        );
      }
    }
  }

  return {
    totalCapacity,
    usedCapacity,
    remainingCapacity: Math.max(totalCapacity - usedCapacity, 0),
    eligibleProductIds,
    productCapacity,
  };
}

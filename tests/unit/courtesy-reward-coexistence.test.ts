import { describe, expect, it } from "vitest";
import { getCourtesyAllowance, validateCourtesySelection, type CourtesyRule, type CourtesyValidationItem } from "@/features/pos/courtesy-validation";

const rule: CourtesyRule = { id: "rule", name: "Bebida", branch_id: null, priority: 1, qualifying_service_id: null, qualifying_service_category_id: null, minimum_unit_amount: 20, maximum_courtesy_items: 1, maximum_courtesy_amount: null, allow_with_reward: false, starts_at: null, ends_at: null, is_active: true, benefits: [{ id: "benefit", benefit_item_type: "product", service_id: null, product_id: "drink", service_category_id: null, product_category_id: null, max_quantity: 1, max_unit_amount: null, is_active: true }] };
const items: CourtesyValidationItem[] = [{ catalogId: "service", itemType: "service", quantity: 1, unitPrice: 30, categoryId: null, isCourtesy: false, courtesyReason: null, isCourtesyAllowed: false }, { catalogId: "drink", itemType: "product", quantity: 1, unitPrice: 2, categoryId: null, isCourtesy: true, courtesyReason: "Cortesía", isCourtesyAllowed: true }];

describe("reward and courtesy", () => {
  it("keeps a valid courtesy available when a reward is selected", () => {
    expect(getCourtesyAllowance({ branchId: "branch", hasReward: true, items, rules: [rule] }).remainingCapacity).toBe(0);
    expect(validateCourtesySelection({ branchId: "branch", hasReward: true, items, rules: [rule] }).ok).toBe(true);
  });
});

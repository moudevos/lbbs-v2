import { describe, expect, it } from "vitest";
import { buildProductCartItem, buildProductCartItemWithPrice, getCartTotal, reconcilePosPayments, repriceProductCartItem } from "@/features/pos/pos-utils";
import type { PosProductRecord } from "@/features/pos/pos-types";

const product: PosProductRecord = {
  id: "fiber", category_id: null, category_name: null, name: "Bandido Blanco Fiber Wax",
  description: null, sku: null, barcode: null,
  final_sale_price: "33.00", visibility_scope: "pos",
  retail_price: "33.00", employee_price: null, employee_price_active: false,
  effective_price: "33.00", price_source: "retail", stock_quantity: "14",
  allow_custom_price: false, is_stockable: true, is_courtesy_allowed: false, is_active: true,
};

describe("POS product pricing", () => {
  it("uses the branch price of 33 and accepts a Yape payment of 33", () => {
    const item = buildProductCartItem(product);
    const payment = { id: "yape", payment_method_id: "qr", payment_method_code: "yape",
      payment_method_name: "Yape", amount: 33, tendered_amount: 33, change_amount: 0, allows_change: false };
    const result = reconcilePosPayments(getCartTotal([item]), [payment]);
    expect(item.unit_price).toBe(33);
    expect(item.custom_price_applied).toBe(false);
    expect(result.pendingBalance).toBe(0);
    expect(result.difference).toBe(0);
  });

  it("retains a cashier-entered price during catalog refresh", () => {
    const customized = { ...product, allow_custom_price: true };
    const item = buildProductCartItemWithPrice(customized, 31);
    const refreshed = repriceProductCartItem(item, { ...customized, effective_price: "35.00" });
    expect(refreshed.unit_price).toBe(31);
    expect(refreshed.custom_price_applied).toBe(true);
  });

  it("updates regular prices when the branch changes", () => {
    const item = buildProductCartItem(product);
    const refreshed = repriceProductCartItem(item, { ...product, effective_price: "30.00" });
    expect(refreshed.unit_price).toBe(30);
    expect(refreshed.custom_price_applied).toBe(false);
  });

  it("resets custom prices if custom pricing was disabled", () => {
    const item = buildProductCartItemWithPrice({ ...product, allow_custom_price: true }, 31);
    const refreshed = repriceProductCartItem(item, product);
    expect(refreshed.unit_price).toBe(33);
    expect(refreshed.custom_price_applied).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import {
  canAddProductQuantity,
  getCartTotal,
  getRewardDiscountPreview,
  reconcilePosPayments,
  validateSaleCommercialComposition,
} from "@/features/pos/pos-utils";
import type { PosCartItem, PosPreparedPayment } from "@/features/pos/pos-types";

const service: PosCartItem = {
  id: "service-1",
  catalog_id: "catalog-service-1",
  item_type: "service",
  name: "Corte",
  description: null,
  category_name: "Cortes",
  quantity: 1,
  unit_price: 150,
  discount_amount: 0,
  is_courtesy: false,
  courtesy_reason: "",
};

function payment(
  id: string,
  amount: number,
  tenderedAmount: number,
  allowsChange: boolean,
): PosPreparedPayment {
  return {
    id,
    payment_method_id: `method-${id}`,
    payment_method_code: allowsChange ? "cash" : "wallet_qr",
    payment_method_name: allowsChange ? "Efectivo" : "QR",
    amount,
    tendered_amount: tenderedAmount,
    change_amount: 0,
    allows_change: allowsChange,
  };
}

describe("cálculos POS", () => {
  it("calcula pago mixto con vuelto solo sobre efectivo", () => {
    const result = reconcilePosPayments(150, [
      payment("qr", 100, 100, false),
      payment("cash", 100, 100, true),
    ]);

    expect(result.appliedTotal).toBe(150);
    expect(result.pendingBalance).toBe(0);
    expect(result.changeAmount).toBe(50);
    expect(result.invalidPaymentIds).toEqual([]);
    expect(result.payments.find((item) => item.id === "cash")?.amount).toBe(50);
  });

  it("marca exceso en un pago digital", () => {
    const result = reconcilePosPayments(150, [
      payment("qr", 151, 151, false),
    ]);

    expect(result.requiresAdjustment).toBe(true);
    expect(result.invalidPaymentIds).toEqual(["qr"]);
  });

  it("bloquea ventas compuestas solo por cortesías", () => {
    const result = validateSaleCommercialComposition([
      { ...service, is_courtesy: true, courtesy_reason: "Promoción" },
    ]);

    expect(result.isValid).toBe(false);
    expect(result.reasonCode).toBe("COURTESY_ONLY_SALE");
  });

  it("limita un reward de voucher al total comercial", () => {
    const discount = getRewardDiscountPreview([service], {
      id: "entitlement-1",
      rule_id: "rule-1",
      benefit_id: "benefit-1",
      status: "available",
      earned_at: "2026-01-01T00:00:00Z",
      expires_at: null,
      notes: null,
      reward_benefits: {
        name: "Vale",
        description: null,
        benefit_type: "voucher_amount",
        service_id: null,
        product_id: null,
        voucher_amount: 200,
        discount_percent: null,
        applies_to: "all",
        max_discount_amount: null,
      },
    });

    expect(getCartTotal([service])).toBe(150);
    expect(discount).toBe(150);
  });

  it("no permite exceder el stock disponible en carrito", () => {
    const product: PosCartItem = {
      ...service,
      id: "product-1",
      item_type: "product",
      stock_quantity: 2,
      is_stockable: true,
    };

    expect(canAddProductQuantity(product, 2)).toBe(true);
    expect(canAddProductQuantity(product, 3)).toBe(false);
  });
});

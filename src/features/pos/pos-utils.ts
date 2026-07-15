import type {
  PosCartItem,
  PosPreparedPayment,
  PosPaymentReconciliation,
  PosProductRecord,
  PosRewardEntitlement,
  PosServiceRecord,
} from "@/features/pos/pos-types";

export function validateSaleCommercialComposition(items: PosCartItem[]) {
  const hasCommercialItem = items.some((item) => !item.is_courtesy && item.quantity * item.unit_price - item.discount_amount > 0);
  const hasCourtesyItems = items.some((item) => item.is_courtesy);
  return { isValid: hasCommercialItem, hasCommercialItem, hasCourtesyItems, reasonCode: hasCommercialItem ? null : "COURTESY_ONLY_SALE", message: hasCommercialItem ? null : "No puedes continuar con una venta compuesta únicamente por cortesías. Agrega al menos un servicio o producto de pago." };
}

export function reconcilePosPayments(
  total: number,
  currentPayments: PosPreparedPayment[],
): PosPaymentReconciliation {
  const normalizedTotal = Number(Math.max(total, 0).toFixed(2));
  const nonCashPayments = currentPayments.filter(
    (payment) => !payment.allows_change,
  );
  const cashPayments = currentPayments.filter(
    (payment) => payment.allows_change,
  );
  const invalidPaymentIds: string[] = [];
  let remaining = normalizedTotal;

  for (const payment of nonCashPayments) {
    if (payment.amount > remaining + 0.005) invalidPaymentIds.push(payment.id);
    remaining = Number(Math.max(remaining - payment.amount, 0).toFixed(2));
  }

  const reconciledCash = new Map<string, PosPreparedPayment>();
  for (const payment of cashPayments) {
    const appliedAmount = Number(Math.min(payment.amount, remaining).toFixed(2));
    reconciledCash.set(payment.id, {
      ...payment,
      amount: appliedAmount,
      change_amount: Number(
        Math.max(payment.tendered_amount - appliedAmount, 0).toFixed(2),
      ),
    });
    remaining = Number(Math.max(remaining - appliedAmount, 0).toFixed(2));
  }

  const payments = currentPayments.map(
    (payment) => reconciledCash.get(payment.id) ?? payment,
  ).filter((payment) => !(normalizedTotal === 0 && payment.allows_change && payment.amount === 0));
  const appliedTotal = Number(
    payments.reduce((sum, payment) => sum + payment.amount, 0).toFixed(2),
  );
  const changeAmount = Number(
    payments.reduce((sum, payment) => sum + payment.change_amount, 0).toFixed(2),
  );

  return {
    payments,
    appliedTotal,
    pendingBalance: Number(Math.max(normalizedTotal - appliedTotal, 0).toFixed(2)),
    changeAmount,
    difference: Number((appliedTotal - normalizedTotal).toFixed(2)),
    invalidPaymentIds,
    requiresAdjustment: invalidPaymentIds.length > 0,
  };
}

export function formatMoney(value: number | string) {
  const numeric = typeof value === "number" ? value : Number(value);

  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

export function formatQuantity(value: number | string) {
  const numeric = typeof value === "number" ? value : Number(value);

  return new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

export function buildServiceCartItem(service: PosServiceRecord): PosCartItem {
  return {
    id: crypto.randomUUID(),
    catalog_id: service.id,
    item_type: "service",
    name: service.name,
    description: service.description,
    category_name: service.category_name,
    quantity: 1,
    unit_price: Number(service.final_price),
    allow_custom_price: service.allow_custom_price,
    discount_amount: 0,
    is_courtesy: false,
    courtesy_reason: "",
    duration_minutes: service.duration_minutes,
  };
}

export function buildProductCartItem(product: PosProductRecord): PosCartItem {
  return buildProductCartItemWithPrice(product, Number(product.final_sale_price));
}

export function buildProductCartItemWithPrice(
  product: PosProductRecord,
  unitPrice: number,
): PosCartItem {
  return {
    id: crypto.randomUUID(),
    catalog_id: product.id,
    item_type: "product",
    name: product.name,
    description: product.description,
    category_name: product.category_name,
    quantity: 1,
    unit_price: unitPrice,
    allow_custom_price: product.allow_custom_price,
    discount_amount: 0,
    is_courtesy: false,
    courtesy_reason: "",
    stock_quantity: Number(product.stock_quantity),
    is_stockable: product.is_stockable,
  };
}

export function getItemSubtotal(item: PosCartItem) {
  if (item.is_courtesy) {
    return 0;
  }

  return Math.max(item.quantity * item.unit_price - item.discount_amount, 0);
}

export function getCartSubtotal(items: PosCartItem[]) {
  return items.reduce((accumulator, item) => accumulator + item.quantity * item.unit_price, 0);
}

export function getCartDiscountTotal(items: PosCartItem[]) {
  return items.reduce((accumulator, item) => accumulator + item.discount_amount, 0);
}

export function getCartProductNetTotal(items: PosCartItem[]) {
  return items.reduce((accumulator, item) => {
    if (item.item_type !== "product") {
      return accumulator;
    }

    return accumulator + getItemSubtotal(item);
  }, 0);
}

export function getCartCourtesyTotal(items: PosCartItem[]) {
  return items.reduce((accumulator, item) => {
    if (!item.is_courtesy) {
      return accumulator;
    }

    return accumulator + item.quantity * item.unit_price;
  }, 0);
}

export function getCartTotal(items: PosCartItem[]) {
  return items.reduce((accumulator, item) => accumulator + getItemSubtotal(item), 0);
}

export function getRewardDiscountPreview(
  items: PosCartItem[],
  reward: PosRewardEntitlement | null,
) {
  if (!reward?.reward_benefits) {
    return 0;
  }

  const benefit = reward.reward_benefits;
  const cartTotal = getCartTotal(items);

  if (cartTotal <= 0 || !benefit.benefit_type) {
    return 0;
  }

  if (benefit.benefit_type === "voucher_amount") {
    const voucherAmount = Number(benefit.voucher_amount ?? 0);
    return Math.min(Math.max(voucherAmount, 0), cartTotal);
  }

  if (benefit.benefit_type === "product_discount_percent") {
    const percent = Number(benefit.discount_percent ?? 0);
    const productTotal = getCartProductNetTotal(items);

    if (percent <= 0 || productTotal <= 0) {
      return 0;
    }

    const rawDiscount = Number(((productTotal * percent) / 100).toFixed(2));
    const maxDiscount = Number(benefit.max_discount_amount ?? rawDiscount);
    return Math.min(rawDiscount, maxDiscount, productTotal, cartTotal);
  }

  if (benefit.benefit_type === "free_service" && benefit.service_id) {
    const matchingItem = items.find(
      (item) =>
        item.item_type === "service" &&
        item.catalog_id === benefit.service_id &&
        !item.is_courtesy,
    );

    if (!matchingItem) {
      return 0;
    }

    return Math.min(matchingItem.unit_price, getItemSubtotal(matchingItem), cartTotal);
  }

  return 0;
}

export function getPreparedPaymentsTotal(payments: PosPreparedPayment[]) {
  return payments.reduce((accumulator, payment) => accumulator + payment.amount, 0);
}

export function getPreparedPaymentsTenderedTotal(payments: PosPreparedPayment[]) {
  return payments.reduce((accumulator, payment) => accumulator + payment.tendered_amount, 0);
}

export function getPreparedPaymentsChangeTotal(payments: PosPreparedPayment[]) {
  return payments.reduce((accumulator, payment) => accumulator + payment.change_amount, 0);
}

export function getPendingBalance(total: number, paidTotal: number) {
  return Math.max(total - paidTotal, 0);
}

export function getChangeAmount(total: number, paidTotal: number, preparedChangeTotal?: number) {
  if (typeof preparedChangeTotal === "number") {
    return Math.max(preparedChangeTotal, 0);
  }

  return Math.max(paidTotal - total, 0);
}

export function cartRequiresBarber(items: PosCartItem[]) {
  return items.some((item) => item.item_type === "service");
}

export function canAddProductQuantity(item: PosCartItem, nextQuantity: number) {
  if (item.item_type !== "product" || item.is_stockable !== true) {
    return true;
  }

  const available = item.stock_quantity ?? 0;
  return nextQuantity <= available;
}

export function getPaymentMethodLabel(code: string) {
  if (code === "cash") {
    return "Efectivo";
  }

  if (code === "wallet_qr") {
    return "QR billetera";
  }

  if (code === "card_pos") {
    return "POS tarjeta";
  }

  return code;
}

export function getSaleStatusLabel(status: string) {
  if (status === "draft") {
    return "Borrador";
  }

  if (status === "completed") {
    return "Completada";
  }

  if (status === "cancelled") {
    return "Anulada";
  }

  return status;
}

export function getItemTypeLabel(value: string) {
  if (value === "service") {
    return "Servicio";
  }

  if (value === "product") {
    return "Producto";
  }

  return value;
}

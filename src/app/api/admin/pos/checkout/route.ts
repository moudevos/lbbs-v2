import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  appendReservationNote,
  formatSaleReference,
  mapPosErrorMessage,
  parseMoney,
  toMoneyNumber,
  trimOrNull,
} from "@/app/api/admin/pos/route-helpers";
import { createClient } from "@/lib/supabase/server";
import { requirePosWriteSession } from "@/lib/supabase/route-auth";

type EmployeeRow = {
  id: string;
  branch_id: string | null;
  full_name: string;
  role: string;
  status: string;
};

type ReservationRow = {
  id: string;
  customer_id: string;
  branch_id: string | null;
  status: string;
};

type ServiceRow = {
  id: string;
  category_id: string | null;
  name: string;
  base_price?: number | string;
  allow_custom_price?: boolean;
  is_active: boolean;
};

type EffectiveServicePriceRow = {
  service_id: string;
  branch_id: string;
  final_price: number | string | null;
};

function isMissingServiceCustomPriceColumn(error: { code?: string; message?: string } | null | undefined) {
  return (
    error?.code === "42703" &&
    typeof error.message === "string" &&
    error.message.includes("services.allow_custom_price")
  );
}

type ProductRow = {
  id: string;
  name: string;
  cost_price: number | string;
  base_sale_price: number | string;
  allow_custom_price: boolean;
  is_stockable: boolean;
  is_courtesy_allowed: boolean;
  is_active: boolean;
};

type ProductStockRow = {
  product_id: string;
  stock_quantity: number | string | null;
  final_sale_price: number | string | null;
};

type PaymentMethodRow = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  payment_kind: "cash" | "wallet_qr" | "card" | "bank_transfer" | "other_digital" | "internal_credit";
  allows_change: boolean;
  counts_as_cash: boolean;
};

type SaleSummaryRow = {
  id: string;
  subtotal: number | string;
  discount_total: number | string;
  courtesy_total: number | string;
  total: number | string;
  paid_total: number | string;
  change_amount: number | string;
  closed_at: string | null;
  branch?: { name: string | null }[] | { name: string | null } | null;
  customer?: { full_name: string | null }[] | { full_name: string | null } | null;
  barber?: { full_name: string | null }[] | { full_name: string | null } | null;
};

type SaleItemSummaryRow = {
  id: string;
  item_type: "service" | "product";
  description_snapshot: string;
  quantity: number | string;
  unit_price: number | string;
  total: number | string;
  is_courtesy: boolean;
};

type SalePaymentSummaryRow = {
  id: string;
  amount: number | string;
  tendered_amount: number | string | null;
  change_amount: number | string;
  payment_method_id: string;
  payment_method?: { code: string | null; name: string | null }[] | { code: string | null; name: string | null } | null;
};

type IdempotencySaleRow = {
  id: string;
  status: string;
  branch_id: string;
  customer_id: string;
  barber_id: string | null;
  reservation_id: string | null;
  notes: string | null;
};

type IdempotencySaleItemRow = {
  item_type: "service" | "product";
  service_id: string | null;
  product_id: string | null;
  quantity: number | string;
  unit_price: number | string;
  discount_amount: number | string;
  is_courtesy: boolean;
  courtesy_reason: string | null;
};

type IdempotencySalePaymentRow = {
  payment_method_id: string;
  amount: number | string;
  tendered_amount: number | string | null;
  change_amount: number | string;
};

type IdempotencyRewardRedemptionRow = {
  entitlement_id: string;
  status: string;
};

type IdempotencyInternalOperationRow = {
  benefit_rule_id: string | null;
  operation_kind: "employee_benefit" | "employee_credit" | "internal_complimentary";
  authorization_reason: string | null;
};

type CheckoutSignatureInput = {
  branchId: string;
  customerId: string;
  barberId: string | null;
  reservationId: string | null;
  rewardEntitlementId: string | null;
  employeeBenefitRuleId: string | null;
  internalCredit: boolean;
  notes: string | null;
  items: Array<{
    catalogId: string;
    itemType: "service" | "product";
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    isCourtesy: boolean;
    courtesyReason: string | null;
  }>;
  payments: Array<{
    paymentMethodId: string;
    amount: number;
    tenderedAmount: number;
    changeAmount: number;
  }>;
};

function unwrapRelation<T>(value: T[] | T | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function normalizeIdempotencyKey(value: unknown) {
  const key = trimOrNull(value);
  return key && /^[a-zA-Z0-9_-]{12,128}$/.test(key) ? key : null;
}

function buildCheckoutSignature(input: CheckoutSignatureInput) {
  const items = input.items
    .map((item) => ({
      catalogId: item.catalogId,
      itemType: item.itemType,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountAmount: item.discountAmount,
      isCourtesy: item.isCourtesy,
      courtesyReason: item.isCourtesy ? item.courtesyReason : null,
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const payments = input.payments
    .map((payment) => ({
      paymentMethodId: payment.paymentMethodId,
      amount: payment.amount,
      tenderedAmount: payment.tenderedAmount,
      changeAmount: payment.changeAmount,
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

  return JSON.stringify({
    branchId: input.branchId,
    customerId: input.customerId,
    barberId: input.barberId,
    reservationId: input.reservationId,
    rewardEntitlementId: input.rewardEntitlementId,
    employeeBenefitRuleId: input.employeeBenefitRuleId,
    internalCredit: input.internalCredit,
    notes: input.notes,
    items,
    payments,
  });
}

async function loadCompletedSaleResult(
  supabase: SupabaseClient,
  saleId: string,
  fallback: { branchName: string; customerName: string; barberName: string | null; reservationId: string | null },
) {
  const [saleSummaryResult, saleItemsResult, salePaymentsResult] = await Promise.all([
    supabase
      .from("sales")
      .select(
        "id, subtotal, discount_total, courtesy_total, total, paid_total, change_amount, closed_at, branch:branches(name), customer:customers(full_name), barber:employees!sales_barber_id_fkey(full_name)",
      )
      .eq("id", saleId)
      .eq("status", "completed")
      .single(),
    supabase
      .from("sale_items")
      .select("id, item_type, description_snapshot, quantity, unit_price, total, is_courtesy")
      .eq("sale_id", saleId)
      .order("created_at", { ascending: true }),
    supabase
      .from("sale_payments")
      .select("id, amount, tendered_amount, change_amount, payment_method_id, payment_method:payment_methods(code, name)")
      .eq("sale_id", saleId)
      .order("created_at", { ascending: true }),
  ]);

  if (saleSummaryResult.error || saleItemsResult.error || salePaymentsResult.error) {
    return { error: "La venta se cerro, pero no se pudo cargar su resumen." as const };
  }

  const saleSummary = saleSummaryResult.data as SaleSummaryRow;
  const branch = unwrapRelation(saleSummary.branch);
  const customer = unwrapRelation(saleSummary.customer);
  const barber = unwrapRelation(saleSummary.barber);

  return {
    data: {
      saleId,
      saleReference: formatSaleReference(saleId),
      occurredAt: saleSummary.closed_at ?? new Date().toISOString(),
      branchName: branch?.name ?? fallback.branchName,
      customerName: customer?.full_name ?? fallback.customerName,
      barberName: barber?.full_name ?? fallback.barberName,
      reservationCompleted: Boolean(fallback.reservationId),
      items: ((saleItemsResult.data ?? []) as SaleItemSummaryRow[]).map((item) => ({
        id: item.id,
        name: item.description_snapshot,
        itemType: item.item_type,
        quantity: toMoneyNumber(item.quantity),
        unitPrice: toMoneyNumber(item.unit_price),
        total: toMoneyNumber(item.total),
        isCourtesy: item.is_courtesy,
      })),
      subtotal: toMoneyNumber(saleSummary.subtotal),
      discountTotal: toMoneyNumber(saleSummary.discount_total),
      courtesyTotal: toMoneyNumber(saleSummary.courtesy_total),
      total: toMoneyNumber(saleSummary.total),
      payments: ((salePaymentsResult.data ?? []) as SalePaymentSummaryRow[]).map((payment) => {
        const method = unwrapRelation(payment.payment_method);

        return {
          id: payment.id,
          payment_method_id: payment.payment_method_id,
          payment_method_code: method?.code ?? "cash",
          payment_method_name: method?.name ?? "Metodo",
          amount: toMoneyNumber(payment.amount),
          tendered_amount:
            payment.tendered_amount === null
              ? toMoneyNumber(payment.amount)
              : toMoneyNumber(payment.tendered_amount),
          change_amount: toMoneyNumber(payment.change_amount),
        };
      }),
      paidTotal: toMoneyNumber(saleSummary.paid_total),
      changeAmount: toMoneyNumber(saleSummary.change_amount),
    },
  };
}

async function findCompletedIdempotentSale(
  supabase: SupabaseClient,
  posSessionId: string,
  idempotencyKey: string,
  expectedSignature: string,
) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { data, error } = await supabase
      .from("sales")
      .select("id, status, branch_id, customer_id, barber_id, reservation_id, notes")
      .eq("pos_session_id", posSessionId)
      .eq("checkout_idempotency_key", idempotencyKey)
      .maybeSingle();

    if (error) {
      return { error: "No se pudo verificar el intento de venta." as const };
    }

    const sale = data as IdempotencySaleRow | null;

    if (sale?.status === "completed") {
      const [itemsResult, paymentsResult, rewardsResult, internalOperationResult] = await Promise.all([
        supabase
          .from("sale_items")
          .select("item_type, service_id, product_id, quantity, unit_price, discount_amount, is_courtesy, courtesy_reason")
          .eq("sale_id", sale.id),
        supabase
          .from("sale_payments")
          .select("payment_method_id, amount, tendered_amount, change_amount")
          .eq("sale_id", sale.id),
        supabase
          .from("reward_redemptions")
          .select("entitlement_id, status")
          .eq("sale_id", sale.id)
          .eq("status", "applied"),
        supabase
          .from("internal_pos_operations")
          .select("benefit_rule_id,operation_kind,authorization_reason")
          .eq("sale_id", sale.id)
          .maybeSingle(),
      ]);

      if (itemsResult.error || paymentsResult.error || rewardsResult.error || internalOperationResult.error) {
        return { error: "No se pudo verificar el intento de venta." as const };
      }

      const rewardRows = (rewardsResult.data ?? []) as IdempotencyRewardRedemptionRow[];
      const internalOperation = internalOperationResult.data as IdempotencyInternalOperationRow | null;
      const persistedSignature = buildCheckoutSignature({
        branchId: sale.branch_id,
        customerId: sale.customer_id,
        barberId: sale.barber_id,
        reservationId: sale.reservation_id,
        rewardEntitlementId: rewardRows[0]?.entitlement_id ?? null,
        employeeBenefitRuleId: internalOperation?.benefit_rule_id ?? null,
        internalCredit: internalOperation?.operation_kind === "employee_credit",
        notes: sale.notes,
        items: ((itemsResult.data ?? []) as IdempotencySaleItemRow[]).map((item) => ({
          catalogId: item.item_type === "service" ? item.service_id ?? "" : item.product_id ?? "",
          itemType: item.item_type,
          quantity: toMoneyNumber(item.quantity),
          unitPrice: toMoneyNumber(item.unit_price),
          discountAmount: toMoneyNumber(item.discount_amount),
          isCourtesy: item.is_courtesy,
          courtesyReason: item.is_courtesy ? trimOrNull(item.courtesy_reason) ?? "Cortesia de servicio" : null,
        })),
        payments: ((paymentsResult.data ?? []) as IdempotencySalePaymentRow[]).map((payment) => ({
          paymentMethodId: payment.payment_method_id,
          amount: toMoneyNumber(payment.amount),
          tenderedAmount:
            payment.tendered_amount === null
              ? toMoneyNumber(payment.amount)
              : toMoneyNumber(payment.tendered_amount),
          changeAmount: toMoneyNumber(payment.change_amount),
        })),
      });

      if (persistedSignature !== expectedSignature) {
        return { saleId: null, payloadMismatch: true };
      }

      return { saleId: sale.id, payloadMismatch: false };
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return { saleId: null, payloadMismatch: false };
}

function normalizeCheckoutItems(rawItems: unknown) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { error: "Agrega al menos un servicio o producto." as const };
  }

  const items = rawItems.map((rawItem) => {
    const item = rawItem as Record<string, unknown>;
    const itemType: "service" | "product" | null = item.item_type === "service" || item.item_type === "product"
      ? item.item_type
      : null;
    const quantity = parseMoney(item.quantity);
    const unitPrice = parseMoney(item.unit_price);
    const discountAmount = parseMoney(item.discount_amount) ?? 0;
    const isCourtesy = item.is_courtesy === true;

    if (!itemType || !trimOrNull(item.catalog_id) || quantity === null || unitPrice === null) {
      return null;
    }

    if (quantity <= 0 || unitPrice < 0 || discountAmount < 0) {
      return null;
    }

    const grossTotal = Number((quantity * unitPrice).toFixed(2));
    const total = isCourtesy ? 0 : Number(Math.max(grossTotal - discountAmount, 0).toFixed(2));

    return {
      catalogId: trimOrNull(item.catalog_id) as string,
      itemType,
      quantity: Number(quantity.toFixed(2)),
      unitPrice: Number(unitPrice.toFixed(2)),
      discountAmount: Number(discountAmount.toFixed(2)),
      isCourtesy,
      courtesyReason: isCourtesy ? trimOrNull(item.courtesy_reason) ?? "Cortesia de servicio" : null,
      total,
    };
  });

  if (items.some((item) => item === null)) {
    return { error: "Hay items invalidos en la venta." as const };
  }

  return { items: items as NonNullable<(typeof items)[number]>[] };
}

function normalizeCheckoutPayments(rawPayments: unknown) {
  if (!Array.isArray(rawPayments)) {
    return { error: "Los pagos enviados no son validos." as const };
  }

  if (rawPayments.length === 0) {
    return { payments: [] as Array<{
      paymentMethodId: string;
      amount: number;
      tenderedAmount: number;
      changeAmount: number;
    }> };
  }

  const payments = rawPayments.map((rawPayment) => {
    const payment = rawPayment as Record<string, unknown>;
    const paymentMethodId = trimOrNull(payment.payment_method_id);
    const amount = parseMoney(payment.amount);
    const tenderedAmount = parseMoney(payment.tendered_amount);
    const changeAmount = parseMoney(payment.change_amount) ?? 0;

    if (
      !paymentMethodId ||
      amount === null ||
      amount <= 0 ||
      tenderedAmount === null ||
      tenderedAmount <= 0 ||
      changeAmount < 0
    ) {
      return null;
    }

    return {
      paymentMethodId,
      amount: Number(amount.toFixed(2)),
      tenderedAmount: Number(tenderedAmount.toFixed(2)),
      changeAmount: Number(changeAmount.toFixed(2)),
    };
  });

  if (payments.some((payment) => payment === null)) {
    return { error: "Hay pagos invalidos en la venta." as const };
  }

  return { payments: payments as NonNullable<(typeof payments)[number]>[] };
}

export async function POST(request: Request) {
  const auth = await requirePosWriteSession();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const supabase = await createClient();
  const payload = await request.json().catch(() => null);

  const posSessionId = trimOrNull(payload?.pos_session_id);
  const branchId = trimOrNull(payload?.branch_id);
  const customerId = trimOrNull(payload?.customer_id);
  const barberId = trimOrNull(payload?.barber_id);
  const reservationId = trimOrNull(payload?.reservation_id);
  const rewardEntitlementId = trimOrNull(payload?.reward_entitlement_id);
  const employeeBenefitRuleId = trimOrNull(payload?.employee_benefit_rule_id);
  const internalCredit = payload?.internal_credit === true;
  const authorizationPin = trimOrNull(payload?.authorization_pin);
  const idempotencyKey = normalizeIdempotencyKey(payload?.idempotency_key);
  const notes = trimOrNull(payload?.notes);
  const normalizedItems = normalizeCheckoutItems(payload?.items);
  const normalizedPayments = normalizeCheckoutPayments(payload?.payments);

  if (!posSessionId || !branchId || !customerId) {
    return NextResponse.json(
      { error: "Faltan datos obligatorios para cerrar la venta." },
      { status: 400 },
    );
  }

  if (!idempotencyKey) {
    return NextResponse.json(
      { error: "No se pudo validar el intento de cierre de venta." },
      { status: 400 },
    );
  }

  if ("error" in normalizedItems) {
    return NextResponse.json({ error: normalizedItems.error }, { status: 400 });
  }

  if ("error" in normalizedPayments) {
    return NextResponse.json({ error: normalizedPayments.error }, { status: 400 });
  }

  const items = normalizedItems.items;
  const payments = normalizedPayments.payments;

  if (items.some((item) => item.isCourtesy && item.itemType !== "product")) {
    return NextResponse.json(
      { error: "Las cortesias se registran solo para productos." },
      { status: 400 },
    );
  }

  const courtesyQuantity = items
    .filter((item) => item.isCourtesy)
    .reduce((total, item) => total + item.quantity, 0);
  const chargeableServiceQuantity = items
    .filter((item) => item.itemType === "service" && !item.isCourtesy)
    .reduce((total, item) => total + item.quantity, 0);

  if (courtesyQuantity > 0 && chargeableServiceQuantity === 0) {
    return NextResponse.json(
      { error: "Las cortesias requieren al menos un servicio de pago en la venta." },
      { status: 400 },
    );
  }

  const checkoutSignature = buildCheckoutSignature({
    branchId,
    customerId,
    barberId,
    reservationId,
    rewardEntitlementId,
    employeeBenefitRuleId,
    internalCredit,
    notes,
    items,
    payments,
  });
  const requiresBarber = items.some((item) => item.itemType === "service");

  if (requiresBarber && !barberId) {
    return NextResponse.json(
      { error: "Selecciona el barbero que realizo el servicio." },
      { status: 400 },
    );
  }

  const { data: employeeId, error: employeeError } = await supabase.rpc("current_employee_id");

  if (employeeError) {
    console.error("[pos/checkout] No se pudo leer el empleado actual", {
      message: employeeError.message,
      code: employeeError.code,
    });
    return NextResponse.json(
      { error: "No se pudo validar el empleado actual." },
      { status: 500 },
    );
  }

  const { data: sessionRow, error: sessionError } = await supabase
    .from("pos_sessions")
    .select("id, branch_id, status, branch:branches(name)")
    .eq("id", posSessionId)
    .maybeSingle();

  if (sessionError) {
    console.error("[pos/checkout] No se pudo leer la sesion POS", {
      message: sessionError.message,
      code: sessionError.code,
      posSessionId,
    });
    return NextResponse.json(
      { error: "No se pudo validar la sesion POS." },
      { status: 500 },
    );
  }

  if (!sessionRow || sessionRow.branch_id !== branchId || sessionRow.status !== "open") {
    return NextResponse.json(
      { error: "La sesion POS ya esta cerrada." },
      { status: 400 },
    );
  }

  const { data: customerRow, error: customerError } = await supabase
    .from("customers")
    .select("id, full_name")
    .eq("id", customerId)
    .maybeSingle();

  if (customerError) {
    console.error("[pos/checkout] No se pudo validar el cliente", {
      message: customerError.message,
      code: customerError.code,
      customerId,
    });
    return NextResponse.json(
      { error: "No se pudo validar el cliente seleccionado." },
      { status: 500 },
    );
  }

  if (!customerRow) {
    return NextResponse.json(
      { error: "Selecciona un cliente valido antes de cerrar la venta." },
      { status: 400 },
    );
  }

  if (
    rewardEntitlementId &&
    customerRow.full_name.trim().toLowerCase() === "cliente varios"
  ) {
    return NextResponse.json(
      { error: "Cliente varios no puede usar rewards." },
      { status: 400 },
    );
  }

  let barberRow: EmployeeRow | null = null;

  if (barberId) {
    const { data, error } = await supabase
      .from("employees")
      .select("id, branch_id, full_name, role, status")
      .eq("id", barberId)
      .maybeSingle();

    if (error) {
      console.error("[pos/checkout] No se pudo validar el barbero", {
        message: error.message,
        code: error.code,
        barberId,
      });
      return NextResponse.json(
        { error: "No se pudo validar el barbero seleccionado." },
        { status: 500 },
      );
    }

    barberRow = (data as EmployeeRow | null) ?? null;

    if (
      !barberRow ||
      barberRow.role !== "barber" ||
      barberRow.status !== "active" ||
      (barberRow.branch_id && barberRow.branch_id !== branchId)
    ) {
      return NextResponse.json(
        { error: "Selecciona un barbero activo de la sede actual." },
        { status: 400 },
      );
    }
  }

  if (reservationId) {
    const { data: reservationRow, error: reservationError } = await supabase
      .from("reservations")
      .select("id, customer_id, branch_id, status")
      .eq("id", reservationId)
      .maybeSingle();

    if (reservationError) {
      console.error("[pos/checkout] No se pudo validar la reserva vinculada", {
        message: reservationError.message,
        code: reservationError.code,
        reservationId,
      });
      return NextResponse.json(
        { error: "No se pudo validar la reserva vinculada." },
        { status: 500 },
      );
    }

    const reservation = reservationRow as ReservationRow | null;

    if (!reservation) {
      return NextResponse.json(
        { error: "La reserva vinculada ya no esta disponible." },
        { status: 400 },
      );
    }

    if (reservation.customer_id !== customerId) {
      return NextResponse.json(
        { error: "La reserva vinculada no corresponde al cliente seleccionado." },
        { status: 400 },
      );
    }

    if (reservation.branch_id && reservation.branch_id !== branchId) {
      return NextResponse.json(
        { error: "La reserva vinculada pertenece a otra sede." },
        { status: 400 },
      );
    }

    if (["completed", "cancelled", "no_show"].includes(reservation.status)) {
      return NextResponse.json(
        { error: "La reserva vinculada ya no puede cerrarse desde POS." },
        { status: 400 },
      );
    }
  }

  const serviceIds = items
    .filter((item) => item.itemType === "service")
    .map((item) => item.catalogId);
  const productIds = items
    .filter((item) => item.itemType === "product")
    .map((item) => item.catalogId);

  const [
    servicesPrimaryResult,
    servicePricesResult,
    productsResult,
    paymentMethodsResult,
    stockResult,
  ] = await Promise.all([
    serviceIds.length
      ? supabase
          .from("services")
          .select("id, category_id, name, base_price, allow_custom_price, is_active")
          .in("id", serviceIds)
      : Promise.resolve({ data: [], error: null }),
    serviceIds.length
      ? supabase
          .from("vw_services_effective_prices")
          .select("service_id, branch_id, final_price")
          .eq("branch_id", branchId)
          .in("service_id", serviceIds)
      : Promise.resolve({ data: [], error: null }),
    productIds.length
      ? supabase
          .from("products")
          .select("id, name, cost_price, base_sale_price, allow_custom_price, is_stockable, is_courtesy_allowed, is_active")
          .in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
    payments.length
      ? supabase
      .from("payment_methods")
      .select("id, code, name, is_active, payment_kind, allows_change, counts_as_cash")
      .in(
        "id",
        Array.from(new Set(payments.map((payment) => payment.paymentMethodId))),
      )
      : Promise.resolve({ data: [], error: null }),
    productIds.length
      ? supabase
          .from("vw_product_stock")
          .select("product_id, stock_quantity, final_sale_price")
          .eq("branch_id", branchId)
          .in("product_id", productIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  let servicesData = (servicesPrimaryResult.data ?? []) as ServiceRow[];
  let servicesError = servicesPrimaryResult.error;

  if (servicesPrimaryResult.error && isMissingServiceCustomPriceColumn(servicesPrimaryResult.error)) {
    const fallbackServicesResult = serviceIds.length
      ? await supabase
          .from("services")
          .select("id, category_id, name, base_price, is_active")
          .in("id", serviceIds)
      : { data: [], error: null };

    servicesData = ((fallbackServicesResult.data ?? []) as Array<{
        id: string;
        name: string;
        base_price: number | string;
        is_active: boolean;
      }>).map((service) => ({
        ...service,
        allow_custom_price: false,
      })) as ServiceRow[];
    servicesError = fallbackServicesResult.error;
  }

  if (
    servicesError ||
    servicePricesResult.error ||
    productsResult.error ||
    paymentMethodsResult.error ||
    stockResult.error
  ) {
    console.error("[pos/checkout] No se pudieron validar los catalogos de la venta", {
      servicesError: servicesError?.message,
      servicePricesError: servicePricesResult.error?.message,
      productsError: productsResult.error?.message,
      paymentsError: paymentMethodsResult.error?.message,
      stockError: stockResult.error?.message,
    });
    return NextResponse.json(
      { error: "No se pudieron validar los datos de la venta." },
      { status: 500 },
    );
  }

  const servicesMap = new Map(
    servicesData.map((service) => [service.id, service]),
  );
  const servicePricesMap = new Map(
    ((servicePricesResult.data ?? []) as EffectiveServicePriceRow[]).map((row) => [row.service_id, row]),
  );
  const productsMap = new Map(
    ((productsResult.data ?? []) as ProductRow[]).map((product) => [product.id, product]),
  );
  const paymentMethodsMap = new Map(
    ((paymentMethodsResult.data ?? []) as PaymentMethodRow[]).map((method) => [method.id, method]),
  );
  const stockMap = new Map(
    ((stockResult.data ?? []) as ProductStockRow[]).map((row) => [row.product_id, row]),
  );

  for (const item of items) {
    if (item.itemType === "service") {
      const service = servicesMap.get(item.catalogId);

      if (!service || !service.is_active) {
        return NextResponse.json(
          { error: "Uno de los servicios ya no esta disponible." },
          { status: 400 },
        );
      }

      const serviceEffectivePrice = servicePricesMap.get(item.catalogId);
      const expectedPrice =
        serviceEffectivePrice?.final_price === null || serviceEffectivePrice?.final_price === undefined
          ? toMoneyNumber(service.base_price ?? 0)
          : toMoneyNumber(serviceEffectivePrice.final_price);

      if (!service.allow_custom_price && item.unitPrice !== expectedPrice) {
        return NextResponse.json(
          { error: "El precio del servicio no coincide con el catalogo actual." },
          { status: 400 },
        );
      }

      if (service.allow_custom_price && item.unitPrice <= 0) {
        return NextResponse.json(
          { error: "Ingresa el precio del item personalizado." },
          { status: 400 },
        );
      }
    }

    if (item.itemType === "product") {
      const product = productsMap.get(item.catalogId);

      if (!product || !product.is_active) {
        return NextResponse.json(
          { error: "Uno de los productos ya no esta disponible." },
          { status: 400 },
        );
      }

      const stockRow = stockMap.get(item.catalogId);
      const expectedPrice =
        stockRow?.final_sale_price === null || stockRow?.final_sale_price === undefined
          ? toMoneyNumber(product.base_sale_price)
          : toMoneyNumber(stockRow.final_sale_price);

      if (!product.allow_custom_price && item.unitPrice !== expectedPrice) {
        return NextResponse.json(
          { error: "El precio del producto no coincide con el catalogo actual." },
          { status: 400 },
        );
      }

      if (product.allow_custom_price && item.unitPrice <= 0) {
        return NextResponse.json(
          { error: "Ingresa el precio del item personalizado." },
          { status: 400 },
        );
      }
    }
  }

  for (const payment of payments) {
    const method = paymentMethodsMap.get(payment.paymentMethodId);

    if (!method || !method.is_active) {
      return NextResponse.json(
        { error: "Hay metodos de pago no disponibles en esta sesion." },
        { status: 400 },
      );
    }

    if (method.payment_kind === "internal_credit") {
      return NextResponse.json(
        { error: "El crédito de empleado solo se registra desde una operación interna autorizada." },
        { status: 400 },
      );
    }
  }

  const requestedProductQuantities = new Map<string, number>();
  for (const item of items) {
    if (item.itemType !== "product") {
      continue;
    }

    const currentQuantity = requestedProductQuantities.get(item.catalogId) ?? 0;
    requestedProductQuantities.set(item.catalogId, currentQuantity + item.quantity);
  }

  for (const [productId, requiredQuantity] of requestedProductQuantities) {
    const product = productsMap.get(productId);
    if (!product?.is_stockable) {
      continue;
    }

    const availableQuantity = toMoneyNumber(stockMap.get(productId)?.stock_quantity);
    if (availableQuantity < requiredQuantity) {
      return NextResponse.json(
        { error: "Stock insuficiente para uno o mas productos." },
        { status: 400 },
      );
    }
  }

  const subtotal = Number(
    items.reduce((accumulator, item) => accumulator + item.quantity * item.unitPrice, 0).toFixed(2),
  );
  const discountTotal = Number(
    items.reduce((accumulator, item) => accumulator + item.discountAmount, 0).toFixed(2),
  );
  const courtesyTotal = Number(
    items.reduce((accumulator, item) => {
      if (!item.isCourtesy) {
        return accumulator;
      }

      return accumulator + item.quantity * item.unitPrice;
    }, 0).toFixed(2),
  );
  const total = Number(items.reduce((accumulator, item) => accumulator + item.total, 0).toFixed(2));
  const paidTotal = Number(
    payments.reduce((accumulator, payment) => accumulator + payment.amount, 0).toFixed(2),
  );
  const saleChangeAmount = Number(
    payments.reduce((accumulator, payment) => accumulator + payment.changeAmount, 0).toFixed(2),
  );

  const hasCashPayment = payments.some((payment) => {
    const method = paymentMethodsMap.get(payment.paymentMethodId);
    return method?.allows_change === true;
  });

  for (const payment of payments) {
    const method = paymentMethodsMap.get(payment.paymentMethodId);
    const allowsChange = method?.allows_change === true;

    if (allowsChange) {
      if (payment.tenderedAmount < payment.amount) {
        return NextResponse.json(
          { error: "El efectivo recibido no puede ser menor al monto aplicado." },
          { status: 400 },
        );
      }

      if (Number((payment.tenderedAmount - payment.amount).toFixed(2)) !== payment.changeAmount) {
        return NextResponse.json(
          { error: "El vuelto del pago en efectivo no coincide con el monto recibido." },
          { status: 400 },
        );
      }
    } else if (payment.changeAmount > 0 || payment.tenderedAmount !== payment.amount) {
      return NextResponse.json(
        {
          error: "El excedente solo puede registrarse como vuelto cuando hay pago en efectivo.",
        },
        { status: 400 },
      );
    }
  }

  if (saleChangeAmount > 0 && !hasCashPayment) {
    return NextResponse.json(
      {
        error: "El excedente solo puede registrarse como vuelto cuando hay pago en efectivo.",
      },
      { status: 400 },
    );
  }

  // La parte que cambia el estado financiero vive en una única RPC. PostgreSQL
  // revierte toda la llamada si falla un item, reward, pago, stock o cierre.
  const atomicItems = items.map((item) => {
    const product = item.itemType === "product" ? productsMap.get(item.catalogId) : null;
    const service = item.itemType === "service" ? servicesMap.get(item.catalogId) : null;
    const courtesyAmount = item.isCourtesy
      ? Number((item.quantity * item.unitPrice).toFixed(2))
      : null;

    return {
      item_type: item.itemType,
      service_id: item.itemType === "service" ? item.catalogId : null,
      product_id: item.itemType === "product" ? item.catalogId : null,
      description_snapshot: service?.name ?? product?.name ?? "Item POS",
      quantity: item.quantity,
      unit_price: item.unitPrice,
      discount_amount: item.discountAmount,
      total: item.total,
      cost_snapshot: product ? toMoneyNumber(product.cost_price) : null,
      barber_id: item.itemType === "service" ? barberId : null,
      is_courtesy: item.isCourtesy,
      courtesy_reason: item.isCourtesy ? item.courtesyReason : null,
      original_unit_price: item.isCourtesy ? item.unitPrice : null,
      original_total: courtesyAmount,
      courtesy_amount: courtesyAmount,
    };
  });

  const atomicPayments = payments.map((payment) => ({
    payment_method_id: payment.paymentMethodId,
    amount: payment.amount,
    tendered_amount: payment.tenderedAmount,
    change_amount: payment.changeAmount,
  }));

  try {
    const { data: atomicSaleId, error: atomicCheckoutError } = await supabase.rpc(
      "checkout_pos_sale",
      {
        p_payload: {
          pos_session_id: posSessionId,
          branch_id: branchId,
          customer_id: customerId,
          barber_id: barberId,
          reservation_id: reservationId,
          reward_entitlement_id: rewardEntitlementId,
          employee_benefit_rule_id: employeeBenefitRuleId,
          internal_credit: internalCredit,
          authorization_pin: authorizationPin,
          idempotency_key: idempotencyKey,
          notes,
          subtotal,
          discount_total: discountTotal,
          courtesy_total: courtesyTotal,
          total,
          paid_total: paidTotal,
          change_amount: saleChangeAmount,
          items: atomicItems,
          payments: atomicPayments,
        },
      },
    );

    if (atomicCheckoutError?.code === "23505") {
      const existingSale = await findCompletedIdempotentSale(
        supabase,
        posSessionId,
        idempotencyKey,
        checkoutSignature,
      );
      if ("error" in existingSale) {
        return NextResponse.json({ error: existingSale.error }, { status: 500 });
      }
      if (existingSale.saleId) {
        const result = await loadCompletedSaleResult(supabase, existingSale.saleId, {
          branchName: unwrapRelation(sessionRow.branch)?.name ?? "Sin sede",
          customerName: customerRow.full_name,
          barberName: barberRow?.full_name ?? null,
          reservationId,
        });
        return "error" in result
          ? NextResponse.json({ error: result.error }, { status: 500 })
          : NextResponse.json({ data: result.data });
      }
      return NextResponse.json(
        { error: existingSale.payloadMismatch ? "La clave de cierre ya fue usada con datos diferentes." : "Este cierre de venta sigue en proceso. Intenta nuevamente." },
        { status: existingSale.payloadMismatch ? 409 : 409 },
      );
    }

    if (atomicCheckoutError || !atomicSaleId) {
      throw new Error(atomicCheckoutError?.message ?? "No se pudo completar la venta.");
    }

    const completedSaleId = atomicSaleId as string;
    try {
      await appendReservationNote(
        supabase,
        reservationId,
        employeeId ?? null,
        `Venta ${formatSaleReference(completedSaleId)} completada desde POS.`,
      );
    } catch (error) {
      console.warn("[pos/checkout] La venta fue completada, pero no se pudo registrar la nota de reserva", {
        saleId: completedSaleId,
        message: error instanceof Error ? error.message : "Error inesperado",
      });
    }

    const result = await loadCompletedSaleResult(supabase, completedSaleId, {
      branchName: unwrapRelation(sessionRow.branch)?.name ?? "Sin sede",
      customerName: customerRow.full_name,
      barberName: barberRow?.full_name ?? null,
      reservationId,
    });
    return "error" in result
      ? NextResponse.json({ error: result.error }, { status: 500 })
      : NextResponse.json({ data: result.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    console.error("[pos/checkout] Error atómico al cerrar la venta", {
      posSessionId,
      branchId,
      customerId,
      message,
    });
    return NextResponse.json({ error: mapPosErrorMessage(message) }, { status: 400 });
  }

  /* Implementación histórica conservada temporalmente como referencia de
     compatibilidad; el retorno anterior hace que ya no se ejecute.
  let createdSaleId: string | null = null;
  let saleCompleted = false;

  try {
    const { data: insertedSale, error: saleInsertError } = await supabase
      .from("sales")
      .insert({
        pos_session_id: posSessionId,
        branch_id: branchId,
        customer_id: customerId,
        reservation_id: reservationId,
        barber_id: barberId,
        status: "draft",
        subtotal,
        discount_total: discountTotal,
        courtesy_total: courtesyTotal,
        total,
        paid_total: paidTotal,
        change_amount: saleChangeAmount,
        checkout_idempotency_key: idempotencyKey,
        notes,
        created_by: employeeId ?? null,
      })
      .select("id")
      .single();

    if (saleInsertError?.code === "23505") {
      const existingSale = await findCompletedIdempotentSale(
        supabase,
        posSessionId,
        idempotencyKey,
        checkoutSignature,
      );

      if ("error" in existingSale) {
        return NextResponse.json({ error: existingSale.error }, { status: 500 });
      }

      if (existingSale.saleId) {
        const result = await loadCompletedSaleResult(supabase, existingSale.saleId, {
          branchName: unwrapRelation(sessionRow.branch)?.name ?? "Sin sede",
          customerName: customerRow.full_name,
          barberName: barberRow?.full_name ?? null,
          reservationId,
        });
        if ("error" in result) {
          return NextResponse.json({ error: result.error }, { status: 500 });
        }
        return NextResponse.json({ data: result.data });
      }

      if (existingSale.payloadMismatch) {
        return NextResponse.json(
          { error: "La clave de cierre ya fue usada con datos diferentes." },
          { status: 409 },
        );
      }

      return NextResponse.json(
        { error: "Este cierre de venta sigue en proceso. Intenta nuevamente." },
        { status: 409 },
      );
    }

    if (saleInsertError || !insertedSale) {
      console.error("[pos/checkout] No se pudo crear la venta borrador", {
        message: saleInsertError?.message,
        code: saleInsertError?.code,
      });
      return NextResponse.json(
        { error: "No se pudo preparar la venta para cierre." },
        { status: 500 },
      );
    }

    createdSaleId = insertedSale.id;

    const saleItemsPayload = items.map((item) => {
      const product = item.itemType === "product" ? productsMap.get(item.catalogId) : null;
      const service = item.itemType === "service" ? servicesMap.get(item.catalogId) : null;

      return {
        sale_id: createdSaleId,
        item_type: item.itemType,
        service_id: item.itemType === "service" ? item.catalogId : null,
        product_id: item.itemType === "product" ? item.catalogId : null,
        description_snapshot: service?.name ?? product?.name ?? "Item POS",
        quantity: item.quantity,
        unit_price: item.unitPrice,
        discount_amount: item.discountAmount,
        total: item.total,
        cost_snapshot: product ? toMoneyNumber(product.cost_price) : null,
        barber_id: item.itemType === "service" ? barberId : null,
        is_courtesy: item.isCourtesy,
        courtesy_reason: item.isCourtesy ? item.courtesyReason : null,
        courtesy_rule_id: null,
        courtesy_rule_name_snapshot: null,
        original_unit_price: item.isCourtesy ? item.unitPrice : null,
        original_total: item.isCourtesy ? Number((item.quantity * item.unitPrice).toFixed(2)) : null,
        courtesy_amount: item.isCourtesy ? Number((item.quantity * item.unitPrice).toFixed(2)) : null,
        courtesy_authorized_by: item.isCourtesy ? employeeId ?? null : null,
      };
    });

    const { error: itemsInsertError } = await supabase
      .from("sale_items")
      .insert(saleItemsPayload);

    if (itemsInsertError) {
      throw new Error(itemsInsertError.message);
    }

    if (rewardEntitlementId) {
      const { data: rewardSale, error: rewardError } = await supabase.rpc("apply_reward_to_sale", {
        p_sale_id: createdSaleId,
        p_entitlement_id: rewardEntitlementId,
      });

      if (rewardError || !rewardSale) {
        throw new Error(rewardError?.message ?? "No se pudo aplicar el reward.");
      }
    }

    const { data: recalculatedSale, error: recalculatedSaleError } = await supabase
      .from("sales")
      .select("id, total")
      .eq("id", createdSaleId)
      .single();

    if (recalculatedSaleError || !recalculatedSale) {
      throw new Error(
        recalculatedSaleError?.message ?? "No se pudo recalcular la venta antes del cobro.",
      );
    }

    const finalSaleTotal = toMoneyNumber(recalculatedSale.total);
    let remainingBalance = finalSaleTotal;

    const paymentsForValidation = [...payments].sort((left, right) => {
      const leftCash = paymentMethodsMap.get(left.paymentMethodId)?.allows_change === true;
      const rightCash = paymentMethodsMap.get(right.paymentMethodId)?.allows_change === true;
      return Number(leftCash) - Number(rightCash);
    });

    for (const payment of paymentsForValidation) {
      const method = paymentMethodsMap.get(payment.paymentMethodId);
      const paymentKind = method?.payment_kind ?? "other_digital";

      if (!method?.allows_change && payment.amount > remainingBalance) {
        throw new Error(
          paymentKind === "card"
            ? "El pago con POS tarjeta no puede exceder el saldo pendiente."
            : "El pago QR no puede exceder el saldo pendiente.",
        );
      }

      remainingBalance = Number(Math.max(remainingBalance - payment.amount, 0).toFixed(2));
    }

    if (paidTotal < finalSaleTotal) {
      throw new Error("El monto pagado no cubre el total.");
    }

    if (paidTotal > finalSaleTotal) {
      throw new Error(
        hasCashPayment
          ? "Revisa los pagos registrados para que coincidan con el total final despues del reward."
          : "Los pagos aplicados no pueden superar el total de la venta.",
      );
    }

    const salePaymentsPayload = payments.map((payment) => ({
      sale_id: createdSaleId,
      payment_method_id: payment.paymentMethodId,
      amount: payment.amount,
      tendered_amount: payment.tenderedAmount,
      change_amount: payment.changeAmount,
    }));

    if (salePaymentsPayload.length > 0) {
      const { error: paymentsInsertError } = await supabase
        .from("sale_payments")
        .insert(salePaymentsPayload);

      if (paymentsInsertError) {
        throw new Error(paymentsInsertError.message);
      }
    }

    const { data: completedSale, error: completeSaleError } = await supabase.rpc("complete_sale", {
      p_sale_id: createdSaleId,
    });

    if (completeSaleError || !completedSale) {
      throw new Error(completeSaleError?.message ?? "No se pudo completar la venta.");
    }

    saleCompleted = true;
    if (!createdSaleId) {
      throw new Error("No se pudo identificar la venta completada.");
    }

    const completedSaleId = createdSaleId;

    await appendReservationNote(
      supabase,
      reservationId,
      employeeId ?? null,
      `Venta ${formatSaleReference(completedSaleId)} completada desde POS.`,
    );

    const result = await loadCompletedSaleResult(supabase, completedSaleId, {
      branchName: unwrapRelation(sessionRow.branch)?.name ?? "Sin sede",
      customerName: customerRow.full_name,
      barberName: barberRow?.full_name ?? null,
      reservationId,
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ data: result.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";

    if (createdSaleId && !saleCompleted) {
      const { error: itemsCleanupError } = await supabase
        .from("sale_items")
        .delete()
        .eq("sale_id", createdSaleId);
      const { error: paymentsCleanupError } = await supabase
        .from("sale_payments")
        .delete()
        .eq("sale_id", createdSaleId);
      const { error: saleCleanupError } = await supabase.from("sales").delete().eq("id", createdSaleId);
      const cleanupError = itemsCleanupError ?? paymentsCleanupError ?? saleCleanupError;

      if (cleanupError) {
        console.error("[pos/checkout] No se pudo limpiar la venta fallida", {
          saleId: createdSaleId,
          message: cleanupError.message,
          code: cleanupError.code,
        });
      }
    }

    console.error("[pos/checkout] Error al cerrar la venta", {
      posSessionId,
      branchId,
      customerId,
      message,
    });
    return NextResponse.json(
      { error: mapPosErrorMessage(message) },
      { status: 400 },
    );
  }
  */
}

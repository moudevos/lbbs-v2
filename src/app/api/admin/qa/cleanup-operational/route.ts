import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/supabase/route-auth";

function qaWritesAreEnabled() {
  return (
    process.env.QA_ALLOW_WRITES === "true" &&
    process.env.QA_RESET_CONFIRMED === "true"
  );
}

function isRunId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{8}$/i.test(value);
}

function errorResponse(message: string, details?: { code?: string; message?: string }) {
  console.error("[qa/cleanup-operational] Error al limpiar datos QA", {
    message: details?.message ?? message,
    code: details?.code,
  });
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: Request) {
  const auth = await requireAdminSession();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  if (auth.role !== "owner" || !qaWritesAreEnabled()) {
    return NextResponse.json({ error: "Recurso no disponible." }, { status: 404 });
  }

  const payload = await request.json().catch(() => null);
  const runId = payload?.runId;

  if (!isRunId(runId)) {
    return NextResponse.json({ error: "Identificador de ejecucion QA invalido." }, { status: 400 });
  }

  const marker = `QA_TEST_DATA ${runId}`;
  const admin = getSupabaseAdmin();
  const counters = {
    branches: 0,
    employees: 0,
    customers: 0,
    products: 0,
    services: 0,
    paymentMethods: 0,
    sales: 0,
    sessions: 0,
  };

  const [branchesResult, employeesResult, customersResult, productsResult, servicesResult, paymentMethodsResult] =
    await Promise.all([
      admin.from("branches").select("id").ilike("name", `%${marker}%`),
      admin.from("employees").select("id, user_id").ilike("full_name", `%${marker}%`),
      admin.from("customers").select("id").ilike("full_name", `%${marker}%`),
      admin.from("products").select("id").ilike("name", `%${marker}%`),
      admin.from("services").select("id").ilike("name", `%${marker}%`),
      admin.from("payment_methods").select("id").ilike("name", `%${marker}%`),
    ]);

  const lookupError =
    branchesResult.error ??
    employeesResult.error ??
    customersResult.error ??
    productsResult.error ??
    servicesResult.error ??
    paymentMethodsResult.error;

  if (lookupError) {
    return errorResponse("No se pudieron identificar los datos QA a limpiar.", lookupError);
  }

  const branchIds = (branchesResult.data ?? []).map((row) => row.id);
  const employeeIds = (employeesResult.data ?? []).map((row) => row.id);
  const customerIds = (customersResult.data ?? []).map((row) => row.id);
  const productIds = (productsResult.data ?? []).map((row) => row.id);
  const serviceIds = (servicesResult.data ?? []).map((row) => row.id);
  const paymentMethodIds = (paymentMethodsResult.data ?? []).map((row) => row.id);
  const authUserIds = (employeesResult.data ?? [])
    .flatMap((row) => (row.user_id ? [row.user_id] : []));

  const salesResult = branchIds.length
    ? await admin.from("sales").select("id").in("branch_id", branchIds)
    : { data: [], error: null };
  const sessionsResult = branchIds.length
    ? await admin.from("pos_sessions").select("id").in("branch_id", branchIds)
    : { data: [], error: null };
  const reservationsResult = branchIds.length
    ? await admin.from("reservations").select("id").in("branch_id", branchIds)
    : { data: [], error: null };

  const operationalLookupError =
    salesResult.error ?? sessionsResult.error ?? reservationsResult.error;

  if (operationalLookupError) {
    return errorResponse("No se pudieron identificar las operaciones QA a limpiar.", operationalLookupError);
  }

  const saleIds = (salesResult.data ?? []).map((row) => row.id);
  const sessionIds = (sessionsResult.data ?? []).map((row) => row.id);
  const reservationIds = (reservationsResult.data ?? []).map((row) => row.id);

  if (saleIds.length) {
    const [snapshots, redemptions, serviceProduction, productProduction] = await Promise.all([
      admin.from("sale_document_snapshots").delete().in("sale_id", saleIds),
      admin.from("reward_redemptions").delete().in("sale_id", saleIds),
      admin.from("employee_service_production").delete().in("sale_id", saleIds),
      admin.from("employee_product_bonus_entries").delete().in("sale_id", saleIds),
    ]);
    const derivedError = snapshots.error ?? redemptions.error ?? serviceProduction.error ?? productProduction.error;
    if (derivedError) {
      return errorResponse("No se pudieron limpiar los derivados de ventas QA.", derivedError);
    }

    const { error: itemsDeleteError } = await admin.from("sale_items").delete().in("sale_id", saleIds);
    if (itemsDeleteError) {
      return errorResponse("No se pudieron limpiar los items QA.", itemsDeleteError);
    }

    const { error: paymentsDeleteError } = await admin.from("sale_payments").delete().in("sale_id", saleIds);
    if (paymentsDeleteError) {
      return errorResponse("No se pudieron limpiar los pagos QA.", paymentsDeleteError);
    }

    const { error: salesDeleteError } = await admin.from("sales").delete().in("id", saleIds);
    if (salesDeleteError) {
      return errorResponse("No se pudieron eliminar las ventas QA.", salesDeleteError);
    }
    counters.sales = saleIds.length;
  }

  if (customerIds.length) {
    const [redemptions, entitlements, ledger] = await Promise.all([
      admin.from("reward_redemptions").delete().in("customer_id", customerIds),
      admin.from("customer_reward_entitlements").delete().in("customer_id", customerIds),
      admin.from("customer_reward_ledger").delete().in("customer_id", customerIds),
    ]);
    const error = redemptions.error ?? entitlements.error ?? ledger.error;
    if (error) {
      return errorResponse("No se pudieron limpiar los rewards QA.", error);
    }
  }

  if (reservationIds.length) {
    const { error } = await admin.from("reservations").delete().in("id", reservationIds);
    if (error) {
      return errorResponse("No se pudieron eliminar las reservas QA.", error);
    }
  }

  if (sessionIds.length) {
    const { error: cashError } = await admin.from("cash_movements").delete().in("pos_session_id", sessionIds);
    if (cashError) {
      return errorResponse("No se pudieron eliminar los movimientos de caja QA.", cashError);
    }

    const { error: sessionError } = await admin.from("pos_sessions").delete().in("id", sessionIds);
    if (sessionError) {
      return errorResponse("No se pudieron eliminar las sesiones POS QA.", sessionError);
    }
    counters.sessions = sessionIds.length;
  }

  if (branchIds.length || productIds.length) {
    let movementQuery = admin.from("stock_movements").delete();
    if (branchIds.length) {
      movementQuery = movementQuery.in("branch_id", branchIds);
    } else {
      movementQuery = movementQuery.in("product_id", productIds);
    }
    const { error } = await movementQuery;
    if (error) {
      return errorResponse("No se pudieron eliminar los movimientos de stock QA.", error);
    }
  }

  if (customerIds.length) {
    const { error } = await admin.from("customers").delete().in("id", customerIds);
    if (error) {
      return errorResponse("No se pudieron eliminar los clientes QA.", error);
    }
    counters.customers = customerIds.length;
  }

  if (productIds.length) {
    const { error } = await admin.from("products").delete().in("id", productIds);
    if (error) {
      return errorResponse("No se pudieron eliminar los productos QA.", error);
    }
    counters.products = productIds.length;
  }

  if (serviceIds.length) {
    const { error } = await admin.from("services").delete().in("id", serviceIds);
    if (error) {
      return errorResponse("No se pudieron eliminar los servicios QA.", error);
    }
    counters.services = serviceIds.length;
  }

  if (paymentMethodIds.length) {
    const { error } = await admin.from("payment_methods").delete().in("id", paymentMethodIds);
    if (error) {
      return errorResponse("No se pudieron eliminar los metodos de pago QA.", error);
    }
    counters.paymentMethods = paymentMethodIds.length;
  }

  for (const userId of authUserIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      return errorResponse("No se pudieron eliminar los accesos QA.", error);
    }
  }

  if (employeeIds.length) {
    const { error } = await admin.from("employees").delete().in("id", employeeIds);
    if (error) {
      return errorResponse("No se pudieron eliminar los empleados QA.", error);
    }
    counters.employees = employeeIds.length;
  }

  if (branchIds.length) {
    const { error } = await admin.from("branches").delete().in("id", branchIds);
    if (error) {
      return errorResponse("No se pudieron eliminar las sedes QA.", error);
    }
    counters.branches = branchIds.length;
  }

  return NextResponse.json({ data: counters });
}

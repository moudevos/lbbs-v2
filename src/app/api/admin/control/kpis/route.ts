import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const number = (value: number | string | null | undefined) => Number(value ?? 0);

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return NextResponse.json({ error: "Sesion no iniciada." }, { status: 401 });

  const [{ data: role, error: roleError }, { data: employee, error: employeeError }] = await Promise.all([
    supabase.rpc("current_user_role"),
    supabase.from("employees").select("branch_id").eq("user_id", userData.user.id).maybeSingle(),
  ]);
  if (roleError || employeeError || !role) {
    const error = roleError ?? employeeError;
    console.error("[control/kpis] Error al validar contexto", { message: error?.message, code: error?.code, details: error?.details, hint: error?.hint });
    return NextResponse.json({ error: "No se pudo cargar el panel operativo." }, { status: 500 });
  }

  const params = new URL(request.url).searchParams;
  const requestedBranchId = params.get("branchId")?.trim() ?? "";
  const branchId = role === "owner" || role === "admin" ? requestedBranchId : employee?.branch_id ?? "";
  const isDate = (value: string | null): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  const dateFrom = isDate(params.get("dateFrom")) ? params.get("dateFrom")! : today;
  const dateTo = isDate(params.get("dateTo")) ? params.get("dateTo")! : dateFrom;
  const start = new Date(`${dateFrom}T00:00:00-05:00`);
  const end = new Date(`${dateTo}T23:59:59.999-05:00`);
  let salesQuery = supabase.from("sales").select("id, branch_id, status, total, discount_total, courtesy_total, closed_at").gte("closed_at", start.toISOString()).lte("closed_at", end.toISOString());
  let itemsQuery = supabase.from("sale_items").select("item_type, quantity, sale:sales!inner(branch_id, status, closed_at)").eq("sale.status", "completed").gte("sale.closed_at", start.toISOString()).lte("sale.closed_at", end.toISOString());
  let paymentsQuery = supabase.from("sale_payments").select("amount, payment_method:payment_methods(code,name,sort_order,payment_kind), sale:sales!inner(branch_id, status, closed_at)").eq("sale.status", "completed").gte("sale.closed_at", start.toISOString()).lte("sale.closed_at", end.toISOString());
  let internalQuery = supabase.from("internal_pos_operations").select("operation_kind,retail_amount,discount_amount,credit_amount,sale:sales!inner(branch_id,status,closed_at)").eq("sale.status", "completed").gte("sale.closed_at", start.toISOString()).lte("sale.closed_at", end.toISOString());
  let sessionsQuery = supabase.from("pos_sessions").select("id, branch_id, status, branch:branches(name)").eq("status", "open");
  if (branchId) { salesQuery = salesQuery.eq("branch_id", branchId); itemsQuery = itemsQuery.eq("sale.branch_id", branchId); paymentsQuery = paymentsQuery.eq("sale.branch_id", branchId); internalQuery = internalQuery.eq("sale.branch_id", branchId); sessionsQuery = sessionsQuery.eq("branch_id", branchId); }
  const [salesResult, itemsResult, paymentsResult, internalResult, sessionsResult] = await Promise.all([salesQuery, itemsQuery, paymentsQuery, internalQuery, sessionsQuery]);
  // Durante un despliegue escalonado el frontend puede llegar antes que la
  // migración 128. El control sigue operativo y muestra ceros internos hasta
  // que la tabla sea expuesta por PostgREST; cualquier otro error se reporta.
  const internalUnavailable = internalResult.error?.code === "PGRST205" || internalResult.error?.code === "42P01";
  const error = salesResult.error ?? itemsResult.error ?? paymentsResult.error ?? (internalUnavailable ? null : internalResult.error) ?? sessionsResult.error;
  if (error) {
    console.error("[control/kpis] Error al consolidar KPIs", { message: error.message, code: error.code, details: error.details, hint: error.hint, branchId });
    return NextResponse.json({ error: "No se pudieron cargar los indicadores." }, { status: 500 });
  }
  const sales = salesResult.data ?? [];
  const completed = sales.filter((sale) => sale.status === "completed");
  const completedTotal = completed.reduce((sum, sale) => sum + number(sale.total), 0);
  const paymentTotals = new Map<string, { code: string; name: string; sortOrder: number; total: number }>();
  for (const payment of paymentsResult.data ?? []) {
    const method = Array.isArray(payment.payment_method) ? payment.payment_method[0] : payment.payment_method;
    // El crédito interno registra una venta e inventario, pero no representa dinero cobrado.
    if (!method?.code || method.payment_kind === "internal_credit") continue;
    const current = paymentTotals.get(method.code) ?? {
      code: method.code,
      name: method.name ?? method.code,
      sortOrder: Number(method.sort_order ?? 0),
      total: 0,
    };
    current.total += number(payment.amount);
    paymentTotals.set(method.code, current);
  }
  const serviceItems = (itemsResult.data ?? []).filter((item) => item.item_type === "service");
  const productItems = (itemsResult.data ?? []).filter((item) => item.item_type === "product");
  const internal = (internalUnavailable ? [] : internalResult.data ?? []).reduce((accumulator, operation) => {
    const retail = number(operation.retail_amount); const discount = number(operation.discount_amount); const credit = number(operation.credit_amount);
    if (operation.operation_kind === "employee_credit") accumulator.employeeCredit += credit;
    if (operation.operation_kind === "internal_complimentary") { accumulator.complimentaryRetail += retail; accumulator.complimentaryDiscount += discount; }
    if (operation.operation_kind === "employee_benefit") { accumulator.benefitRetail += retail; accumulator.benefitDiscount += discount; }
    return accumulator;
  }, { employeeCredit: 0, complimentaryRetail: 0, complimentaryDiscount: 0, benefitRetail: 0, benefitDiscount: 0 });
  const financial = role === "owner" || role === "admin" || role === "reception";
  return NextResponse.json({
    role,
    financial,
    metrics: {
      netSales: financial ? completedTotal : null,
      completedSales: completed.length,
      cancelledSales: sales.filter((sale) => sale.status === "cancelled").length,
      averageTicket: financial && completed.length ? completedTotal / completed.length : null,
      discounts: financial ? completed.reduce((sum, sale) => sum + number(sale.discount_total), 0) : null,
      courtesies: financial ? completed.reduce((sum, sale) => sum + number(sale.courtesy_total), 0) : null,
      services: serviceItems.reduce((sum, item) => sum + number(item.quantity), 0),
      products: productItems.reduce((sum, item) => sum + number(item.quantity), 0),
    },
    paymentMethods: financial
      ? [...paymentTotals.values()]
          .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "es"))
          .map(({ code, name, total }) => ({ code, name, total }))
      : [],
    range: { dateFrom, dateTo },
    internal: financial ? internal : { employeeCredit: 0, complimentaryRetail: 0, complimentaryDiscount: 0, benefitRetail: 0, benefitDiscount: 0 },
    sessions: (sessionsResult.data ?? []).map((session) => ({ id: session.id, branchName: (Array.isArray(session.branch) ? session.branch[0] : session.branch)?.name ?? "Sede", status: session.status })),
  });
}

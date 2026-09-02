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
  // Un admin asignado a una sede conserva siempre ese alcance, incluso si la
  // URL trae manualmente otra sede. Solo owner (o admin sin sede) puede verlas todas.
  const assignedBranchId = employee?.branch_id ?? "";
  const branchId = role === "owner" || (role === "admin" && !assignedBranchId) ? requestedBranchId : assignedBranchId;
  const isDate = (value: string | null): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  const dateFrom = isDate(params.get("dateFrom")) ? params.get("dateFrom")! : today;
  const dateTo = isDate(params.get("dateTo")) ? params.get("dateTo")! : dateFrom;
  let salesQuery = supabase.from("sales").select("id, branch_id, pos_session_id, status, subtotal, total, paid_total, discount_total, courtesy_total, accounting_date, pos_session:pos_sessions(status), branch:branches(name)").gte("accounting_date", dateFrom).lte("accounting_date", dateTo);
  let itemsQuery = supabase.from("sale_items").select("item_type, quantity, unit_price, total, sale:sales!inner(branch_id, status, accounting_date)").eq("sale.status", "completed").gte("sale.accounting_date", dateFrom).lte("sale.accounting_date", dateTo);
  let paymentsQuery = supabase.from("sale_payments").select("amount, payment_method:payment_methods(code,name,sort_order,payment_kind), sale:sales!inner(branch_id, status, accounting_date, pos_session:pos_sessions(status))").eq("sale.status", "completed").gte("sale.accounting_date", dateFrom).lte("sale.accounting_date", dateTo);
  let internalQuery = supabase.from("internal_pos_operations").select("operation_kind,retail_amount,discount_amount,credit_amount,sale:sales!inner(branch_id,status,accounting_date)").eq("sale.status", "completed").gte("sale.accounting_date", dateFrom).lte("sale.accounting_date", dateTo);
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
  let branchesQuery = supabase.from("branches").select("id,name").eq("is_active", true).order("name");
  let dailySessionsQuery = supabase.from("pos_sessions").select("id,branch_id,status,business_date,branch:branches(name)").gte("business_date", dateFrom).lte("business_date", dateTo);
  let productionQuery = supabase.from("employee_service_production").select("branch_id,operational_contribution_amount,sale:sales!inner(status,accounting_date,pos_session:pos_sessions!inner(status))").eq("status", "active").eq("sale.status", "completed").eq("sale.pos_session.status", "closed").gte("sale.accounting_date", dateFrom).lte("sale.accounting_date", dateTo);
  let rewardsQuery = supabase.from("reward_redemptions").select("discount_amount,sale:sales!inner(branch_id,status,accounting_date)").eq("status", "applied").eq("sale.status", "completed").gte("sale.accounting_date", dateFrom).lte("sale.accounting_date", dateTo);
  if (branchId) {
    branchesQuery = branchesQuery.eq("id", branchId);
    dailySessionsQuery = dailySessionsQuery.eq("branch_id", branchId);
    productionQuery = productionQuery.eq("branch_id", branchId);
    rewardsQuery = rewardsQuery.eq("sale.branch_id", branchId);
  }
  const [branchesResult, dailySessionsResult, productionResult, rewardsResult] = await Promise.all([branchesQuery, dailySessionsQuery, productionQuery, rewardsQuery]);
  const reconciliationError = branchesResult.error ?? dailySessionsResult.error ?? productionResult.error ?? rewardsResult.error;
  if (reconciliationError) {
    console.error("[control/kpis] Error al cargar conciliación", { message: reconciliationError.message, code: reconciliationError.code, branchId });
    return NextResponse.json({ error: "No se pudo cargar la conciliación diaria." }, { status: 500 });
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
  const reconciliation = new Map<string, { id: string; branchName: string; statuses: string[]; grossSales: number; serviceGross: number; otherGross: number; rewardsCount: number; rewardsAmount: number; operationalContribution: number; closingTotal: number }>();
  for (const branch of branchesResult.data ?? []) reconciliation.set(branch.id, { id: branch.id, branchName: branch.name, statuses: [], grossSales: 0, serviceGross: 0, otherGross: 0, rewardsCount: 0, rewardsAmount: 0, operationalContribution: 0, closingTotal: 0 });
  for (const sale of completed) {
    const item = reconciliation.get(sale.branch_id); if (!item) continue;
    item.grossSales += number(sale.subtotal);
  }
  for (const saleItem of itemsResult.data ?? []) {
    const sale = Array.isArray(saleItem.sale) ? saleItem.sale[0] : saleItem.sale;
    const item = reconciliation.get(sale?.branch_id ?? ""); if (!item) continue;
    const lineGross = number(saleItem.quantity) * number(saleItem.unit_price);
    if (saleItem.item_type === "service") item.serviceGross += lineGross; else item.otherGross += lineGross;
  }
  for (const payment of paymentsResult.data ?? []) {
    const sale = Array.isArray(payment.sale) ? payment.sale[0] : payment.sale;
    const method = Array.isArray(payment.payment_method) ? payment.payment_method[0] : payment.payment_method;
    const item = reconciliation.get(sale?.branch_id ?? "");
    const session = Array.isArray(sale?.pos_session) ? sale?.pos_session[0] : sale?.pos_session;
    if (item && method?.payment_kind !== "internal_credit" && session?.status === "closed") item.closingTotal += number(payment.amount);
  }
  for (const production of productionResult.data ?? []) {
    const item = reconciliation.get(production.branch_id); if (item) item.operationalContribution += number(production.operational_contribution_amount);
  }
  for (const reward of rewardsResult.data ?? []) {
    const sale = Array.isArray(reward.sale) ? reward.sale[0] : reward.sale;
    const item = reconciliation.get(sale?.branch_id ?? ""); if (item) { item.rewardsCount += 1; item.rewardsAmount += number(reward.discount_amount); }
  }
  for (const session of dailySessionsResult.data ?? []) {
    const item = reconciliation.get(session.branch_id); if (item) item.statuses.push(session.status);
  }
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
    branchReconciliations: role === "owner" || role === "admin" ? [...reconciliation.values()].map((item) => ({ ...item, sessionStatus: item.statuses.includes("open") ? "open" : item.statuses.includes("pending_close") ? "pending_close" : item.statuses.includes("closed") ? "closed" : "without_session" })) : [],
  });
}

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

  const requestedBranchId = new URL(request.url).searchParams.get("branchId")?.trim() ?? "";
  const branchId = role === "owner" || role === "admin" ? requestedBranchId : employee?.branch_id ?? "";
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setHours(23, 59, 59, 999);
  let salesQuery = supabase.from("sales").select("id, branch_id, status, total, discount_total, courtesy_total, closed_at").gte("created_at", start.toISOString()).lte("created_at", end.toISOString());
  let itemsQuery = supabase.from("sale_items").select("item_type, quantity, sale:sales!inner(branch_id, status, created_at)").eq("sale.status", "completed").gte("sale.created_at", start.toISOString()).lte("sale.created_at", end.toISOString());
  let paymentsQuery = supabase.from("sale_payments").select("amount, payment_method:payment_methods(code), sale:sales!inner(branch_id, status, created_at)").eq("sale.status", "completed").gte("sale.created_at", start.toISOString()).lte("sale.created_at", end.toISOString());
  let sessionsQuery = supabase.from("pos_sessions").select("id, branch_id, status, branch:branches(name)").eq("status", "open");
  if (branchId) { salesQuery = salesQuery.eq("branch_id", branchId); itemsQuery = itemsQuery.eq("sale.branch_id", branchId); paymentsQuery = paymentsQuery.eq("sale.branch_id", branchId); sessionsQuery = sessionsQuery.eq("branch_id", branchId); }
  const [salesResult, itemsResult, paymentsResult, sessionsResult] = await Promise.all([salesQuery, itemsQuery, paymentsQuery, sessionsQuery]);
  const error = salesResult.error ?? itemsResult.error ?? paymentsResult.error ?? sessionsResult.error;
  if (error) {
    console.error("[control/kpis] Error al consolidar KPIs", { message: error.message, code: error.code, details: error.details, hint: error.hint, branchId });
    return NextResponse.json({ error: "No se pudieron cargar los indicadores." }, { status: 500 });
  }
  const sales = salesResult.data ?? [];
  const completed = sales.filter((sale) => sale.status === "completed");
  const completedTotal = completed.reduce((sum, sale) => sum + number(sale.total), 0);
  const paymentTotals = { cash: 0, wallet: 0, card: 0 };
  for (const payment of paymentsResult.data ?? []) {
    const method = Array.isArray(payment.payment_method) ? payment.payment_method[0] : payment.payment_method;
    if (method?.code === "cash") paymentTotals.cash += number(payment.amount);
    if (method?.code === "wallet_qr") paymentTotals.wallet += number(payment.amount);
    if (method?.code === "card_pos") paymentTotals.card += number(payment.amount);
  }
  const serviceItems = (itemsResult.data ?? []).filter((item) => item.item_type === "service");
  const productItems = (itemsResult.data ?? []).filter((item) => item.item_type === "product");
  const financial = role === "owner" || role === "admin" || role === "reception";
  return NextResponse.json({
    role,
    financial,
    metrics: {
      netSales: financial ? completedTotal : null,
      completedSales: completed.length,
      cancelledSales: sales.filter((sale) => sale.status === "cancelled").length,
      averageTicket: financial && completed.length ? completedTotal / completed.length : null,
      cash: financial ? paymentTotals.cash : null,
      wallet: financial ? paymentTotals.wallet : null,
      card: financial ? paymentTotals.card : null,
      discounts: financial ? completed.reduce((sum, sale) => sum + number(sale.discount_total), 0) : null,
      courtesies: financial ? completed.reduce((sum, sale) => sum + number(sale.courtesy_total), 0) : null,
      services: serviceItems.reduce((sum, item) => sum + number(item.quantity), 0),
      products: productItems.reduce((sum, item) => sum + number(item.quantity), 0),
    },
    sessions: (sessionsResult.data ?? []).map((session) => ({ id: session.id, branchName: (Array.isArray(session.branch) ? session.branch[0] : session.branch)?.name ?? "Sede", status: session.status })),
  });
}

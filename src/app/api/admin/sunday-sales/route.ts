import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireTeamBranchSession } from "@/lib/supabase/route-auth";

function sundayIso(date = new Date()) {
  const local = new Date(date.toLocaleString("en-US", { timeZone: "America/Lima" }));
  local.setDate(local.getDate() - local.getDay());
  return local.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const auth = await requireTeamBranchSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  if (!["owner", "admin", "reception"].includes(auth.role)) return NextResponse.json({ error: "No tienes permisos para ventas dominicales." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const requestedBranchId = params.get("branchId") || "";
  const requestedDate = params.get("businessDate") || sundayIso();
  const branchId = auth.role === "reception" ? auth.branchId || "" : requestedBranchId;
  const supabase = await createClient();
  const [branches, employees, customers, services, products, paymentMethods, settings] = await Promise.all([
    auth.role === "reception" ? supabase.from("branches").select("id,name").eq("id", branchId).eq("is_active", true) : supabase.from("branches").select("id,name").eq("is_active", true).order("name"),
    branchId ? supabase.from("employees").select("id,full_name,branch_id").eq("branch_id", branchId).eq("status", "active").order("full_name") : supabase.from("employees").select("id,full_name,branch_id").eq("status", "active").order("full_name"),
    supabase.from("customers").select("id,full_name,document_number,phone").eq("is_active", true).order("full_name").limit(500),
    supabase.from("services").select("id,name,base_price").eq("is_active", true).order("name"),
    supabase.from("products").select("id,name,base_sale_price,is_courtesy_allowed").eq("is_active", true).in("visibility_scope", ["pos", "both"]).order("name"),
    supabase.from("payment_methods").select("id,name").eq("is_active", true).neq("payment_kind", "internal_credit").order("sort_order"),
    supabase.from("sunday_sales_settings").select("default_commission_rate").eq("id", true).maybeSingle(),
  ]);
  const baseError = branches.error ?? employees.error ?? customers.error ?? services.error ?? products.error ?? paymentMethods.error ?? settings.error;
  if (baseError) return NextResponse.json({ error: "No se pudo cargar la jornada dominical." }, { status: 500 });
  const dayResult = branchId ? await supabase.from("sunday_sales_days").select("*").eq("branch_id", branchId).eq("business_date", requestedDate).maybeSingle() : { data: null, error: null };
  if (dayResult.error) {
    console.error("[sunday-sales/get] No se pudo cargar la jornada", { message: dayResult.error.message, code: dayResult.error.code });
    return NextResponse.json({ error: "No se pudo cargar la jornada dominical. Verifica que la migración 165 esté instalada." }, { status: 500 });
  }
  const day = dayResult.data;
  const [sales, settlements] = day ? await Promise.all([
    supabase.from("sunday_sales").select("id,customer:customers!sunday_sales_customer_id_fkey(full_name),barber:employees!sunday_sales_barber_id_fkey(full_name),subtotal,courtesy_total,total,paid_total,status,created_at,items:sunday_sale_items(description_snapshot,item_type,quantity,unit_price,total,is_courtesy),payments:sunday_sale_payments(amount,payment_method:payment_methods!sunday_sale_payments_payment_method_id_fkey(name))").eq("sunday_day_id", day.id).order("created_at", { ascending: false }),
    supabase.from("sunday_barber_settlements").select("id,employee:employees!sunday_barber_settlements_employee_id_fkey(full_name),status,commission_rate,service_gross_total,operational_contribution_total,commissionable_base_total,payout_amount,paid_at,payment_method:payment_methods!sunday_barber_settlements_payment_method_id_fkey(name)").eq("sunday_day_id", day.id).order("created_at"),
  ]) : [{ data: [] }, { data: [] }];
  if (sales.error || settlements.error) {
    const error = sales.error ?? settlements.error;
    console.error("[sunday-sales/get] No se pudieron cargar registros", { message: error?.message, code: error?.code });
    return NextResponse.json({ error: "No se pudieron cargar las ventas de la jornada. Verifica que la migración 165 esté instalada." }, { status: 500 });
  }
  return NextResponse.json({ branches: branches.data ?? [], employees: employees.data ?? [], customers: customers.data ?? [], services: services.data ?? [], products: products.data ?? [], paymentMethods: paymentMethods.data ?? [], defaultCommissionRate: Number(settings.data?.default_commission_rate ?? 60), selectedDate: requestedDate, day: day ?? null, sales: sales.data ?? [], settlements: settlements.data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireTeamBranchSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const body = await request.json().catch(() => null);
  const supabase = await createClient();
  let result;
  if (body?.action === "open") result = await supabase.rpc("open_sunday_sales_day", { p_branch_id: body.branchId, p_business_date: body.businessDate });
  else if (body?.action === "rate") result = await supabase.rpc("set_sunday_sales_day_commission_rate", { p_day_id: body.dayId, p_commission_rate: Number(body.commissionRate) });
  else if (body?.action === "sale") result = await supabase.rpc("register_sunday_sale", { p_day_id: body.dayId, p_customer_id: body.customerId, p_barber_id: body.barberId, p_items: body.items ?? [], p_payments: body.payments ?? [], p_notes: body.notes || null });
  else if (body?.action === "prepare") result = await supabase.rpc("prepare_sunday_settlements", { p_day_id: body.dayId });
  else if (body?.action === "pay") result = await supabase.rpc("pay_sunday_settlement", { p_settlement_id: body.settlementId, p_payment_method_id: body.paymentMethodId, p_reference: body.reference || null, p_notes: body.notes || null });
  else if (body?.action === "close") result = await supabase.rpc("close_sunday_sales_day", { p_day_id: body.dayId, p_notes: body.notes || null });
  else return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
  if (result.error) return NextResponse.json({ error: result.error.message || "No se pudo completar la operación." }, { status: 400 });
  return NextResponse.json({ data: result.data });
}

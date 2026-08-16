import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const supabase = await createClient();
  const { data: businessDate, error: businessDateError } = await supabase.rpc("pos_business_date");
  if (businessDateError || !businessDate) {
    console.error("[settlements/get] Error al obtener fecha operativa", { message: businessDateError?.message });
    return NextResponse.json({ error: "No se pudo determinar la fecha operativa.", code: "BUSINESS_DATE_ERROR" }, { status: 500 });
  }
  const { error: ensurePeriodError } = await supabase.rpc("get_or_create_payroll_period", { p_date: businessDate });
  if (ensurePeriodError) {
    console.error("[settlements/get] Error al asegurar periodo actual", { message: ensurePeriodError.message, code: ensurePeriodError.code, details: ensurePeriodError.details, hint: ensurePeriodError.hint });
    return NextResponse.json({ error: "No se pudo preparar el periodo actual.", code: "PAYROLL_PERIOD_ERROR" }, { status: 500 });
  }
  const [settlements, periods, employees, debts, methods, sessions] = await Promise.all([
    supabase.from("employee_settlements").select("*, employee:employees!employee_settlements_employee_id_fkey(full_name, document_number, position), branch:branches(name), period:payroll_periods(start_date,end_date,period_half), payment_method:payment_methods(name)").order("created_at", { ascending: false }),
    supabase.from("payroll_periods").select("id,start_date,end_date,status,period_half").neq("status", "cancelled").order("start_date", { ascending: false }),
    supabase.from("employees").select("id,full_name,branch_id,document_number,position").eq("status", "active").order("full_name"),
    supabase.from("employee_debts").select("id,employee_id,debt_type,outstanding_amount,description,status").in("status", ["pending", "partial"]),
    supabase.from("payment_methods").select("id,code,name").eq("is_active", true).order("sort_order"),
    supabase.from("pos_sessions").select("id,branch_id,business_date").eq("status", "open"),
  ]);
  const error = settlements.error ?? periods.error ?? employees.error ?? debts.error ?? methods.error ?? sessions.error;
  if (error) {
    console.error("[settlements/get] Error al cargar liquidaciones", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      branchId: null,
      periodId: null,
    });
    return NextResponse.json(
      { error: "No se pudieron cargar las liquidaciones.", code: "SETTLEMENTS_LOAD_ERROR" },
      { status: 500 },
    );
  }
  return NextResponse.json({ data: settlements.data ?? [], periods: periods.data ?? [], employees: employees.data ?? [], debts: debts.data ?? [], paymentMethods: methods.data ?? [], openSessions: sessions.data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const payload = await request.json().catch(() => null);
  if (!payload?.periodId || !payload?.employeeId || !Number.isFinite(Number(payload.commissionRate))) {
    return NextResponse.json({ error: "Periodo, empleado y porcentaje son obligatorios." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("prepare_employee_settlement", {
    p_period_id: payload.periodId,
    p_employee_id: payload.employeeId,
    p_commission_rate: Number(payload.commissionRate),
    p_debt_deductions: payload.debtDeductions ?? [],
    p_notes: payload.notes || null,
    p_high_rate_note: payload.highRateNote || null,
  });
  if (error) {
    console.error("[settlements/post] Error al preparar liquidacion", { message: error.message, code: error.code });
    return NextResponse.json({ error: error.message.includes("60") ? "Un porcentaje mayor a 60 % requiere una observacion de autorizacion." : "No se pudo preparar la liquidacion." }, { status: 400 });
  }
  return NextResponse.json({ data });
}

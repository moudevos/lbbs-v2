import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";

export async function GET(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employeeId")?.trim() || null;

  if (searchParams.get("includeCurrent") === "true") {
    const { data: businessDate, error: businessDateError } = await supabase.rpc("pos_business_date");
    if (businessDateError || !businessDate) {
      console.error("[payroll-periods/get] Error al obtener fecha operativa", { message: businessDateError?.message });
      return NextResponse.json({ error: "No se pudo determinar la fecha operativa." }, { status: 500 });
    }
    const { error } = await supabase.rpc("get_or_create_payroll_period", { p_date: businessDate });
    if (error) {
      console.error("[payroll-periods/get] Error al asegurar periodo actual", { message: error.message, code: error.code, details: error.details, hint: error.hint });
      return NextResponse.json({ error: "No se pudo preparar el periodo actual." }, { status: 500 });
    }
  }

  const { data, error } = await supabase.from("payroll_periods").select("id,start_date,end_date,status,period_half").neq("status", "cancelled").order("start_date", { ascending: false });
  if (error) {
    console.error("[payroll-periods/get] Error al cargar periodos", { message: error.message, code: error.code, details: error.details, hint: error.hint, employeeId });
    return NextResponse.json({ error: "No se pudieron cargar los periodos." }, { status: 500 });
  }
  if (!employeeId) return NextResponse.json({ data: data ?? [] });
  const { data: settlements, error: settlementsError } = await supabase.from("employee_settlements").select("payroll_period_id").eq("employee_id", employeeId).neq("status", "cancelled");
  if (settlementsError) {
    console.error("[payroll-periods/get] Error al validar liquidaciones", { message: settlementsError.message, code: settlementsError.code, details: settlementsError.details, hint: settlementsError.hint, employeeId });
    return NextResponse.json({ error: "No se pudieron validar los periodos del empleado." }, { status: 500 });
  }
  const unavailable = new Set((settlements ?? []).map((item) => item.payroll_period_id));
  return NextResponse.json({ data: (data ?? []).filter((period) => !unavailable.has(period.id)) });
}

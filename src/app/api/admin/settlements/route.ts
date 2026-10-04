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
    console.error("[settlements/get] Error al asegurar periodo actual", { message: ensurePeriodError.message, code: ensurePeriodError.code });
    return NextResponse.json({ error: "No se pudo preparar el periodo actual.", code: "PAYROLL_PERIOD_ERROR" }, { status: 500 });
  }

  const [settlements, periods, employees, debts, methods, compensationTerms] = await Promise.all([
    supabase.from("employee_settlements").select("*, employee:employees!employee_settlements_employee_id_fkey(full_name, document_number, position), branch:branches(name), period:payroll_periods(start_date,end_date,period_half), payment_method:payment_methods(name)").or("cancellation_reason_code.is.null,cancellation_reason_code.neq.DRAFT_DISCARDED").order("created_at", { ascending: false }),
    supabase.from("payroll_periods").select("id,start_date,end_date,status,period_half").neq("status", "cancelled").order("start_date", { ascending: false }),
    supabase.from("employees").select("id,full_name,branch_id,document_number,position").eq("status", "active").order("full_name"),
    supabase.from("employee_debts").select("id,employee_id,debt_type,outstanding_amount,description,status,created_at").in("status", ["pending", "partial"]).order("created_at"),
    supabase.from("payment_methods").select("id,code,name,payment_kind").eq("is_active", true).order("sort_order"),
    supabase.from("employee_compensation_terms").select("employee_id,compensation_mode,base_monthly_salary,mandatory_discount_enabled,mandatory_discount_rate,effective_from,effective_to,compensation_policy_version").eq("is_active", true).order("effective_from", { ascending: false }),
  ]);
  const error = settlements.error ?? periods.error ?? employees.error ?? debts.error ?? methods.error ?? compensationTerms.error;
  if (error) {
    console.error("[settlements/get] Error al cargar liquidaciones", { message: error.message, code: error.code, details: error.details, hint: error.hint });
    return NextResponse.json({ error: "No se pudieron cargar las liquidaciones.", code: "SETTLEMENTS_LOAD_ERROR" }, { status: 500 });
  }

  const businessDateValue = String(businessDate);
  const businessDateAtMidnight = new Date(`${businessDateValue}T00:00:00`);
  const activeSettlements = (settlements.data ?? [])
    .filter((item) => ["draft", "review", "approved"].includes(item.status))
    .map((item) => ({ key: `${item.payroll_period_id}:${item.employee_id}`, status: item.status, settlementNumber: item.settlement_number }));
  const currentPeriodIds = (periods.data ?? [])
    .filter((period) => {
      const start = new Date(`${period.start_date}T00:00:00`);
      const end = new Date(`${period.end_date}T00:00:00`);
      const graceEnd = new Date(end);
      graceEnd.setDate(graceEnd.getDate() + 2);
      return businessDateAtMidnight >= start && businessDateAtMidnight <= graceEnd;
    })
    .map((period) => period.id);

  return NextResponse.json({
    data: settlements.data ?? [], periods: periods.data ?? [], employees: employees.data ?? [], debts: debts.data ?? [],
    paymentMethods: methods.data ?? [], compensationTerms: compensationTerms.data ?? [], businessDate: businessDateValue, currentPeriodIds, activeSettlements,
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const payload = await request.json().catch(() => null);
  if (!payload?.periodId || !payload?.employeeId || (payload.commissionRate !== undefined && payload.commissionRate !== "" && !Number.isFinite(Number(payload.commissionRate)))) {
    return NextResponse.json({ error: "Periodo y empleado son obligatorios; el porcentaje aplica solo a perfiles por comisión." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: existingSettlement, error: existingSettlementError } = await supabase
    .from("employee_settlements")
    .select("id,status,settlement_number")
    .eq("payroll_period_id", payload.periodId)
    .eq("employee_id", payload.employeeId)
    .in("status", ["draft", "review", "approved"])
    .maybeSingle();
  if (existingSettlementError) {
    console.error("[settlements/post] Error al validar liquidacion activa", { message: existingSettlementError.message, code: existingSettlementError.code });
    return NextResponse.json({ error: "No se pudo validar el estado de liquidación del empleado." }, { status: 500 });
  }
  if (existingSettlement) {
    return NextResponse.json({
      error: existingSettlement.status === "paid"
        ? "El empleado ya tiene una liquidación pagada en este período y no puede recalcularse."
        : "El empleado ya tiene una liquidación activa. Anúlala antes de recalcular.",
      code: "ACTIVE_SETTLEMENT_EXISTS",
    }, { status: 409 });
  }

  const { error: productionError } = await supabase.rpc("generate_production_for_period", {
    p_period_id: payload.periodId,
    p_branch_id: null,
  });
  if (productionError) {
    console.error("[settlements/post] Error al recalcular producción", { message: productionError.message, code: productionError.code });
    return NextResponse.json({ error: "No se pudo recalcular la producción cerrada antes de liquidar." }, { status: 400 });
  }

  const debtDeductions = Array.isArray(payload.debtDeductions)
    ? payload.debtDeductions.filter(
      (item: unknown) => item && typeof item === "object" && Number((item as Record<string, unknown>).amount) > 0,
    )
    : [];
  const normalizedDebtDeductions = debtDeductions.map((item: Record<string, unknown>) => ({
    debt_id: item.debt_id ?? item.debtId,
    amount: Number(item.amount),
  }));
  const { data, error } = await supabase.rpc("prepare_employee_settlement_v193", {
    p_period_id: payload.periodId,
    p_employee_id: payload.employeeId,
    p_commission_rate: payload.commissionRate === undefined || payload.commissionRate === "" ? null : Number(payload.commissionRate),
    p_debt_deductions: normalizedDebtDeductions,
    p_notes: payload.notes || null,
  });
  if (error) {
    console.error("[settlements/post] Error al preparar liquidacion", { message: error.message, code: error.code });
    if (!error.message.includes("60")) {
      return NextResponse.json({
        error: "No se pudo crear la liquidación. Inténtalo nuevamente o revisa la producción del período.",
        code: error.code,
      }, { status: 400 });
    }
    return NextResponse.json({
      error: error.message.includes("60") ? "Un porcentaje mayor a 60 % requiere una observación de autorización." : error.message,
    }, { status: 400 });
  }
  return NextResponse.json({ data });
}

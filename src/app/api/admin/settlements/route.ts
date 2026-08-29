import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";

type DebtDeduction = { debt_id: string; amount: number };

function numeric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

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
  const [settlements, periods, employees, debts, methods] = await Promise.all([
    supabase.from("employee_settlements").select("*, employee:employees!employee_settlements_employee_id_fkey(full_name, document_number, position), branch:branches(name), period:payroll_periods(start_date,end_date,period_half), payment_method:payment_methods(name)").order("created_at", { ascending: false }),
    supabase.from("payroll_periods").select("id,start_date,end_date,status,period_half").neq("status", "cancelled").order("start_date", { ascending: false }),
    supabase.from("employees").select("id,full_name,branch_id,document_number,position").eq("status", "active").order("full_name"),
    supabase.from("employee_debts").select("id,employee_id,debt_type,outstanding_amount,description,status,created_at").in("status", ["pending", "partial"]).order("created_at"),
    supabase.from("payment_methods").select("id,code,name,payment_kind").eq("is_active", true).order("sort_order"),
  ]);
  const error = settlements.error ?? periods.error ?? employees.error ?? debts.error ?? methods.error;
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
  const businessDateValue = String(businessDate);
  const businessDateAtMidnight = new Date(`${businessDateValue}T00:00:00`);
  const activeSettlementKeys = (settlements.data ?? [])
    .filter((item) => item.status !== "cancelled")
    .map((item) => `${item.payroll_period_id}:${item.employee_id}`);
  const currentPeriodIds = (periods.data ?? [])
    .filter((period) => {
      const start = new Date(`${period.start_date}T00:00:00`);
      const end = new Date(`${period.end_date}T00:00:00`);
      const graceEnd = new Date(end);
      graceEnd.setDate(graceEnd.getDate() + 2);
      return businessDateAtMidnight >= start && businessDateAtMidnight <= graceEnd;
    })
    .map((period) => period.id);
  return NextResponse.json({ data: settlements.data ?? [], periods: periods.data ?? [], employees: employees.data ?? [], debts: debts.data ?? [], paymentMethods: methods.data ?? [], businessDate: businessDateValue, currentPeriodIds, activeSettlementKeys });
}

export async function POST(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const payload = await request.json().catch(() => null);
  if (!payload?.periodId || !payload?.employeeId || !Number.isFinite(Number(payload.commissionRate))) {
    return NextResponse.json({ error: "Periodo, empleado y porcentaje son obligatorios." }, { status: 400 });
  }
  const supabase = await createClient();
  // La liquidación es el punto de cierre del cálculo: refresca primero las
  // ventas de sesiones POS cerradas. El botón de Producción queda como una
  // revisión manual, nunca como requisito para poder liquidar.
  const { error: productionError } = await supabase.rpc("generate_production_for_period", {
    p_period_id: payload.periodId,
    p_branch_id: null,
  });
  if (productionError) {
    console.error("[settlements/post] Error al recalcular producción", { message: productionError.message, code: productionError.code });
    return NextResponse.json({ error: "No se pudo recalcular la producción cerrada antes de liquidar." }, { status: 400 });
  }
  const manualDebtDeductions = Array.isArray(payload.debtDeductions)
    ? payload.debtDeductions
      .map((item: unknown): DebtDeduction => {
        const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return { debt_id: String(row.debt_id ?? ""), amount: numeric(row.amount) };
      })
      .filter((item: DebtDeduction) => item.debt_id && item.amount > 0)
    : [];
  let debtDeductions = manualDebtDeductions;

  // Si no se indicó un monto manual, se descuentan automáticamente las
  // deudas vigentes más antiguas hasta el máximo de la ganancia del período.
  if (!debtDeductions.length) {
    const [production, bonuses, activeDebts] = await Promise.all([
      supabase
        .from("employee_service_production")
        .select("commissionable_amount,fixed_commission_amount,production_source,sale:sales!inner(pos_session:pos_sessions!inner(status))")
        .eq("payroll_period_id", payload.periodId)
        .eq("employee_id", payload.employeeId)
        .eq("status", "active")
        .eq("sale.pos_session.status", "closed"),
      supabase
        .from("employee_product_bonus_entries")
        .select("total_bonus_amount,sale:sales!inner(pos_session:pos_sessions!inner(status))")
        .eq("payroll_period_id", payload.periodId)
        .eq("employee_id", payload.employeeId)
        .eq("status", "active")
        .eq("sale.pos_session.status", "closed"),
      supabase
        .from("employee_debts")
        .select("id,outstanding_amount,created_at")
        .eq("employee_id", payload.employeeId)
        .in("status", ["pending", "partial"])
        .order("created_at", { ascending: true }),
    ]);
    const lookupError = production.error ?? bonuses.error ?? activeDebts.error;
    if (lookupError) {
      console.error("[settlements/post] Error al planificar descuento de deuda", { message: lookupError.message, code: lookupError.code });
      return NextResponse.json({ error: "No se pudieron calcular las deudas vigentes de la liquidación." }, { status: 500 });
    }
    const base = (production.data ?? []).reduce((total, line) => total + numeric(line.commissionable_amount), 0);
    const fixed = (production.data ?? []).reduce((total, line) => total + (
      ["reward", "courtesy", "employee_benefit"].includes(String(line.production_source))
        ? numeric(line.fixed_commission_amount)
        : 0
    ), 0);
    const bonusTotal = (bonuses.data ?? []).reduce((total, line) => total + numeric(line.total_bonus_amount), 0);
    let availableForDebt = Math.max(base * numeric(payload.commissionRate) / 100 + fixed + bonusTotal, 0);
    debtDeductions = (activeDebts.data ?? []).flatMap((debt) => {
      const amount = Math.min(availableForDebt, numeric(debt.outstanding_amount));
      availableForDebt -= amount;
      return amount > 0 ? [{ debt_id: debt.id, amount: Math.round(amount * 100) / 100 }] : [];
    });
  }
  const { data, error } = await supabase.rpc("prepare_employee_settlement", {
    p_period_id: payload.periodId,
    p_employee_id: payload.employeeId,
    p_commission_rate: Number(payload.commissionRate),
    p_debt_deductions: debtDeductions,
    p_notes: payload.notes || null,
    p_high_rate_note: payload.highRateNote || null,
  });
  if (error) {
    console.error("[settlements/post] Error al preparar liquidacion", { message: error.message, code: error.code });
    return NextResponse.json({ error: error.message.includes("60") ? "Un porcentaje mayor a 60 % requiere una observacion de autorizacion." : "No se pudo preparar la liquidacion." }, { status: 400 });
  }
  return NextResponse.json({ data });
}

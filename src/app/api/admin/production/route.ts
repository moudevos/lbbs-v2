import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";

export async function GET(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  let periodId = searchParams.get("periodId")?.trim() ?? "";
  const branchId = searchParams.get("branchId")?.trim() ?? "";
  const employeeId = searchParams.get("employeeId")?.trim() ?? "";
  const source = searchParams.get("source")?.trim() ?? "";

  let { data: periods, error: periodsError } = await supabase
    .from("payroll_periods")
    .select("id, period_year, period_month, period_half, start_date, end_date, status")
    .order("start_date", { ascending: false });

  if (!periodsError && (periods?.length ?? 0) === 0) {
    const { error: createPeriodError } = await supabase.rpc("get_or_create_payroll_period", {
      p_date: new Date().toISOString().slice(0, 10),
    });
    if (!createPeriodError) {
      const refreshed = await supabase.from("payroll_periods").select("id, period_year, period_month, period_half, start_date, end_date, status").order("start_date", { ascending: false });
      periods = refreshed.data;
      periodsError = refreshed.error;
    }
  }

  if (periodsError) {
    console.error("[production/get] Error al listar periodos", { message: periodsError.message, code: periodsError.code });
    return NextResponse.json({ error: "No se pudieron cargar los periodos." }, { status: 500 });
  }

  if (!periodId) {
    const current = (periods ?? []).find((period) => {
      const today = new Date().toISOString().slice(0, 10);
      return period.start_date <= today && period.end_date >= today;
    });
    periodId = current?.id ?? periods?.[0]?.id ?? "";
  }

  let productionQuery = supabase
    .from("employee_service_production")
    .select("id, payroll_period_id, employee_id, branch_id, sale_id, production_date, production_source, quantity, original_unit_price, original_line_total, commercial_discount_amount, reward_discount_amount, courtesy_discount_amount, collected_amount, operational_contribution_amount, commissionable_amount, fixed_commission_amount, status, reversed_at, reversed_reason, employee:employees(full_name), branch:branches(name), service:services(name), sale:sales(status,cancelled_at,cancelled_reason)")
    .eq("payroll_period_id", periodId)
    .order("production_date", { ascending: false });
  if (branchId) productionQuery = productionQuery.eq("branch_id", branchId);
  if (employeeId) productionQuery = productionQuery.eq("employee_id", employeeId);
  if (source) productionQuery = productionQuery.eq("production_source", source);

  let bonusesQuery = supabase
    .from("employee_product_bonus_entries")
    .select("id, payroll_period_id, employee_id, branch_id, sale_id, sale_item_id, quantity, unit_bonus_amount, total_bonus_amount, status, employee:employees(full_name), branch:branches(name), product:products(name), sale_item:sale_items(description_snapshot, total)")
    .eq("payroll_period_id", periodId);
  if (branchId) bonusesQuery = bonusesQuery.eq("branch_id", branchId);
  if (employeeId) bonusesQuery = bonusesQuery.eq("employee_id", employeeId);

  let debtsQuery = supabase
    .from("employee_debts")
    .select("id, employee_id, branch_id, outstanding_amount, status")
    .in("status", ["pending", "partial"]);
  if (branchId) debtsQuery = debtsQuery.eq("branch_id", branchId);
  if (employeeId) debtsQuery = debtsQuery.eq("employee_id", employeeId);

  const [productionResult, bonusesResult, branchesResult, employeesResult, settlementsResult, debtsResult] = await Promise.all([
    productionQuery,
    bonusesQuery,
    supabase.from("branches").select("id, name").eq("is_active", true).order("name"),
    supabase.from("employees").select("id, full_name, branch_id").eq("status", "active").order("full_name"),
    supabase.from("employee_settlements").select("id, employee_id, commission_rate, percentage_commission_total, status").eq("payroll_period_id", periodId).neq("status", "cancelled"),
    debtsQuery,
  ]);

  const error = productionResult.error ?? bonusesResult.error ?? branchesResult.error ?? employeesResult.error ?? settlementsResult.error ?? debtsResult.error;
  if (error) {
    console.error("[production/get] Error al cargar produccion", { message: error.message, code: error.code });
    return NextResponse.json({ error: "No se pudo cargar la produccion." }, { status: 500 });
  }

  return NextResponse.json({
    data: productionResult.data ?? [],
    bonuses: bonusesResult.data ?? [],
    debts: debtsResult.data ?? [],
    settlements: settlementsResult.data ?? [],
    filters: { periods: periods ?? [], branches: branchesResult.data ?? [], employees: employeesResult.data ?? [] },
    selectedPeriodId: periodId,
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const payload = await request.json().catch(() => null);
  if (!payload?.periodId) return NextResponse.json({ error: "Selecciona un periodo." }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_production_for_period", {
    p_period_id: payload.periodId,
    p_branch_id: payload.branchId || null,
  });
  if (error) {
    console.error("[production/post] Error al generar produccion", { message: error.message, code: error.code });
    return NextResponse.json({ error: "No se pudo generar la produccion del periodo." }, { status: 400 });
  }
  return NextResponse.json({ data });
}

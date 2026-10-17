import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";

type SaleRelation =
  | {
      id?: string;
      status?: string;
      accounting_date?: string;
      barber_id?: string | null;
      closed_by?: string | null;
    }
  | Array<{
      id?: string;
      status?: string;
      accounting_date?: string;
      barber_id?: string | null;
      closed_by?: string | null;
    }>
  | null;

const relationOne = <T,>(value: T | T[] | null | undefined) =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

const numeric = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function GET(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });

  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employeeId")?.trim() ?? "";
  let periodId = searchParams.get("periodId")?.trim() ?? "";

  const [{ data: businessDate, error: businessDateError }, employeesResult, periodsResult] =
    await Promise.all([
      supabase.rpc("pos_business_date"),
      supabase
        .from("employees")
        .select("id,full_name,branch_id")
        .eq("status", "active")
        .order("full_name"),
      supabase
        .from("payroll_periods")
        .select("id,start_date,end_date,status")
        .order("start_date", { ascending: false }),
    ]);

  const initialError =
    businessDateError ?? employeesResult.error ?? periodsResult.error;
  if (initialError || !businessDate) {
    console.error("[payment-simulations/get] Error al cargar filtros", {
      message: initialError?.message,
      code: initialError?.code,
    });
    return NextResponse.json(
      { error: "No se pudieron cargar los datos de simulación." },
      { status: 500 },
    );
  }

  const periods = periodsResult.data ?? [];
  if (!periodId) {
    const current = periods.find(
      (period) =>
        period.start_date <= businessDate && period.end_date >= businessDate,
    );
    periodId = current?.id ?? periods[0]?.id ?? "";
  }

  const basePayload = {
    employees: employeesResult.data ?? [],
    periods,
    selectedPeriodId: periodId,
    businessDate,
  };

  if (!employeeId || !periodId) {
    return NextResponse.json({
      ...basePayload,
      system: null,
      debts: [],
    });
  }

  const employee = (employeesResult.data ?? []).find(
    (item) => item.id === employeeId,
  );
  const period = periods.find((item) => item.id === periodId);
  if (!employee || !period) {
    return NextResponse.json(
      { error: "El empleado o período seleccionado no está disponible." },
      { status: 404 },
    );
  }

  let productionQuery = supabase
    .from("employee_service_production")
    .select(
      "commissionable_amount,fixed_commission_amount,production_source,status",
    )
    .eq("payroll_period_id", periodId)
    .eq("employee_id", employeeId)
    .eq("status", "active");

  let bonusesQuery = supabase
    .from("employee_product_bonus_entries")
    .select("total_bonus_amount,status")
    .eq("payroll_period_id", periodId)
    .eq("employee_id", employeeId)
    .in("status", ["active", "pending_review"]);

  const [
    productionResult,
    bonusesResult,
    livePreviewResult,
    debtsResult,
    termsResult,
    settlementResult,
    saleItemsResult,
  ] = await Promise.all([
    productionQuery,
    bonusesQuery,
    supabase.rpc("get_live_production_preview", {
      p_period_id: periodId,
      p_branch_id: null,
      p_employee_id: employeeId,
      p_source: null,
    }),
    supabase
      .from("employee_debts")
      .select(
        "id,debt_type,description,outstanding_amount,status,created_at,branch:branches(name)",
      )
      .eq("employee_id", employeeId)
      .in("status", ["pending", "partial"])
      .order("created_at", { ascending: true }),
    supabase
      .from("employee_compensation_terms")
      .select(
        "commission_rate,mandatory_discount_enabled,mandatory_discount_rate,compensation_mode,fixed_amount,base_monthly_salary,effective_from,effective_to",
      )
      .eq("employee_id", employeeId)
      .eq("is_active", true)
      .lte("effective_from", period.end_date)
      .or(`effective_to.is.null,effective_to.gte.${period.start_date}`)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("employee_settlements")
      .select(
        "id,status,commission_rate,fixed_compensation_total,mandatory_discount_rate,mandatory_discount_enabled_snapshot",
      )
      .eq("employee_id", employeeId)
      .eq("payroll_period_id", periodId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("sale_items")
      .select(
        "id,sale_id,item_type,barber_id,attributed_employee_id,quantity,unit_price,original_unit_price,total,original_total,is_courtesy,sale:sales!inner(id,status,accounting_date,barber_id,closed_by)",
      )
      .eq("sale.status", "completed")
      .gte("sale.accounting_date", period.start_date)
      .lte("sale.accounting_date", period.end_date),
  ]);

  const dataError =
    productionResult.error ??
    bonusesResult.error ??
    livePreviewResult.error ??
    debtsResult.error ??
    termsResult.error ??
    settlementResult.error ??
    saleItemsResult.error;

  if (dataError) {
    console.error("[payment-simulations/get] Error al cargar referencia", {
      message: dataError.message,
      code: dataError.code,
      employeeId,
      periodId,
    });
    return NextResponse.json(
      { error: "No se pudieron cargar los valores del sistema." },
      { status: 500 },
    );
  }

  const saleItems = (saleItemsResult.data ?? []) as Array<{
    id: string;
    sale_id: string;
    item_type: string;
    barber_id: string | null;
    attributed_employee_id: string | null;
    quantity: number | string | null;
    unit_price: number | string | null;
    original_unit_price: number | string | null;
    total: number | string | null;
    original_total: number | string | null;
    is_courtesy: boolean | null;
    sale: SaleRelation;
  }>;

  const serviceSales = new Set(
    saleItems
      .filter((item) => item.item_type === "service")
      .map((item) => item.sale_id),
  );

  const totalProduced = saleItems.reduce((total, item) => {
    const sale = relationOne(item.sale);
    if (!sale) return total;

    const attributedEmployeeId =
      item.item_type === "service"
        ? item.barber_id || sale.barber_id || null
        : item.attributed_employee_id ||
          (serviceSales.has(item.sale_id)
            ? sale.barber_id || null
            : sale.closed_by || null);

    if (attributedEmployeeId !== employeeId) return total;

    const quantity = Math.max(0, numeric(item.quantity));
    const originalUnitPrice = Math.max(
      0,
      numeric(item.original_unit_price ?? item.unit_price),
    );
    const commercialAmount =
      item.original_total !== null && item.original_total !== undefined
        ? Math.max(0, numeric(item.original_total))
        : Math.max(
            0,
            quantity * originalUnitPrice || numeric(item.total),
          );

    return total + commercialAmount;
  }, 0);

  const livePreview = (livePreviewResult.data ?? {}) as {
    services?: Array<{
      commissionable_amount?: number | string;
      fixed_commission_amount?: number | string;
    }>;
    bonuses?: Array<{ total_bonus_amount?: number | string }>;
    pending_sales?: number;
  };

  const commissionableBase =
    (productionResult.data ?? []).reduce(
      (sum, row) => sum + numeric(row.commissionable_amount),
      0,
    ) +
    (livePreview.services ?? []).reduce(
      (sum, row) => sum + numeric(row.commissionable_amount),
      0,
    );

  const fixedServiceIncome =
    (productionResult.data ?? []).reduce(
      (sum, row) => sum + numeric(row.fixed_commission_amount),
      0,
    ) +
    (livePreview.services ?? []).reduce(
      (sum, row) => sum + numeric(row.fixed_commission_amount),
      0,
    );

  const productBonuses =
    (bonusesResult.data ?? []).reduce(
      (sum, row) => sum + numeric(row.total_bonus_amount),
      0,
    ) +
    (livePreview.bonuses ?? []).reduce(
      (sum, row) => sum + numeric(row.total_bonus_amount),
      0,
    );

  const terms = termsResult.data;
  const settlement = settlementResult.data;
  const configuredCommissionRate =
    settlement?.commission_rate ?? terms?.commission_rate ?? null;
  const commissionRate =
    configuredCommissionRate === null
      ? null
      : Number(numeric(configuredCommissionRate).toFixed(4));
  const mandatoryDiscountEnabled =
    settlement?.mandatory_discount_enabled_snapshot ??
    terms?.mandatory_discount_enabled ??
    true;
  const mandatoryDiscountRate = numeric(
    settlement?.mandatory_discount_rate ??
      terms?.mandatory_discount_rate ??
      1,
  );
  const fixedCompensation = numeric(settlement?.fixed_compensation_total);
  const additionalIncome =
    fixedServiceIncome + productBonuses + fixedCompensation;

  return NextResponse.json({
    ...basePayload,
    system: {
      employeeId,
      employeeName: employee.full_name,
      periodId,
      totalProduced: Number(totalProduced.toFixed(2)),
      commissionableBase: Number(commissionableBase.toFixed(2)),
      commissionRate,
      additionalIncome: Number(additionalIncome.toFixed(2)),
      mandatoryDiscountEnabled,
      mandatoryDiscountRate: Number(mandatoryDiscountRate.toFixed(4)),
      livePendingSales: Number(livePreview.pending_sales ?? 0),
      sourceSettlement: settlement
        ? { id: settlement.id, status: settlement.status }
        : null,
    },
    debts: debtsResult.data ?? [],
  });
}

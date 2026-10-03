import { NextResponse } from "next/server";

import { normalizeDatabaseError } from "@/lib/errors/normalize-database-error";
import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";

export async function GET(_request: Request, context: { params: Promise<{ settlementId: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { settlementId } = await context.params;
  const supabase = await createClient();
  const [settlement, services, bonuses, productLines, deductions, adjustments, payments] = await Promise.all([
    supabase.from("employee_settlements").select("*, employee:employees!employee_settlements_employee_id_fkey(full_name,document_number,position), branch:branches(name), period:payroll_periods(start_date,end_date,period_half), payment_method:payment_methods(name), reviewed:employees!employee_settlements_reviewed_by_fkey(full_name), approved:employees!employee_settlements_approved_by_fkey(full_name), paid:employees!employee_settlements_paid_by_fkey(full_name)").eq("id", settlementId).maybeSingle(),
    supabase.from("employee_settlement_service_lines").select("*").eq("settlement_id", settlementId).order("accounting_date_snapshot"),
    supabase.from("employee_settlement_bonus_lines").select("*").eq("settlement_id", settlementId),
    supabase.from("employee_settlement_product_lines").select("*").eq("settlement_id", settlementId).order("accounting_date_snapshot"),
    supabase.from("employee_settlement_deductions").select("*, debt:employee_debts(description,outstanding_amount,debt_type,created_at)").eq("settlement_id", settlementId),
    supabase.from("employee_settlement_adjustments").select("*").eq("settlement_id", settlementId),
    supabase.from("employee_settlement_payments").select("id,amount,reference,status,created_at,payment_method:payment_methods(name,payment_kind)").eq("settlement_id", settlementId).order("created_at"),
  ]);
  if (settlement.error) {
    console.error("[settlements/detail] Error al leer liquidacion", { settlementId, message: settlement.error.message, code: settlement.error.code });
    return NextResponse.json({ error: "No se pudo cargar la liquidacion." }, { status: 500 });
  }
  if (!settlement.data) return NextResponse.json({ error: "La liquidacion no existe." }, { status: 404 });
  const detailError = services.error ?? bonuses.error ?? productLines.error ?? deductions.error ?? payments.error;
  if (detailError) {
    console.error("[settlements/detail] Error al leer detalle", { settlementId, message: detailError.message, code: detailError.code });
    return NextResponse.json({ error: "No se pudo cargar el detalle de la liquidacion." }, { status: 500 });
  }
  if (adjustments.error) {
    console.warn("[settlements/detail] Ajustes no disponibles", { settlementId, message: adjustments.error.message, code: adjustments.error.code });
  }
  const debtIds = (deductions.data ?? []).map((deduction) => deduction.employee_debt_id).filter(Boolean);
  const sources = debtIds.length ? await supabase.from("vw_employee_debt_source_detail").select("debt_id,debt_type,debt_description,sale_reference,first_item_description,extra_item_count,source_description").in("debt_id", debtIds) : { data: [], error: null };
  if (sources.error) return NextResponse.json({ error: "No se pudo cargar el origen de las deudas." }, { status: 500 });
  const sourceByDebt = new Map((sources.data ?? []).map((source) => [source.debt_id, source]));
  const enrichedDeductions = (deductions.data ?? []).map((deduction) => ({ ...deduction, debt_source: sourceByDebt.get(deduction.employee_debt_id) ?? null }));
  return NextResponse.json({ data: settlement.data, services: services.data ?? [], bonuses: bonuses.data ?? [], productLines: productLines.data ?? [], deductions: enrichedDeductions, adjustments: adjustments.data ?? [], payments: payments.data ?? [] });
}

export async function POST(request: Request, context: { params: Promise<{ settlementId: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { settlementId } = await context.params;
  const payload = await request.json().catch(() => null);
  const supabase = await createClient();
  const rpc = payload?.action === "update_draft"
    ? supabase.rpc("update_employee_settlement_draft_v193", {
      p_settlement_id: settlementId,
      p_commission_rate: Number(payload.commissionRate),
      p_debt_deductions: payload.debtDeductions ?? [],
      p_high_rate_note: payload.highRateNote ?? null,
    })
    : payload?.action === "confirm"
    ? supabase.rpc("confirm_employee_settlement_v193", { p_settlement_id: settlementId, p_adjustments: payload.adjustments ?? [] })
    : payload?.action === "review"
    ? supabase.rpc("review_employee_settlement", { p_settlement_id: settlementId, p_adjustments: payload.adjustments ?? [] })
    : payload?.action === "pay"
    ? supabase.rpc("pay_employee_settlement_v194", { p_settlement_id: settlementId, p_payment_parts: payload.paymentParts ?? [{ paymentMethodId: payload.paymentMethodId, amount: Number(payload.amount), reference: payload.reference || null }], p_notes: payload.notes || null })
    : payload?.action === "discard_draft"
    ? supabase.rpc("discard_employee_settlement_draft_v195", { p_settlement_id: settlementId })
    : payload?.action === "cancel"
    ? supabase.rpc("cancel_employee_settlement_with_reason", { p_settlement_id: settlementId, p_reason_code: payload?.reasonCode, p_note: payload?.reason || null })
    : supabase.rpc("transition_employee_settlement", { p_settlement_id: settlementId, p_action: payload?.action, p_reason: payload?.reason || null });
  const { data, error } = await rpc;
  if (error) {
    console.error("[settlements/action] Error en liquidacion", { settlementId, action: payload?.action, postgresCode: error.code, message: error.message, details: error.details, constraint: (error as { constraint?: string }).constraint });
    if ((payload?.action === "review" || payload?.action === "confirm" || payload?.action === "update_draft") && error.code === "PGRST202") {
      return NextResponse.json(
        {
          error: "La edición o confirmación de liquidaciones no está disponible en este entorno.",
          code: "SETTLEMENT_DRAFT_SQL_REQUIRED",
        },
        { status: 503 },
      );
    }
    const normalized = normalizeDatabaseError(error);
    return NextResponse.json({ error: normalized.message, code: normalized.code }, { status: normalized.httpStatus });
  }
  return NextResponse.json({ data });
}

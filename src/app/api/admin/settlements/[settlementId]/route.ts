import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";

export async function GET(_request: Request, context: { params: Promise<{ settlementId: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { settlementId } = await context.params;
  const supabase = await createClient();
  const [settlement, services, bonuses, deductions, adjustments] = await Promise.all([
    supabase.from("employee_settlements").select("*").eq("id", settlementId).maybeSingle(),
    supabase.from("employee_settlement_service_lines").select("*").eq("settlement_id", settlementId).order("accounting_date_snapshot"),
    supabase.from("employee_settlement_bonus_lines").select("*").eq("settlement_id", settlementId),
    supabase.from("employee_settlement_deductions").select("*, debt:employee_debts(description,outstanding_amount)").eq("settlement_id", settlementId),
    supabase.from("employee_settlement_adjustments").select("*").eq("settlement_id", settlementId),
  ]);
  if (settlement.error) {
    console.error("[settlements/detail] Error al leer liquidacion", { settlementId, message: settlement.error.message, code: settlement.error.code });
    return NextResponse.json({ error: "No se pudo cargar la liquidacion." }, { status: 500 });
  }
  if (!settlement.data) return NextResponse.json({ error: "La liquidacion no existe." }, { status: 404 });
  const detailError = services.error ?? bonuses.error ?? deductions.error;
  if (detailError) {
    console.error("[settlements/detail] Error al leer detalle", { settlementId, message: detailError.message, code: detailError.code });
    return NextResponse.json({ error: "No se pudo cargar el detalle de la liquidacion." }, { status: 500 });
  }
  if (adjustments.error) {
    console.warn("[settlements/detail] Ajustes no disponibles", { settlementId, message: adjustments.error.message, code: adjustments.error.code });
  }
  return NextResponse.json({ data: settlement.data, services: services.data ?? [], bonuses: bonuses.data ?? [], deductions: deductions.data ?? [], adjustments: adjustments.data ?? [] });
}

export async function POST(request: Request, context: { params: Promise<{ settlementId: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { settlementId } = await context.params;
  const payload = await request.json().catch(() => null);
  const supabase = await createClient();
  const rpc = payload?.action === "review"
    ? supabase.rpc("review_employee_settlement", { p_settlement_id: settlementId, p_adjustments: payload.adjustments ?? [] })
    : payload?.action === "pay"
    ? supabase.rpc("pay_employee_settlement", { p_settlement_id: settlementId, p_payment_method_id: payload.paymentMethodId, p_amount: Number(payload.amount), p_reference: payload.reference || null, p_evidence_path: payload.evidencePath || null, p_notes: payload.notes || null, p_pos_session_id: payload.posSessionId || null })
    : supabase.rpc("transition_employee_settlement", { p_settlement_id: settlementId, p_action: payload?.action, p_reason: payload?.reason || null });
  const { data, error } = await rpc;
  if (error) {
    console.error("[settlements/action] Error en liquidacion", { settlementId, action: payload?.action, message: error.message, code: error.code });
    if (payload?.action === "review" && error.code === "PGRST202") {
      return NextResponse.json(
        {
          error: "La revision de liquidaciones no esta disponible en este entorno.",
          code: "SETTLEMENT_REVIEW_SQL_REQUIRED",
        },
        { status: 503 },
      );
    }
    if (payload?.action === "pay" && error.message.includes("efectivo disponible")) {
      return NextResponse.json(
        {
          error: "El efectivo disponible de la sesion no cubre esta liquidacion.",
          code: "SETTLEMENT_CASH_INSUFFICIENT",
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: error.message.includes("sesion POS") ? "No existe una sesion POS activa para registrar el pago en efectivo." : "No se pudo actualizar la liquidacion." }, { status: 400 });
  }
  return NextResponse.json({ data });
}

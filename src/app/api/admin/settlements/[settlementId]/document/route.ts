import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { createElement } from "react";

import { EmployeeSettlementPdf } from "@/features/settlements/EmployeeSettlementPdf";
import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ settlementId: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const { settlementId } = await context.params;
  const supabase = await createClient();
  const [settlement, services, bonuses, deductions] = await Promise.all([
    supabase.from("employee_settlements").select("*, employee:employees!employee_settlements_employee_id_fkey(full_name,document_number,position), branch:branches(name), period:payroll_periods(start_date,end_date,period_half), payment_method:payment_methods(name), reviewed:employees!employee_settlements_reviewed_by_fkey(full_name), approved:employees!employee_settlements_approved_by_fkey(full_name), paid:employees!employee_settlements_paid_by_fkey(full_name)").eq("id", settlementId).maybeSingle(),
    supabase.from("employee_settlement_service_lines").select("*, production:employee_service_production(original_line_total,operational_contribution_amount)").eq("settlement_id", settlementId).order("accounting_date_snapshot"),
    supabase.from("employee_settlement_bonus_lines").select("*").eq("settlement_id", settlementId),
    supabase.from("employee_settlement_deductions").select("*, debt:employee_debts(debt_type,description)").eq("settlement_id", settlementId),
  ]);
  const error = settlement.error ?? services.error ?? bonuses.error ?? deductions.error;
  if (error) {
    console.error("[settlement/document] Error al generar PDF", { settlementId, message: error.message, code: error.code });
    return NextResponse.json({ error: "No se pudo generar el documento de liquidacion." }, { status: 500 });
  }
  if (!settlement.data) return NextResponse.json({ error: "La liquidacion no existe." }, { status: 404 });

  const pdf = await renderToBuffer(createElement(EmployeeSettlementPdf, {
    detail: settlement.data,
    services: services.data ?? [],
    bonuses: bonuses.data ?? [],
    deductions: deductions.data ?? [],
  }) as unknown as Parameters<typeof renderToBuffer>[0]);
  const prefix = settlement.data.status === "paid" ? "comprobante-pago" : "liquidacion";
  const filename = `${prefix}-${String(settlement.data.settlement_number).replace(/[^A-Za-z0-9_-]/g, "_")}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

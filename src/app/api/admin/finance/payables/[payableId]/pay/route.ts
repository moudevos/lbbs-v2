import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";

export async function POST(request: Request, context: { params: Promise<{ payableId: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const payload = await request.json().catch(() => null);
  const amount = Number(payload?.amount);
  const paymentMethodId = String(payload?.paymentMethodId ?? "").trim();
  if (!Number.isFinite(amount) || amount <= 0 || !paymentMethodId) {
    return NextResponse.json({ error: "Monto y método de pago son obligatorios." }, { status: 400 });
  }
  const { payableId } = await context.params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pay_operational_accounts_payable", {
    p_payable_id: payableId,
    p_amount: amount,
    p_payment_method_id: paymentMethodId,
    p_payment_date: payload?.paymentDate || null,
    p_reference: String(payload?.reference ?? "").trim() || null,
    p_notes: String(payload?.notes ?? "").trim() || null,
  });
  if (error) {
    console.error("[finance/payable] Error al pagar obligación", { payableId, code: error.code, message: error.message });
    return NextResponse.json({ error: error.message || "No se pudo registrar el pago." }, { status: 400 });
  }
  return NextResponse.json({ data });
}

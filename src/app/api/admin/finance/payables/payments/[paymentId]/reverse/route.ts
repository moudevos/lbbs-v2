import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";

const reasonCodes = new Set([
  "ENTRY_ERROR",
  "DUPLICATE",
  "WRONG_PAYMENT_METHOD",
  "WRONG_AMOUNT",
  "WRONG_REFERENCE",
  "OTHER",
]);

export async function POST(request: Request, context: { params: Promise<{ paymentId: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const payload = await request.json().catch(() => null);
  const reasonCode = String(payload?.reasonCode ?? "").trim();
  const note = String(payload?.note ?? "").trim();
  if (!reasonCodes.has(reasonCode) || (reasonCode === "OTHER" && !note)) {
    return NextResponse.json({ error: "Selecciona un motivo válido; Otro requiere una observación." }, { status: 400 });
  }

  const { paymentId } = await context.params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reverse_operational_accounts_payable_payment", {
    p_payment_id: paymentId,
    p_reason_code: reasonCode,
    p_note: note || null,
  });
  if (error) {
    console.error("[finance/payable-reversal] Error al revertir pago", { paymentId, code: error.code, message: error.message });
    return NextResponse.json({ error: error.message || "No se pudo revertir el pago." }, { status: 400 });
  }
  return NextResponse.json({ data });
}

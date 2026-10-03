import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";

export async function POST(request: Request, context: { params: Promise<{ entryId: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { entryId } = await context.params;
  const payload = await request.json().catch(() => null);
  const reasonCode = String(payload?.reasonCode ?? "").trim();
  const note = String(payload?.note ?? "").trim();
  if (!reasonCode) return NextResponse.json({ error: "Selecciona el motivo de anulacion." }, { status: 400 });
  if (reasonCode === "OTHER" && !note) return NextResponse.json({ error: "La observacion es obligatoria para el motivo Otro." }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_operational_finance_entry_v186", {
    p_entry_id: entryId,
    p_reason_code: reasonCode,
    p_note: note || null,
  });
  if (error) {
    console.error("[finance/cancel] Error al anular asiento", {
      entryId,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    const knownMessage = error.message?.includes("caja POS ya cerrada") || error.message?.includes("ya tiene pagos") || error.message?.includes("observación")
      ? error.message
      : "No se pudo anular el movimiento.";
    return NextResponse.json({ error: knownMessage }, { status: 400 });
  }
  return NextResponse.json({ data });
}

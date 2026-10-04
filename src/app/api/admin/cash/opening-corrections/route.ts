import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";

export async function POST(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const payload = await request.json().catch(() => null);
  const amount = Number(payload?.amount);
  const sessionId = String(payload?.sessionId ?? "").trim();
  const direction = payload?.direction === "decrease" ? "decrease" : payload?.direction === "increase" ? "increase" : "";
  const reasonCode = String(payload?.reasonCode ?? "").trim();
  if (!sessionId || !Number.isFinite(amount) || amount <= 0 || !direction || !reasonCode) {
    return NextResponse.json({ error: "Completa sesión, monto, dirección y motivo." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_pos_opening_correction", {
    p_session_id: sessionId,
    p_correction_amount: amount,
    p_direction: direction,
    p_reason_code: reasonCode,
    p_note: String(payload?.note ?? "").trim() || null,
  });
  if (error) {
    console.error("[cash/opening-corrections/post] Error", { sessionId, direction, reasonCode, message: error.message, code: error.code, details: error.details, hint: error.hint });
    return NextResponse.json({ error: error.message || "No se pudo corregir la apertura." }, { status: 400 });
  }
  return NextResponse.json({ data });
}

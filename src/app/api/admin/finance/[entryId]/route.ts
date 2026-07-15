import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";

export async function POST(request: Request, context: { params: Promise<{ entryId: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { entryId } = await context.params;
  const payload = await request.json().catch(() => null);
  const reason = String(payload?.reason ?? "").trim();
  if (!reason) return NextResponse.json({ error: "Indica el motivo de anulacion." }, { status: 400 });
  const supabase = await createClient();
  const { data: employeeId } = await supabase.rpc("current_employee_id");
  const { data, error } = await supabase.from("finance_manual_entries").update({ status: "cancelled", cancellation_reason: reason, cancelled_at: new Date().toISOString(), cancelled_by: employeeId ?? null }).eq("id", entryId).eq("status", "active").select().single();
  if (error) {
    console.error("[finance/cancel] Error al anular asiento", { entryId, message: error.message, code: error.code });
    return NextResponse.json({ error: "No se pudo anular el movimiento." }, { status: 400 });
  }
  return NextResponse.json({ data });
}

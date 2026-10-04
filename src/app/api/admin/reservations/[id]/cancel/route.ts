import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireReservationWriteSession } from "@/lib/supabase/route-auth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireReservationWriteSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const { id } = await params;
  const payload = await request.json().catch(() => null);
  const reason = typeof payload?.reason === "string" ? payload.reason.trim() : "";
  if (!reason) return NextResponse.json({ error: "Debes indicar el motivo de anulaciÃ³n." }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_reservation", { p_reservation_id: id, p_reason: reason });
  if (error) {
    const status = error.message.includes("no existe") ? 404 : 400;
    return NextResponse.json({ error: error.message || "No se pudo anular la reserva." }, { status });
  }

  return NextResponse.json({ data: { id } });
}

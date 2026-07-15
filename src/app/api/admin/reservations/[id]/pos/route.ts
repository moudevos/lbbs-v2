import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requirePosWriteSession } from "@/lib/supabase/route-auth";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePosWriteSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { id } = await params;
  const supabase = await createClient();
  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select("id, customer_id, branch_id, status")
    .eq("id", id)
    .maybeSingle();
  if (reservationError || !reservation) {
    console.error("[reservations/pos] Error al leer reserva", { message: reservationError?.message, code: reservationError?.code, details: reservationError?.details, hint: reservationError?.hint, reservationId: id });
    return NextResponse.json({ error: "No se pudo validar la reserva." }, { status: 404 });
  }
  if (reservation.status !== "checked_in") return NextResponse.json({ error: "Solo las reservas en tienda pueden pasar a venta." }, { status: 400 });
  if (!reservation.customer_id || !reservation.branch_id) return NextResponse.json({ error: "La reserva necesita cliente y sede antes de pasar a venta." }, { status: 400 });
  const { data: existingSale, error: saleError } = await supabase.from("sales").select("id,status").eq("reservation_id", id).in("status", ["draft", "completed"]).maybeSingle();
  if (saleError) {
    console.error("[reservations/pos] Error al validar ventas vinculadas", { message: saleError.message, code: saleError.code, details: saleError.details, hint: saleError.hint, reservationId: id });
    return NextResponse.json({ error: "No se pudo validar el vinculo con ventas." }, { status: 500 });
  }
  if (existingSale?.status === "completed") return NextResponse.json({ error: "Esta reserva ya tiene una venta completada." }, { status: 409 });
  const { data: session, error: sessionError } = await supabase.from("pos_sessions").select("id").eq("branch_id", reservation.branch_id).eq("status", "open").order("opened_at", { ascending: false }).limit(1).maybeSingle();
  if (sessionError) {
    console.error("[reservations/pos] Error al buscar sesion POS", { message: sessionError.message, code: sessionError.code, details: sessionError.details, hint: sessionError.hint, reservationId: id });
    return NextResponse.json({ error: "No se pudo validar la sesion POS." }, { status: 500 });
  }
  if (!session) return NextResponse.json({ error: "No existe una sesion POS abierta para esta sede.", code: "POS_SESSION_REQUIRED" }, { status: 409 });
  return NextResponse.json({ data: { sessionId: session.id, reservationId: id } });
}

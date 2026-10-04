import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireReservationWriteSession } from "@/lib/supabase/route-auth";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const auth = await requireReservationWriteSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const params = request.nextUrl.searchParams;
  const branchId = params.get("branchId")?.trim() ?? "";
  const serviceId = params.get("serviceId")?.trim() ?? "";
  const barberId = params.get("barberId")?.trim() || null;
  const date = params.get("date")?.trim() ?? "";
  const reservationId = params.get("reservationId")?.trim() || null;

  if (!uuidPattern.test(branchId) || !uuidPattern.test(serviceId) || !datePattern.test(date)
    || (barberId !== null && !uuidPattern.test(barberId))
    || (reservationId !== null && !uuidPattern.test(reservationId))) {
    return NextResponse.json({ error: "Los datos de disponibilidad no son validos." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_reservation_available_slots", {
    p_branch_id: branchId,
    p_service_id: serviceId,
    p_preferred_barber_id: barberId,
    p_scheduled_date: date,
    p_exclude_reservation_id: reservationId,
  });

  if (error) {
    console.error("[reservations/availability] Error", { message: error.message, code: error.code, branchId, serviceId, date, reservationId });
    return NextResponse.json({ error: "No se pudo consultar la disponibilidad." }, { status: 500 });
  }

  return NextResponse.json({ data: (data ?? []).map((slot: { slot_time: string }) => String(slot.slot_time).slice(0, 5)) });
}

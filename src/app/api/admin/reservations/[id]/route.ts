import { NextRequest, NextResponse } from "next/server";

import {
  formatReservation,
  formatReservationDetail,
  trimOrNull,
  type ReservationRow,
  validateReservationPayload,
} from "@/features/reservations/reservation-server";
import type { ReservationStatus } from "@/features/reservations/reservation-types";
import { createClient } from "@/lib/supabase/server";
import { requireReservationWriteSession } from "@/lib/supabase/route-auth";

const reservationDetailSelect =
  "id, customer_id, branch_id, preferred_barber_id, service_interest_id, scheduled_date, scheduled_time, status, source, channel, customer_message, internal_notes, confirmed_at, cancelled_at, completed_at, attended_at, last_reminder_at, reminder_count, rescheduled_at, rescheduled_by, cancelled_by, cancellation_reason, created_by, updated_by, created_at, updated_at, customer:customers(id, full_name, phone, phone_normalized, document_type, document_number), branch:branches(id, name, slug), preferred_barber:employees!reservations_preferred_barber_id_fkey(id, full_name), service_interest:services(id, name), notes:reservation_notes(id, reservation_id, employee_id, note, created_at, employee:employees(id, full_name))";

function reservationWriteError(message: string) {
  const status = (
    message.includes("Ya no hay disponibilidad")
    || message.includes("ya tiene una reserva")
    || message.includes("horario seleccionado")
  ) ? 409 : 400;
  return NextResponse.json({ error: message || "No se pudo validar la reserva." }, { status });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { id } = await params;
  const { data, error } = await supabase
    .from("reservations")
    .select(reservationDetailSelect)
    .eq("id", id)
    .single();

  if (error) {
    console.error("[reservations/detail] Error al cargar reserva", {
      message: error.message,
      code: error.code,
      id,
    });
    return NextResponse.json(
      { error: "No se pudo cargar la reserva." },
      { status: error.code === "PGRST116" ? 404 : 500 },
    );
  }

  return NextResponse.json({ data: formatReservationDetail(data as ReservationRow) });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireReservationWriteSession();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const supabase = await createClient();
  const { id } = await params;
  const payload = await request.json().catch(() => null);
  const customerId = trimOrNull(payload?.customer_id);
  const branchId = trimOrNull(payload?.branch_id);
  const preferredBarberId = trimOrNull(payload?.preferred_barber_id);
  const serviceInterestId = trimOrNull(payload?.service_interest_id);
  const scheduledDate = trimOrNull(payload?.scheduled_date);
  const scheduledTime = trimOrNull(payload?.scheduled_time);
  const status: ReservationStatus = "scheduled";
  const source = trimOrNull(payload?.source) ?? "manual";
  const channel = trimOrNull(payload?.channel) ?? "reception";
  const validationError = validateReservationPayload({
    customerId,
    branchId,
    preferredBarberId,
    serviceInterestId,
    scheduledDate,
    scheduledTime,
    status,
  });

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { data: currentRow, error: currentError } = await supabase
    .from("reservations")
    .select("status")
    .eq("id", id)
    .single();

  if (currentError) {
    console.error("[reservations/put] No se pudo leer la reserva actual", {
      message: currentError.message,
      code: currentError.code,
      id,
    });
    return NextResponse.json(
      { error: "No se pudo validar la reserva actual." },
      { status: currentError.code === "PGRST116" ? 404 : 500 },
    );
  }

  if (currentRow.status === "cancelled") {
    return NextResponse.json({ error: "La reserva anulada no se puede reprogramar." }, { status: 400 });
  }

  const { data: reservationId, error } = await supabase.rpc(
    "create_or_update_reservation_with_capacity",
    {
      p_customer_id: customerId,
      p_branch_id: branchId,
      p_preferred_barber_id: preferredBarberId,
      p_service_interest_id: serviceInterestId,
      p_scheduled_date: scheduledDate,
      p_scheduled_time: scheduledTime,
      p_status: status,
      p_source: source,
      p_channel: channel,
      p_customer_message: trimOrNull(payload?.customer_message),
      p_internal_notes: trimOrNull(payload?.internal_notes),
      p_confirmed_at: null,
      p_cancelled_at: null,
      p_completed_at: null,
      p_reservation_id: id,
    },
  );

  if (error) {
    console.error("[reservations/put] Error al actualizar reserva", {
      message: error.message,
      code: error.code,
      id,
    });
    return reservationWriteError(error.message);
  }

  const { data, error: selectError } = await supabase
    .from("reservations")
    .select(reservationDetailSelect)
    .eq("id", reservationId)
    .single();

  if (selectError) {
    return NextResponse.json({ error: "La reserva fue actualizada, pero no se pudo recargar." }, { status: 500 });
  }

  return NextResponse.json({ data: formatReservation(data as ReservationRow) });
}

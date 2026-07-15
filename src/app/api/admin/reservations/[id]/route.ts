import { NextRequest, NextResponse } from "next/server";

import {
  buildReservationTimestamps,
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
  "id, customer_id, branch_id, preferred_barber_id, service_interest_id, scheduled_date, scheduled_time, status, source, channel, customer_message, internal_notes, confirmed_at, cancelled_at, completed_at, created_by, updated_by, created_at, updated_at, customer:customers(id, full_name, phone, phone_normalized, document_type, document_number), branch:branches(id, name, slug), preferred_barber:employees!reservations_preferred_barber_id_fkey(id, full_name), service_interest:services(id, name), notes:reservation_notes(id, reservation_id, employee_id, note, created_at, employee:employees(id, full_name))";

const allowedTransitions: Record<ReservationStatus, ReservationStatus[]> = {
  pending: ["contacted", "confirmed", "rescheduled", "cancelled"],
  contacted: ["confirmed", "rescheduled", "cancelled"],
  confirmed: ["checked_in", "rescheduled", "no_show", "cancelled"],
  rescheduled: ["contacted", "confirmed", "cancelled"],
  checked_in: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: ["rescheduled"],
};

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
  const status = (trimOrNull(payload?.status) ?? "pending") as ReservationStatus;
  const source = trimOrNull(payload?.source) ?? "manual";
  const channel = trimOrNull(payload?.channel) ?? "reception";
  const validationError = validateReservationPayload({
    customerId,
    branchId,
    scheduledDate,
    scheduledTime,
    status,
  });

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { data: currentRow, error: currentError } = await supabase
    .from("reservations")
    .select("confirmed_at, cancelled_at, completed_at, status")
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

  if (currentRow.status !== status && !allowedTransitions[currentRow.status as ReservationStatus]?.includes(status)) {
    return NextResponse.json({ error: "El cambio de estado no esta permitido para esta reserva." }, { status: 400 });
  }

  const { data: employeeId } = await supabase.rpc("current_employee_id");
  const timestamps = buildReservationTimestamps(status, currentRow);

  const { data, error } = await supabase
    .from("reservations")
    .update({
      customer_id: customerId,
      branch_id: branchId,
      preferred_barber_id: preferredBarberId,
      service_interest_id: serviceInterestId,
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      status,
      source,
      channel,
      customer_message: trimOrNull(payload?.customer_message),
      internal_notes: trimOrNull(payload?.internal_notes),
      confirmed_at: timestamps.confirmed_at,
      cancelled_at: timestamps.cancelled_at,
      completed_at: timestamps.completed_at,
      updated_by: employeeId ?? null,
    })
    .eq("id", id)
    .select(reservationDetailSelect)
    .single();

  if (error) {
    console.error("[reservations/put] Error al actualizar reserva", {
      message: error.message,
      code: error.code,
      id,
    });
    return NextResponse.json(
      { error: error.message || "No se pudo actualizar la reserva." },
      { status: 400 },
    );
  }

  return NextResponse.json({ data: formatReservation(data as ReservationRow) });
}

import { NextRequest, NextResponse } from "next/server";

import {
  formatReservation,
  matchesReservationSearch,
  trimOrNull,
  type ReservationRow,
  validateReservationPayload,
} from "@/features/reservations/reservation-server";
import type { ReservationStatus } from "@/features/reservations/reservation-types";
import { createClient } from "@/lib/supabase/server";
import { requireReservationWriteSession } from "@/lib/supabase/route-auth";

const reservationSelect =
  "id, customer_id, branch_id, preferred_barber_id, service_interest_id, scheduled_date, scheduled_time, status, source, channel, customer_message, internal_notes, confirmed_at, cancelled_at, completed_at, attended_at, last_reminder_at, reminder_count, rescheduled_at, rescheduled_by, cancelled_by, cancellation_reason, created_by, updated_by, created_at, updated_at, customer:customers(id, full_name, phone, phone_normalized, document_type, document_number), branch:branches(id, name, slug), preferred_barber:employees!reservations_preferred_barber_id_fkey(id, full_name), service_interest:services(id, name), notes:reservation_notes(id)";

function reservationWriteError(message: string) {
  const status = (
    message.includes("Ya no hay disponibilidad")
    || message.includes("ya tiene una reserva")
    || message.includes("horario seleccionado")
  ) ? 409 : 400;
  return NextResponse.json({ error: message || "No se pudo validar la reserva." }, { status });
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status")?.trim() ?? "";
  const branchId = searchParams.get("branchId")?.trim() ?? "";
  const scheduledDate = searchParams.get("scheduledDate")?.trim() ?? "";
  const search = searchParams.get("search")?.trim() ?? "";

  const { data, error } = await supabase
    .from("reservations")
    .select(reservationSelect)
    .order("scheduled_date", { ascending: true, nullsFirst: false })
    .order("scheduled_time", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[reservations/get] Error al listar reservas", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json(
      { error: error.message || "No se pudieron cargar las reservas." },
      { status: 500 },
    );
  }

  const filtered = (data ?? [])
    .map((item) => formatReservation(item as ReservationRow))
    .filter((item) => {
      if (status && item.visual_status !== status) {
        return false;
      }

      if (branchId && item.branch_id !== branchId) {
        return false;
      }

      if (scheduledDate && item.scheduled_date !== scheduledDate) {
        return false;
      }

      return matchesReservationSearch(item, search);
    });

  return NextResponse.json({ data: filtered });
}

export async function POST(request: Request) {
  const auth = await requireReservationWriteSession();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const supabase = await createClient();
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
      p_reservation_id: null,
    },
  );

  if (error) {
    console.error("[reservations/post] Error al crear reserva", {
      message: error.message,
      code: error.code,
      customerId,
      branchId,
    });
    return reservationWriteError(error.message);
  }

  const { data, error: selectError } = await supabase
    .from("reservations")
    .select(reservationSelect)
    .eq("id", reservationId)
    .single();

  if (selectError) {
    return NextResponse.json({ error: "La reserva fue creada, pero no se pudo recargar." }, { status: 500 });
  }

  return NextResponse.json({ data: formatReservation(data as ReservationRow) });
}

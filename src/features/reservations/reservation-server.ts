import type {
  ReservationChannel,
  ReservationDetailRecord,
  ReservationRecord,
  ReservationSource,
  ReservationStatus,
} from "@/features/reservations/reservation-types";
import { getReservationVisualStatus } from "@/features/reservations/reservation-presentation";

type NestedCustomer = {
  id: string;
  full_name: string;
  phone: string;
  phone_normalized: string;
  document_type: string | null;
  document_number: string | null;
} | null;

type NestedBranch = {
  id: string;
  name: string | null;
  slug: string | null;
} | null;

type NestedEmployee = {
  id: string;
  full_name: string | null;
} | null;

type NestedService = {
  id: string;
  name: string | null;
} | null;

type NestedNoteEmployee = {
  id: string;
  full_name: string | null;
} | null;

type NestedNote = {
  id: string;
  reservation_id: string;
  employee_id: string | null;
  note: string;
  created_at: string;
  employee?: NestedNoteEmployee[] | NestedNoteEmployee;
} | null;

export type ReservationRow = {
  id: string;
  customer_id: string;
  branch_id: string | null;
  preferred_barber_id: string | null;
  service_interest_id: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  status: ReservationStatus;
  source: ReservationSource;
  channel: ReservationChannel;
  customer_message: string | null;
  internal_notes: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  attended_at: string | null;
  last_reminder_at: string | null;
  reminder_count: number | null;
  rescheduled_at: string | null;
  rescheduled_by: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  customer?: NestedCustomer[] | NestedCustomer;
  branch?: NestedBranch[] | NestedBranch;
  preferred_barber?: NestedEmployee[] | NestedEmployee;
  service_interest?: NestedService[] | NestedService;
  notes?: NestedNote[];
};

export function trimOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function unwrapRelation<T>(value?: T[] | T | null) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export function formatReservation(row: ReservationRow): ReservationRecord {
  const customer = unwrapRelation(row.customer);
  const branch = unwrapRelation(row.branch);
  const preferredBarber = unwrapRelation(row.preferred_barber);
  const serviceInterest = unwrapRelation(row.service_interest);

  return {
    id: row.id,
    customer_id: row.customer_id,
    branch_id: row.branch_id,
    preferred_barber_id: row.preferred_barber_id,
    service_interest_id: row.service_interest_id,
    scheduled_date: row.scheduled_date,
    scheduled_time: row.scheduled_time,
    status: row.status,
    source: row.source,
    channel: row.channel,
    customer_message: row.customer_message,
    internal_notes: row.internal_notes,
    confirmed_at: row.confirmed_at,
    cancelled_at: row.cancelled_at,
    completed_at: row.completed_at,
    attended_at: row.attended_at,
    last_reminder_at: row.last_reminder_at,
    reminder_count: row.reminder_count ?? 0,
    rescheduled_at: row.rescheduled_at,
    rescheduled_by: row.rescheduled_by,
    cancelled_by: row.cancelled_by,
    cancellation_reason: row.cancellation_reason,
    visual_status: getReservationVisualStatus({
      status: row.status,
      attendedAt: row.attended_at,
      scheduledDate: row.scheduled_date,
      scheduledTime: row.scheduled_time,
    }),
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    customer_name: customer?.full_name ?? "Cliente no disponible",
    customer_phone: customer?.phone ?? "",
    customer_phone_normalized: customer?.phone_normalized ?? "",
    customer_document_type: customer?.document_type ?? null,
    customer_document_number: customer?.document_number ?? null,
    branch_name: branch?.name ?? null,
    branch_slug: branch?.slug ?? null,
    preferred_barber_name: preferredBarber?.full_name ?? null,
    service_interest_name: serviceInterest?.name ?? null,
    notes_count: row.notes?.length ?? 0,
  };
}

export function formatReservationDetail(row: ReservationRow): ReservationDetailRecord {
  return {
    ...formatReservation(row),
    notes: (row.notes ?? []).flatMap((note) => {
      if (!note) {
        return [];
      }

      const employee = unwrapRelation(note.employee);
      return [
        {
          id: note.id,
          reservation_id: note.reservation_id,
          employee_id: note.employee_id,
          employee_name: employee?.full_name ?? null,
          note: note.note,
          created_at: note.created_at,
        },
      ];
    }),
  };
}

export function validateReservationPayload(payload: {
  customerId: string | null;
  branchId: string | null;
  preferredBarberId: string | null;
  serviceInterestId: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  status: string | null;
}) {
  if (!payload.customerId) {
    return "Debes seleccionar un cliente.";
  }

  if (payload.status !== "scheduled") {
    return "Las reservas nuevas deben quedar programadas.";
  }

  if (!payload.branchId || !payload.serviceInterestId || !payload.scheduledDate || !payload.scheduledTime) {
    return "La reserva requiere sede, servicio, fecha y hora.";
  }

  return null;
}

export function matchesReservationSearch(row: ReservationRecord, term: string) {
  if (!term) {
    return true;
  }

  const normalizedTerm = term.trim().toLowerCase();
  if (!normalizedTerm) {
    return true;
  }

  const digits = normalizedTerm.replace(/\D/g, "");

  return (
    row.customer_name.toLowerCase().includes(normalizedTerm) ||
    row.customer_phone.toLowerCase().includes(normalizedTerm) ||
    row.customer_phone_normalized.includes(digits) ||
    (row.customer_document_number ?? "").toLowerCase().includes(normalizedTerm) ||
    (row.preferred_barber_name ?? "").toLowerCase().includes(normalizedTerm)
  );
}

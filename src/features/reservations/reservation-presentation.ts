import type { ReservationStatus, ReservationVisualStatus } from "@/features/reservations/reservation-types";

const legacyActiveStatuses: ReservationStatus[] = [
  "pending",
  "contacted",
  "confirmed",
  "rescheduled",
  "checked_in",
];

export function getReservationVisualStatus(input: {
  status: ReservationStatus;
  attendedAt: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  now?: Date;
}): ReservationVisualStatus {
  if (input.status === "cancelled") return "cancelled";
  if (input.attendedAt || input.status === "completed") return "attended";
  if (input.status === "no_show") return "unattended";

  const isActive = input.status === "scheduled" || legacyActiveStatuses.includes(input.status);
  const scheduledAt = input.scheduledDate && input.scheduledTime
    ? new Date(`${input.scheduledDate}T${input.scheduledTime.slice(0, 8)}-05:00`)
    : null;

  if (isActive && scheduledAt && !Number.isNaN(scheduledAt.getTime()) && scheduledAt.getTime() < (input.now ?? new Date()).getTime()) {
    return "unattended";
  }

  return "scheduled";
}

export const reservationVisualStatusLabels: Record<ReservationVisualStatus, string> = {
  scheduled: "Programada",
  attended: "Atendida",
  unattended: "No atendida",
  cancelled: "Anulada",
};

"use client";

import { faCalendarDays, faEye, faPenToSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@/components/ui/button";
import { ReservationStatusBadge } from "@/features/reservations/ReservationStatusBadge";
import type { ReservationRecord } from "@/features/reservations/reservation-types";
import { reservationChannelLabels } from "@/lib/ui/labels";

type ReservationsTableProps = {
  reservations: ReservationRecord[];
  onView: (reservation: ReservationRecord) => void;
  onEdit: (reservation: ReservationRecord) => void;
};

export function ReservationsTable({
  reservations,
  onView,
  onEdit,
}: ReservationsTableProps) {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">Reservas registradas</p>
          <p className="mt-1 text-sm text-slate-500">{reservations.length} reservas</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-slate-500">
              <th className="px-5 py-3 font-medium">Cliente</th>
              <th className="px-5 py-3 font-medium">Agenda</th>
              <th className="px-5 py-3 font-medium">Sede</th>
              <th className="px-5 py-3 font-medium">Barbero</th>
              <th className="px-5 py-3 font-medium">Estado</th>
              <th className="px-5 py-3 font-medium">Canal</th>
              <th className="px-5 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reservations.map((reservation) => (
              <tr key={reservation.id} className="align-top">
                <td className="px-5 py-4">
                  <p className="font-medium text-slate-900">{reservation.customer_name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {reservation.customer_phone}
                    {reservation.customer_document_number
                      ? ` · ${reservation.customer_document_number}`
                      : ""}
                  </p>
                </td>
                <td className="px-5 py-4 text-slate-600">
                  {reservation.scheduled_date && reservation.scheduled_time ? (
                    <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                      <FontAwesomeIcon icon={faCalendarDays} />
                      <span>
                        {reservation.scheduled_date} · {reservation.scheduled_time.slice(0, 5)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Pendiente de coordinacion</span>
                  )}
                </td>
                <td className="px-5 py-4 text-slate-600">{reservation.branch_name ?? "Pendiente"}</td>
                <td className="px-5 py-4 text-slate-600">
                  {reservation.preferred_barber_name ?? "Sin asignar"}
                </td>
                <td className="px-5 py-4">
                  <ReservationStatusBadge status={reservation.status} />
                </td>
                <td className="px-5 py-4 text-slate-600">
                  {reservationChannelLabels[reservation.channel]}
                </td>
                <td className="px-5 py-4">
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      className="h-9 bg-slate-100 px-3 text-slate-700 hover:bg-slate-200"
                      onClick={() => onView(reservation)}
                    >
                      <FontAwesomeIcon icon={faEye} />
                      Ver
                    </Button>
                    <Button type="button" className="h-9 px-3" onClick={() => onEdit(reservation)}>
                      <FontAwesomeIcon icon={faPenToSquare} />
                      Editar
                    </Button>
                  </div>
                </td>
              </tr>
            ))}

            {reservations.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-500">
                  No hay reservas para mostrar con los filtros actuales.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

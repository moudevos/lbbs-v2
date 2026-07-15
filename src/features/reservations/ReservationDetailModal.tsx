"use client";

import { faArrowRight, faPenToSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { ReservationNotesPanel } from "@/features/reservations/ReservationNotesPanel";
import { ReservationStatusBadge } from "@/features/reservations/ReservationStatusBadge";
import type { ReservationDetailRecord } from "@/features/reservations/reservation-types";
import type { ReservationStatus } from "@/features/reservations/reservation-types";
import { reservationChannelLabels, reservationSourceLabels } from "@/lib/ui/labels";

type ReservationDetailModalProps = {
  open: boolean;
  reservation: ReservationDetailRecord | null;
  noteDraft: string;
  isSavingNote: boolean;
  isActionBusy: boolean;
  onPassToSale: () => void;
  onContact: () => void;
  onStatusChange: (status: ReservationStatus) => void;
  onClose: () => void;
  onEdit: () => void;
  onChangeNoteDraft: (value: string) => void;
  onSubmitNote: () => void;
};

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm text-slate-700">{value}</p>
    </div>
  );
}

export function ReservationDetailModal({
  open,
  reservation,
  noteDraft,
  isSavingNote,
  isActionBusy,
  onPassToSale,
  onContact,
  onStatusChange,
  onClose,
  onEdit,
  onChangeNoteDraft,
  onSubmitNote,
}: ReservationDetailModalProps) {
  const showCheckedInActions = reservation?.status === "checked_in";
  const statusActions: Partial<Record<ReservationStatus, Array<{status:ReservationStatus;label:string}>>> = {
    pending: [{status:"contacted",label:"Contactar"},{status:"confirmed",label:"Confirmar"},{status:"rescheduled",label:"Reprogramar"},{status:"cancelled",label:"Cancelar"}],
    contacted: [{status:"confirmed",label:"Confirmar"},{status:"rescheduled",label:"Reprogramar"},{status:"cancelled",label:"Cancelar"}],
    confirmed: [{status:"checked_in",label:"Marcar en tienda"},{status:"rescheduled",label:"Reprogramar"},{status:"no_show",label:"No asistio"},{status:"cancelled",label:"Cancelar"}],
    rescheduled: [{status:"contacted",label:"Contactar"},{status:"confirmed",label:"Confirmar"},{status:"cancelled",label:"Cancelar"}],
    no_show: [{status:"rescheduled",label:"Reprogramar"}],
  };

  return (
    <Modal
      open={open}
      title="Detalle de reserva"
      description="Consulta la coordinacion actual y registra seguimiento interno."
      onClose={onClose}
      size="xl"
      confirmBeforeClose={false}
      footer={
        <div className="flex flex-wrap justify-between gap-3">
          <div className="flex flex-wrap gap-3">
            {(reservation ? statusActions[reservation.status] ?? [] : []).map((action, index) => <Button key={action.status} type="button" className={index === 0 ? "" : "bg-slate-100 text-slate-700 hover:bg-slate-200"} disabled={isActionBusy} onClick={() => onStatusChange(action.status)}>{isActionBusy && index === 0 ? "Actualizando..." : action.label}</Button>)}
            {reservation && ["pending", "contacted", "confirmed", "rescheduled"].includes(reservation.status) ? <Button type="button" className="bg-sky-100 text-sky-700 hover:bg-sky-200" disabled={isActionBusy} onClick={onContact}>Contactar por WhatsApp</Button> : null}
            {showCheckedInActions ? (
              <Button
                type="button"
                className="bg-slate-100 text-slate-700 hover:bg-slate-200"
                disabled={isActionBusy}
                onClick={onPassToSale}
              >
                <FontAwesomeIcon icon={faArrowRight} />
                Pasar a venta
              </Button>
            ) : null}
          </div>
          <Button type="button" onClick={onEdit} disabled={!reservation || isActionBusy}>
            <FontAwesomeIcon icon={faPenToSquare} />
            Editar reserva
          </Button>
        </div>
      }
    >
      {reservation ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <p className="text-lg font-semibold text-slate-900">{reservation.customer_name}</p>
              <p className="mt-1 text-sm text-slate-600">
                {reservation.customer_phone}
                {reservation.customer_document_number ? ` · ${reservation.customer_document_number}` : ""}
              </p>
            </div>
            <ReservationStatusBadge status={reservation.status} />
          </div>

          <div className="rounded-2xl border border-sky-100 bg-sky-50/80 p-4 text-sm text-sky-800">
            Los datos de barbero y servicio son referenciales. La venta final se valida en POS.
            <p className="mt-2 text-xs text-sky-700">
              TODO: cuando POS esté implementado, crear venta borrador con `reservation_id` y cerrar
              la reserva solo al completar la venta.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <DetailItem label="Sede" value={reservation.branch_name ?? "Pendiente"} />
            <DetailItem
              label="Agenda"
              value={
                reservation.scheduled_date && reservation.scheduled_time
                  ? `${reservation.scheduled_date} · ${reservation.scheduled_time.slice(0, 5)}`
                  : "Pendiente de coordinacion"
              }
            />
            <DetailItem
              label="Barbero preferido"
              value={reservation.preferred_barber_name ?? "Sin asignar"}
            />
            <DetailItem
              label="Servicio de interés"
              value={reservation.service_interest_name ?? "No especificado"}
            />
            <DetailItem label="Origen" value={reservationSourceLabels[reservation.source]} />
            <DetailItem label="Canal" value={reservationChannelLabels[reservation.channel]} />
            <DetailItem
              label="Mensaje cliente"
              value={reservation.customer_message ?? "Sin mensaje"}
            />
            <DetailItem
              label="Notas internas"
              value={reservation.internal_notes ?? "Sin notas internas"}
            />
          </div>

          <ReservationNotesPanel
            notes={reservation.notes}
            noteDraft={noteDraft}
            isSaving={isSavingNote}
            onChangeDraft={onChangeNoteDraft}
            onSubmit={onSubmitNote}
          />
        </div>
      ) : null}
    </Modal>
  );
}

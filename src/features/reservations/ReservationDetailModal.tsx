"use client";

import { faBell, faCalendarDays, faPenToSquare, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { ReservationNotesPanel } from "@/features/reservations/ReservationNotesPanel";
import { ReservationStatusBadge } from "@/features/reservations/ReservationStatusBadge";
import type { ReservationDetailRecord } from "@/features/reservations/reservation-types";
import { reservationChannelLabels, reservationSourceLabels } from "@/lib/ui/labels";

type Props = {
  open: boolean; reservation: ReservationDetailRecord | null; noteDraft: string; isSavingNote: boolean; isActionBusy: boolean;
  onReminder: () => void; onReschedule: () => void; onCancel: () => void; onClose: () => void; onEdit: () => void;
  onChangeNoteDraft: (value: string) => void; onSubmitNote: () => void;
};

function DetailItem({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p><p className="mt-1 text-sm text-slate-700">{value}</p></div>;
}

export function ReservationDetailModal({ open, reservation, noteDraft, isSavingNote, isActionBusy, onReminder, onReschedule, onCancel, onClose, onEdit, onChangeNoteDraft, onSubmitNote }: Props) {
  const canManage = reservation?.visual_status !== "cancelled";
  return <Modal open={open} title="Reserva" description="Agenda y seguimiento de la cita." onClose={onClose} size="xl" confirmBeforeClose={false} footer={<div className="flex flex-wrap justify-between gap-3"><div className="flex flex-wrap gap-3">{canManage ? <><Button type="button" className="bg-sky-100 text-sky-700 hover:bg-sky-200" disabled={isActionBusy} onClick={onReminder}><FontAwesomeIcon icon={faBell} />Recordatorio</Button><Button type="button" className="bg-slate-100 text-slate-700 hover:bg-slate-200" disabled={isActionBusy} onClick={onReschedule}><FontAwesomeIcon icon={faCalendarDays} />Reprogramar</Button><Button type="button" className="bg-rose-600 hover:bg-rose-700" disabled={isActionBusy} onClick={onCancel}><FontAwesomeIcon icon={faTrashCan} />Anular</Button></> : null}</div><Button type="button" onClick={onEdit} disabled={!reservation || isActionBusy || !canManage}><FontAwesomeIcon icon={faPenToSquare} />Editar</Button></div>}>
    {reservation ? <div className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"><div><p className="text-lg font-semibold text-slate-900">{reservation.customer_name}</p><p className="mt-1 text-sm text-slate-600">{reservation.customer_phone}{reservation.customer_document_number ? ` · ${reservation.customer_document_number}` : ""}</p></div><ReservationStatusBadge status={reservation.visual_status} /></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><DetailItem label="Sede" value={reservation.branch_name ?? "Sin sede"} /><DetailItem label="Agenda" value={reservation.scheduled_date && reservation.scheduled_time ? `${reservation.scheduled_date} · ${reservation.scheduled_time.slice(0, 5)}` : "Sin agenda"} /><DetailItem label="Barbero" value={reservation.preferred_barber_name ?? "Cualquier barbero disponible"} /><DetailItem label="Servicio" value={reservation.service_interest_name ?? "No especificado"} /><DetailItem label="Origen" value={reservationSourceLabels[reservation.source]} /><DetailItem label="Canal" value={reservationChannelLabels[reservation.channel]} /><DetailItem label="Recordatorios" value={reservation.reminder_count ? `${reservation.reminder_count} · último ${reservation.last_reminder_at ? new Date(reservation.last_reminder_at).toLocaleString("es-PE") : ""}` : "Sin recordatorios"} /><DetailItem label="Observaciones" value={reservation.internal_notes ?? reservation.customer_message ?? "Sin observaciones"} /></div><ReservationNotesPanel notes={reservation.notes} noteDraft={noteDraft} isSaving={isSavingNote} onChangeDraft={onChangeNoteDraft} onSubmit={onSubmitNote} /></div> : null}
  </Modal>;
}

"use client";

import { faClock, faMessage } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ReservationNoteRecord } from "@/features/reservations/reservation-types";

type ReservationNotesPanelProps = {
  notes: ReservationNoteRecord[];
  noteDraft: string;
  isSaving: boolean;
  onChangeDraft: (value: string) => void;
  onSubmit: () => void;
};

export function ReservationNotesPanel({
  notes,
  noteDraft,
  isSaving,
  onChangeDraft,
  onSubmit,
}: ReservationNotesPanelProps) {
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <p className="text-sm font-semibold text-slate-900">Notas de coordinacion</p>
        <p className="mt-1 text-sm text-slate-500">Seguimiento interno de cambios, llamadas o acuerdos.</p>
      </div>

      <div className="space-y-3">
        {notes.length > 0 ? (
          notes.map((note) => (
            <div key={note.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold text-slate-700">
                  {note.employee_name ?? "Equipo LBBS"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <FontAwesomeIcon icon={faClock} />
                  {new Date(note.created_at).toLocaleString("es-PE")}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-700">{note.note}</p>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Aun no hay notas registradas para esta reserva.
          </div>
        )}
      </div>

      <div className="space-y-3">
        <label className="space-y-2">
          <span className="text-sm font-medium text-slate-700">Agregar nota</span>
          <Textarea
            value={noteDraft}
            onChange={(event) => onChangeDraft(event.target.value)}
            placeholder="Ejemplo: Cliente confirma llegada 10 minutos antes."
          />
        </label>
        <Button type="button" onClick={onSubmit} disabled={isSaving}>
          <FontAwesomeIcon icon={faMessage} />
          {isSaving ? "Guardando..." : "Registrar nota"}
        </Button>
      </div>
    </section>
  );
}

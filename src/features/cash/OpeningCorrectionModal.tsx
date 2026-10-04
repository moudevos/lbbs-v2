"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { Textarea } from "@/components/ui/textarea";

export type OpeningCorrectionValue = { direction: "increase" | "decrease"; amount: string; reasonCode: "DATA_ENTRY_ERROR" | "COUNTING_ERROR" | "OTHER" | ""; note: string };
export const emptyOpeningCorrection: OpeningCorrectionValue = { direction: "increase", amount: "", reasonCode: "", note: "" };

export function OpeningCorrectionModal({ open, value, isSaving, onChange, onClose, onSubmit }: { open: boolean; value: OpeningCorrectionValue; isSaving: boolean; onChange: (value: OpeningCorrectionValue) => void; onClose: () => void; onSubmit: () => void }) {
  return <Modal open={open} title="Corregir apertura" description="No cambia el monto original: deja una corrección auditada de esta sesión abierta." onClose={onClose} isDirty={Boolean(value.amount || value.reasonCode || value.note)} size="md">
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <SelectField label="Dirección" value={value.direction} onChange={(event) => onChange({ ...value, direction: event.target.value as OpeningCorrectionValue["direction"] })}><option value="increase">Aumentar efectivo</option><option value="decrease">Disminuir efectivo</option></SelectField>
      <TextField label="Monto" type="number" min="0.01" step="0.01" value={value.amount} onChange={(event) => onChange({ ...value, amount: event.target.value })} placeholder="0.00" />
      <SelectField label="Motivo" value={value.reasonCode} onChange={(event) => onChange({ ...value, reasonCode: event.target.value as OpeningCorrectionValue["reasonCode"] })}><option value="">Seleccionar motivo</option><option value="DATA_ENTRY_ERROR">Error de digitación</option><option value="COUNTING_ERROR">Error de conteo</option><option value="OTHER">Otro</option></SelectField>
      <label className="block space-y-2"><span className="text-sm font-medium text-slate-700">Observación {value.reasonCode === "OTHER" ? "(obligatoria)" : "(opcional)"}</span><Textarea value={value.note} onChange={(event) => onChange({ ...value, note: event.target.value })} /></label>
      <div className="flex justify-end gap-3"><Button type="button" className="bg-white text-slate-700" disabled={isSaving} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={isSaving}>{isSaving ? "Guardando..." : "Guardar corrección"}</Button></div>
    </form>
  </Modal>;
}

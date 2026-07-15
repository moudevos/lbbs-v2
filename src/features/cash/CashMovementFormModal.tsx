"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { Textarea } from "@/components/ui/textarea";
import type {
  CashMovementCategoryRecord,
  CashMovementFormValue,
} from "@/features/cash/cash-types";
import { useModalDirtyState } from "@/lib/hooks/use-modal-dirty-state";

type CashMovementFormModalProps = {
  open: boolean;
  categories: CashMovementCategoryRecord[];
  value: CashMovementFormValue;
  isSaving: boolean;
  onClose: () => void;
  onChange: (next: CashMovementFormValue) => void;
  onSubmit: () => void;
};

function getTypeLabel(value: CashMovementFormValue["movement_type"]) {
  if (value === "income") {
    return "Ingreso";
  }

  if (value === "expense") {
    return "Egreso";
  }

  if (value === "adjustment") {
    return "Ajuste";
  }

  return "Tipo";
}

export function CashMovementFormModal({
  open,
  categories,
  value,
  isSaving,
  onClose,
  onChange,
  onSubmit,
}: CashMovementFormModalProps) {
  const isDirty = useModalDirtyState(open, value);
  const filteredCategories = value.movement_type
    ? categories.filter((category) => category.movement_direction === value.movement_type)
    : categories;

  return (
    <Modal
      open={open}
      title="Nuevo movimiento"
      description="Registra ingresos, egresos o ajustes sin alterar ventas ni stock."
      onClose={() => {
        if (!isSaving) {
          onClose();
        }
      }}
      isDirty={isDirty}
      size="md"
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit();
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField
            label="Tipo"
            value={value.movement_type}
            onChange={(event) =>
              onChange({
                ...value,
                movement_type: event.target.value as CashMovementFormValue["movement_type"],
                category_id: "",
              })
            }
          >
            <option value="">Seleccionar tipo</option>
            <option value="income">Ingreso</option>
            <option value="expense">Egreso</option>
            <option value="adjustment">Ajuste</option>
          </SelectField>

          <SelectField
            label="Categoria"
            value={value.category_id}
            onChange={(event) => onChange({ ...value, category_id: event.target.value })}
            hint={
              value.movement_type
                ? `Solo se muestran categorias para ${getTypeLabel(value.movement_type).toLowerCase()}.`
                : "Selecciona primero el tipo para filtrar categorias."
            }
          >
            <option value="">Seleccionar categoria</option>
            {filteredCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectField>
        </div>

        <TextField
          label="Monto"
          type="number"
          min="0.01"
          step="0.01"
          value={value.amount}
          onChange={(event) => onChange({ ...value, amount: event.target.value })}
          placeholder="0.00"
        />

        <label className="space-y-2">
          <span className="text-sm font-medium text-slate-700">Descripcion</span>
          <Textarea
            value={value.description}
            onChange={(event) => onChange({ ...value, description: event.target.value })}
            placeholder="Describe el motivo del movimiento."
          />
        </label>

        <TextField
          label="Evidencia URL"
          value={value.evidence_url}
          onChange={(event) => onChange({ ...value, evidence_url: event.target.value })}
          placeholder="Enlace opcional a comprobante o respaldo"
        />

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
            disabled={isSaving}
          >
            Cancelar
          </button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Guardando..." : "Registrar movimiento"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

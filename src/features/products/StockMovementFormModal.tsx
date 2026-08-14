"use client";

import { faFloppyDisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { Textarea } from "@/components/ui/textarea";
import type { BranchRecord } from "@/features/branches/types";
import type { ProductRecord, StockMovementFormValue } from "@/features/products/product-types";
import { useModalDirtyState } from "@/lib/hooks/use-modal-dirty-state";
import { productMovementTypeOptions } from "@/lib/ui/labels";

type StockMovementFormModalProps = {
  open: boolean;
  product: ProductRecord | null;
  branches: BranchRecord[];
  value: StockMovementFormValue;
  isSaving: boolean;
  onClose: () => void;
  onChange: (next: StockMovementFormValue) => void;
  onSubmit: () => void;
  receptionMode?: boolean;
};

export function StockMovementFormModal({
  open,
  product,
  branches,
  value,
  isSaving,
  onClose,
  onChange,
  onSubmit,
  receptionMode = false,
}: StockMovementFormModalProps) {
  const isDirty = useModalDirtyState(open, value);

  return (
    <Modal
      open={open}
      title="Registrar movimiento"
      description={
        product
          ? `Registra un movimiento de stock para ${product.name}.`
          : "Registra un movimiento de stock."
      }
      onClose={() => {
        if (!isSaving) {
          onClose();
        }
      }}
      isDirty={isDirty}
      size="md"
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Sede"
            value={value.branch_id}
            disabled={receptionMode}
            onChange={(event) => onChange({ ...value, branch_id: event.target.value })}
          >
            <option value="">Selecciona una sede</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </SelectField>

          {receptionMode ? (
            <TextField label="Tipo de movimiento" value="Ingreso de stock" disabled />
          ) : (
            <SelectField
              label="Tipo de movimiento"
              value={value.movement_type}
              onChange={(event) =>
                onChange({
                  ...value,
                  movement_type: event.target.value as StockMovementFormValue["movement_type"],
                })
              }
            >
              {productMovementTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Cantidad"
            type="number"
            step="0.01"
            value={value.quantity}
            onChange={(event) => onChange({ ...value, quantity: event.target.value })}
            placeholder={value.movement_type === "adjustment" ? "-1 o 1" : "1"}
          />

          <TextField
            label="Costo unitario"
            type="number"
            min="0"
            step="0.01"
            value={value.unit_cost}
            onChange={(event) => onChange({ ...value, unit_cost: event.target.value })}
            placeholder="Opcional"
          />
        </div>

        <label className="space-y-2">
          <span className="text-sm font-medium text-slate-700">Notas</span>
          <Textarea
            value={value.notes}
            onChange={(event) => onChange({ ...value, notes: event.target.value })}
            placeholder="Detalle breve del movimiento"
          />
        </label>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Los cambios de stock se calculan solo desde movimientos. No se edita stock directo.
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={onSubmit} disabled={isSaving}>
            <FontAwesomeIcon icon={faFloppyDisk} />
            {isSaving ? "Guardando..." : "Registrar movimiento"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

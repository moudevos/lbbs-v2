"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { Textarea } from "@/components/ui/textarea";
import type { OpenPosSessionPayload, PosBranchRecord } from "@/features/pos/pos-types";
import { useModalDirtyState } from "@/lib/hooks/use-modal-dirty-state";

type OpenSessionModalProps = {
  open: boolean;
  branches: PosBranchRecord[];
  value: OpenPosSessionPayload;
  isSaving: boolean;
  isBranchLocked: boolean;
  onClose: () => void;
  onChange: (next: OpenPosSessionPayload) => void;
  onSubmit: () => void;
};

export function OpenSessionModal({
  open,
  branches,
  value,
  isSaving,
  isBranchLocked,
  onClose,
  onChange,
  onSubmit,
}: OpenSessionModalProps) {
  const isDirty = useModalDirtyState(open, value);

  return (
    <Modal
      open={open}
      title="Abrir sesión POS"
      description="Abre o recupera una sesión POS compartida por sede."
      onClose={() => {
        if (!isSaving) {
          onClose();
        }
      }}
      isDirty={isDirty}
      size="md"
    >
      <div className="space-y-4">
        <SelectField
          label="Sede"
          value={value.branch_id}
          disabled={isBranchLocked}
          onChange={(event) => onChange({ ...value, branch_id: event.target.value })}
        >
          <option value="">Selecciona una sede</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </SelectField>

        <TextField
          label="Monto inicial"
          type="number"
          min="0"
          step="0.01"
          value={value.opening_cash_amount}
          onChange={(event) => onChange({ ...value, opening_cash_amount: event.target.value })}
          placeholder="0.00"
        />

        <label className="space-y-2">
          <span className="text-sm font-medium text-slate-700">Nota</span>
          <Textarea
            value={value.notes}
            onChange={(event) => onChange({ ...value, notes: event.target.value })}
            placeholder="Observación opcional de apertura"
          />
        </label>

        <Button type="button" onClick={onSubmit} disabled={isSaving} className="w-full">
          {isSaving ? "Abriendo..." : "Abrir sesión POS"}
        </Button>
      </div>
    </Modal>
  );
}

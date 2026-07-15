"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { Textarea } from "@/components/ui/textarea";
import {
  buildSuggestedIdentity,
  getMovementTypeLabel,
} from "@/features/settings/settings-actions";
import type {
  SettingFormValue,
  SettingMovementType,
  PaymentKind,
  SettingsSectionConfig,
} from "@/features/settings/settings-types";
import { useModalDirtyState } from "@/lib/hooks/use-modal-dirty-state";

type SettingFormModalProps = {
  open: boolean;
  config: SettingsSectionConfig;
  value: SettingFormValue;
  isSaving: boolean;
  isEditing: boolean;
  onClose: () => void;
  onChange: (next: SettingFormValue) => void;
  onSubmit: () => void;
};

const movementTypeOptions: SettingMovementType[] = [
  "purchase",
  "sale",
  "courtesy",
  "adjustment",
  "waste",
  "transfer_in",
  "transfer_out",
];

const paymentKindOptions: Array<{ value: PaymentKind; label: string }> = [
  { value: "cash", label: "Efectivo" },
  { value: "wallet_qr", label: "Billetera o QR" },
  { value: "card", label: "Tarjeta o POS" },
  { value: "bank_transfer", label: "Transferencia bancaria" },
  { value: "other_digital", label: "Otro digital" },
];

export function SettingFormModal({
  open,
  config,
  value,
  isSaving,
  isEditing,
  onClose,
  onChange,
  onSubmit,
}: SettingFormModalProps) {
  const isDirty = useModalDirtyState(open, value);

  function handleNameChange(nextName: string) {
    const previousSuggested = buildSuggestedIdentity(config, value.name);
    const nextSuggested = buildSuggestedIdentity(config, nextName);
    const shouldSyncIdentity =
      !value.identity.trim() || value.identity.trim() === previousSuggested;

    onChange({
      ...value,
      name: nextName,
      identity: shouldSyncIdentity ? nextSuggested : value.identity,
    });
  }

  return (
    <Modal
      open={open}
      title={isEditing ? `Editar ${config.title.toLowerCase()}` : config.buttonLabel}
      description="Los cambios se aplican sin eliminar registros historicos."
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
          <TextField
            label="Nombre"
            value={value.name}
            onChange={(event) => handleNameChange(event.target.value)}
            placeholder="Nombre visible"
            autoFocus
          />
          <TextField
            label={config.identityLabel}
            value={value.identity}
            onChange={(event) => onChange({ ...value, identity: event.target.value })}
            placeholder={`Ingresa ${config.identityLabel.toLowerCase()}`}
            hint="Se sugiere automaticamente, pero puedes ajustarlo."
          />
        </div>

        {config.supportsMovementType ? (
          <SelectField
            label="Tipo de movimiento"
            value={value.movement_type}
            onChange={(event) =>
              onChange({
                ...value,
                movement_type: event.target.value as SettingMovementType | "",
              })
            }
          >
            <option value="">General</option>
            {movementTypeOptions.map((option) => (
              <option key={option} value={option}>
                {getMovementTypeLabel(option)}
              </option>
            ))}
          </SelectField>
        ) : null}

        {config.key === "payment_methods" ? (
          <SelectField
            label="Tipo operativo"
            value={value.payment_kind}
            onChange={(event) =>
              onChange({ ...value, payment_kind: event.target.value as PaymentKind })
            }
            hint="Solo el efectivo permite vuelto y cuenta para el arqueo de caja."
          >
            {paymentKindOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
        ) : null}

        <TextField
          label="Orden"
          type="number"
          min="0"
          step="1"
          value={value.sort_order}
          onChange={(event) => onChange({ ...value, sort_order: event.target.value })}
          placeholder="0"
        />

        <label className="space-y-2">
          <span className="text-sm font-medium text-slate-700">Descripcion</span>
          <Textarea
            value={value.description}
            onChange={(event) => onChange({ ...value, description: event.target.value })}
            placeholder="Detalle breve para uso interno."
          />
        </label>

        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={value.is_active}
            onChange={(event) => onChange({ ...value, is_active: event.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          Mantener este registro activo para nuevas operaciones.
        </label>

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
            {isSaving ? "Guardando..." : isEditing ? "Guardar cambios" : "Crear registro"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

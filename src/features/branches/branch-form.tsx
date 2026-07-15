"use client";

import { faFloppyDisk, faPlus, faRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { Textarea } from "@/components/ui/textarea";
import type { BranchFormValue } from "@/features/branches/types";

type BranchFormProps = {
  value: BranchFormValue;
  isSaving: boolean;
  isEditing: boolean;
  onChange: (next: BranchFormValue) => void;
  onSubmit: () => void;
  onReset: () => void;
};

export function BranchForm({
  value,
  isSaving,
  isEditing,
  onChange,
  onSubmit,
  onReset,
}: BranchFormProps) {
  function updateField<K extends keyof BranchFormValue>(key: K, nextValue: BranchFormValue[K]) {
    onChange({ ...value, [key]: nextValue });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Código"
          value={value.code}
          onChange={(event) => updateField("code", event.target.value)}
          placeholder="PRINCIPAL"
        />

        <TextField
          label="Slug"
          value={value.slug}
          onChange={(event) => updateField("slug", event.target.value)}
          placeholder="sucursal-principal"
          required
        />
      </div>

      <TextField
        label="Nombre"
        value={value.name}
        onChange={(event) => updateField("name", event.target.value)}
        placeholder="Sucursal principal"
        required
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Nombre corto"
          value={value.short_name}
          onChange={(event) => updateField("short_name", event.target.value)}
          placeholder="Principal"
        />

        <TextField
          label="Ciudad"
          value={value.city}
          onChange={(event) => updateField("city", event.target.value)}
          placeholder="Lima"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Teléfono"
          value={value.phone}
          onChange={(event) => updateField("phone", event.target.value)}
          placeholder="+51 ..."
        />

        <SelectField
          label="Estado"
          value={value.is_active ? "active" : "inactive"}
          onChange={(event) => updateField("is_active", event.target.value === "active")}
        >
          <option value="active">Activo</option>
          <option value="inactive">Inactivo</option>
        </SelectField>
      </div>

      <TextField
        label="Dirección"
        value={value.address}
        onChange={(event) => updateField("address", event.target.value)}
        placeholder="Av. principal 123"
      />

      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-700">Notas</span>
        <Textarea
          value={value.notes}
          onChange={(event) => updateField("notes", event.target.value)}
          placeholder="Observaciones internas"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button type="button" onClick={onSubmit} disabled={isSaving}>
          <FontAwesomeIcon icon={isEditing ? faFloppyDisk : faPlus} />
          {isSaving ? "Guardando..." : isEditing ? "Actualizar sede" : "Crear sede"}
        </Button>

        {isEditing ? (
          <Button
            type="button"
            className="bg-slate-100 text-slate-700 hover:bg-slate-200"
            onClick={onReset}
          >
            <FontAwesomeIcon icon={faRotateLeft} />
            Limpiar
          </Button>
        ) : null}
      </div>
    </div>
  );
}

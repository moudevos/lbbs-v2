"use client";

import { faFloppyDisk, faPlus, faRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { Textarea } from "@/components/ui/textarea";
import type { ServiceCategoryRecord, ServiceFormValue } from "@/features/services/service-types";

type ServiceFormProps = {
  value: ServiceFormValue;
  categories: ServiceCategoryRecord[];
  isSaving: boolean;
  isEditing: boolean;
  onChange: (next: ServiceFormValue) => void;
  onSubmit: () => void;
  onReset: () => void;
};

export function ServiceForm({
  value,
  categories,
  isSaving,
  isEditing,
  onChange,
  onSubmit,
  onReset,
}: ServiceFormProps) {
  function updateField<K extends keyof ServiceFormValue>(key: K, nextValue: ServiceFormValue[K]) {
    onChange({ ...value, [key]: nextValue });
  }

  return (
    <div className="space-y-4">
      <SelectField
        label="Categoria"
        value={value.category_id}
        onChange={(event) => updateField("category_id", event.target.value)}
        hint={
          categories.length === 0
            ? "No hay categorias de servicios registradas."
            : "Selecciona una categoria si aplica."
        }
      >
        <option value="">Sin categoria</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </SelectField>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Servicio"
          value={value.name}
          onChange={(event) => updateField("name", event.target.value)}
          placeholder="Corte clasico"
          required
        />

        <TextField
          label="Slug"
          value={value.slug}
          onChange={(event) => updateField("slug", event.target.value)}
          placeholder="corte-clasico"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Precio base"
          type="number"
          min="0"
          step="0.01"
          value={value.base_price}
          onChange={(event) => updateField("base_price", event.target.value)}
          placeholder="25.00"
          required
        />

        <TextField
          label="Duracion"
          type="number"
          min="1"
          step="1"
          value={value.duration_minutes}
          onChange={(event) => updateField("duration_minutes", event.target.value)}
          placeholder="30"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Permitir precio personalizado"
          value={value.allow_custom_price ? "yes" : "no"}
          onChange={(event) =>
            updateField("allow_custom_price", event.target.value === "yes")
          }
        >
          <option value="yes">Si</option>
          <option value="no">No</option>
        </SelectField>

        <SelectField
          label="Estado"
          value={value.is_active ? "active" : "inactive"}
          onChange={(event) => updateField("is_active", event.target.value === "active")}
        >
          <option value="active">Activo</option>
          <option value="inactive">Inactivo</option>
        </SelectField>
      </div>

      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-700">Descripcion</span>
        <Textarea
          value={value.description}
          onChange={(event) => updateField("description", event.target.value)}
          placeholder="Detalle breve del servicio"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button type="button" onClick={onSubmit} disabled={isSaving}>
          <FontAwesomeIcon icon={isEditing ? faFloppyDisk : faPlus} />
          {isSaving ? "Guardando..." : isEditing ? "Actualizar servicio" : "Crear servicio"}
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

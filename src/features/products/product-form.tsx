"use client";

import { faFloppyDisk, faPlus, faRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { Textarea } from "@/components/ui/textarea";
import type { ProductCategoryRecord, ProductFormValue } from "@/features/products/product-types";
import { productUnitOptions } from "@/lib/ui/labels";

type ProductFormProps = {
  value: ProductFormValue;
  categories: ProductCategoryRecord[];
  isSaving: boolean;
  isEditing: boolean;
  onChange: (next: ProductFormValue) => void;
  onSubmit: () => void;
  onReset: () => void;
};

export function ProductForm({
  value,
  categories,
  isSaving,
  isEditing,
  onChange,
  onSubmit,
  onReset,
}: ProductFormProps) {
  function updateField<K extends keyof ProductFormValue>(key: K, nextValue: ProductFormValue[K]) {
    onChange({ ...value, [key]: nextValue });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Categoria"
          value={value.category_id}
          onChange={(event) => updateField("category_id", event.target.value)}
          hint={
            categories.length === 0
              ? "No hay categorias de productos registradas."
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

        <SelectField
          label="Unidad"
          value={value.unit}
          onChange={(event) =>
            updateField("unit", event.target.value as ProductFormValue["unit"])
          }
        >
          {productUnitOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Producto"
          value={value.name}
          onChange={(event) => updateField("name", event.target.value)}
          placeholder="Pomada clasica"
          required
        />

        <TextField
          label="Slug"
          value={value.slug}
          onChange={(event) => updateField("slug", event.target.value)}
          placeholder="pomada-clasica"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="SKU"
          value={value.sku}
          onChange={(event) => updateField("sku", event.target.value)}
          placeholder="POM-001"
        />

        <TextField
          label="Codigo de barras"
          value={value.barcode}
          onChange={(event) => updateField("barcode", event.target.value)}
          placeholder="7751234567890"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Costo de compra"
          type="number"
          min="0"
          step="0.01"
          value={value.cost_price}
          onChange={(event) => updateField("cost_price", event.target.value)}
          placeholder="12.00"
          required
        />

        <TextField
          label="Precio de venta base"
          type="number"
          min="0"
          step="0.01"
          value={value.base_sale_price}
          onChange={(event) => updateField("base_sale_price", event.target.value)}
          placeholder="25.00"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <SelectField
          label="Maneja stock"
          value={value.is_stockable ? "yes" : "no"}
          onChange={(event) => updateField("is_stockable", event.target.value === "yes")}
        >
          <option value="yes">Si</option>
          <option value="no">No</option>
        </SelectField>

        <SelectField
          label="Permitir precio personalizado"
          value={value.allow_custom_price ? "yes" : "no"}
          onChange={(event) => updateField("allow_custom_price", event.target.value === "yes")}
        >
          <option value="yes">Si</option>
          <option value="no">No</option>
        </SelectField>

        <SelectField
          label="Permite cortesia"
          value={value.is_courtesy_allowed ? "yes" : "no"}
          onChange={(event) =>
            updateField("is_courtesy_allowed", event.target.value === "yes")
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
          placeholder="Detalle breve del producto"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button type="button" onClick={onSubmit} disabled={isSaving}>
          <FontAwesomeIcon icon={isEditing ? faFloppyDisk : faPlus} />
          {isSaving ? "Guardando..." : isEditing ? "Actualizar producto" : "Crear producto"}
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

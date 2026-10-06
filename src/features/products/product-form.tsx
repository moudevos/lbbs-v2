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
  const commercialProduct = value.visibility_scope === "pos" || value.visibility_scope === "both";
  const employeePriceEnabled =
    (value.visibility_scope === "internal" || value.visibility_scope === "both") &&
    value.employee_price_enabled;
  const categoriesByFamily = {
    barbershop_products: categories.filter((category) => category.business_line === "barbershop_products"),
    cafeteria_products: categories.filter((category) => category.business_line === "cafeteria_products"),
  };
  const selectedFamily = value.business_line;
  function updateField<K extends keyof ProductFormValue>(key: K, nextValue: ProductFormValue[K]) {
    onChange({ ...value, [key]: nextValue });
  }

  return (
    <div className="space-y-4">
      {/* Fila 1: Familia | Categoría | Unidad */}
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label="Familia comercial"
          value={selectedFamily}
          onChange={(event) => {
            const family = event.target.value as "barbershop_products" | "cafeteria_products" | "";
            onChange({ ...value, business_line: family, category_id: "" });
          }}
          hint="Define cómo se separará el ingreso y costo en Finanzas."
          required={commercialProduct}
        >
          <option value="">Sin clasificar</option>
          <option value="barbershop_products">Barbería</option>
          <option value="cafeteria_products">Cafetería</option>
        </SelectField>

        <SelectField
          label="Categoria"
          value={value.category_id}
          onChange={(event) => updateField("category_id", event.target.value)}
          hint={
            categories.length === 0
              ? "No hay categorias de productos registradas."
              : commercialProduct
                ? "Obligatoria para productos visibles en el POS."
                : "Opcional para artículos solo internos."
          }
          required={commercialProduct}
        >
          <option value="">{commercialProduct ? "Seleccionar categoría" : "Sin categoria"}</option>
          {categories
            .filter((category) => !selectedFamily || category.business_line === selectedFamily)
            .map((category) => (
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

      {selectedFamily && categoriesByFamily[selectedFamily].length === 0 ? (
        <p className="-mt-2 text-sm text-amber-700">
          No existen categorías de {selectedFamily === "cafeteria_products" ? "Cafetería" : "Barbería"}. Créala primero en Configuración.
        </p>
      ) : null}

      {/* Fila 2: SKU | Código de barras */}
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

      {/* Fila 3: Producto | Slug */}
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

      {/* Fila 4: Costo | Precio base | Visible para */}
      <div className="grid gap-4 sm:grid-cols-3">
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
          hint="Precio comercial utilizado para clientes."
        />

        <SelectField
          label="Visible para"
          value={value.visibility_scope}
          onChange={(event) =>
            updateField("visibility_scope", event.target.value as ProductFormValue["visibility_scope"])
          }
          hint="POS: clientes normales. Empleados: solo clientes vinculados. Ambos: los dos."
        >
          <option value="pos">POS publico</option>
          <option value="internal">Solo empleados</option>
          <option value="both">Clientes y empleados</option>
        </SelectField>
      </div>

      {/* Precio para empleados */}
      {(value.visibility_scope === "both" || value.visibility_scope === "internal") ? (
        <section className="space-y-3 rounded-xl border border-violet-200 bg-violet-50 p-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-violet-950">Precio para empleados</p>

            <label className="flex items-center gap-2 text-sm font-medium text-violet-900">
              <input
                type="checkbox"
                checked={value.employee_price_enabled}
                onChange={(event) => updateField("employee_price_enabled", event.target.checked)}
              />
              Usar precio especial para empleados
            </label>

            <p className="text-xs text-violet-800">
              {value.visibility_scope === "internal"
                ? "Solo los empleados vinculados pueden comprarlo. El precio especial es opcional; si no se configura, se usa el precio comercial vigente."
                : "El precio especial es opcional; si no se configura, el empleado pagará el precio comercial vigente."}
            </p>
          </div>

          {/* Input de precio especial | Card Cliente/Empleado en una sola fila */}
          <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
            {employeePriceEnabled ? (
              <TextField
                label="Precio especial empleado"
                type="number"
                min="0.01"
                step="0.01"
                value={value.employee_unit_price}
                onChange={(event) => updateField("employee_unit_price", event.target.value)}
                placeholder="3.50"
                required
                hint="Se aplicará automáticamente cuando el comprador sea un empleado vinculado."
              />
            ) : null}

            <div className={`space-y-2 ${employeePriceEnabled ? "" : "sm:col-span-2 sm:max-w-md"}`}>
              {/* Espaciador invisible: iguala la altura del label del input para que la card quede a la altura del campo */}
              {employeePriceEnabled ? (
                <span aria-hidden="true" className="invisible block text-sm font-medium">
                  Precio especial empleado
                </span>
              ) : null}

              <div className="grid min-h-11 grid-cols-2 items-center gap-2 rounded-lg border border-violet-100 bg-white px-3 py-2 text-xs">
                <span className="text-slate-600">
                  Cliente
                  <strong className="block text-slate-900">S/{value.base_sale_price || "0.00"}</strong>
                </span>
                <span className="text-slate-600">
                  Empleado
                  <strong className="block text-slate-900">
                    S/{employeePriceEnabled && value.employee_unit_price ? value.employee_unit_price : value.base_sale_price || "0.00"}
                  </strong>
                  {!employeePriceEnabled ? (
                    <em className="block not-italic text-slate-500">usa precio comercial</em>
                  ) : null}
                </span>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Fila 5: Stock | Precio personalizado | Cortesía | Estado */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          label="Maneja stock"
          value={value.is_stockable ? "yes" : "no"}
          onChange={(event) => updateField("is_stockable", event.target.value === "yes")}
        >
          <option value="yes">Si</option>
          <option value="no">No</option>
        </SelectField>

        <SelectField
          label="Precio personalisable"
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

      {/* Descripción */}
      <label className="block space-y-2">
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
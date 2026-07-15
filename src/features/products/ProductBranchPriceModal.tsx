"use client";

import { faFloppyDisk, faPowerOff } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { StatusBadge } from "@/components/feedback/status-badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import type { BranchRecord } from "@/features/branches/types";
import type {
  ProductBranchPriceFormValue,
  ProductBranchPriceRecord,
  ProductRecord,
} from "@/features/products/product-types";
import { useModalDirtyState } from "@/lib/hooks/use-modal-dirty-state";
import { priceModeLabels } from "@/lib/ui/labels";

type ProductBranchPriceModalProps = {
  open: boolean;
  product: ProductRecord | null;
  branches: BranchRecord[];
  prices: ProductBranchPriceRecord[];
  value: ProductBranchPriceFormValue;
  isSaving: boolean;
  onClose: () => void;
  onChange: (next: ProductBranchPriceFormValue) => void;
  onSubmit: () => void;
  onToggleActive: (price: ProductBranchPriceRecord) => void;
};

function formatMoney(value: string) {
  const numeric = Number(value);

  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

export function ProductBranchPriceModal({
  open,
  product,
  branches,
  prices,
  value,
  isSaving,
  onClose,
  onChange,
  onSubmit,
  onToggleActive,
}: ProductBranchPriceModalProps) {
  const isDirty = useModalDirtyState(open, value);

  if (!product) {
    return null;
  }

  return (
    <Modal
      open={open}
      title="Precio por sede"
      description={`Gestiona el precio especial de ${product.name}.`}
      onClose={() => {
        if (!isSaving) {
          onClose();
        }
      }}
      isDirty={isDirty}
      size="lg"
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={product.is_active ? "active" : "inactive"} />
            <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
              {product.branch_sale_price ? priceModeLabels.custom : priceModeLabels.base}
            </span>
          </div>
          <p className="mt-3 text-sm text-slate-600">
            Precio base:{" "}
            <span className="font-semibold text-slate-900">
              {formatMoney(product.base_sale_price)}
            </span>
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Sede"
            value={value.branch_id}
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
            label="Precio especial"
            type="number"
            min="0"
            step="0.01"
            value={value.sale_price}
            onChange={(event) => onChange({ ...value, sale_price: event.target.value })}
            placeholder="27.00"
          />
        </div>

        <SelectField
          label="Estado del precio"
          value={value.is_active ? "active" : "inactive"}
          onChange={(event) =>
            onChange({ ...value, is_active: event.target.value === "active" })
          }
        >
          <option value="active">Activo</option>
          <option value="inactive">Inactivo</option>
        </SelectField>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={onSubmit} disabled={isSaving}>
            <FontAwesomeIcon icon={faFloppyDisk} />
            {isSaving ? "Guardando..." : value.id ? "Actualizar precio" : "Crear precio"}
          </Button>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Precios especiales registrados</p>
            <p className="mt-1 text-sm text-slate-600">
              Si un precio queda inactivo, el sistema vuelve a usar el precio base.
            </p>
          </div>

          {prices.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              Usa precio base
            </div>
          ) : (
            <div className="space-y-3">
              {prices.map((price) => (
                <div
                  key={price.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {price.branch_name ?? "Sede"}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatMoney(price.sale_price)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={price.is_active ? "active" : "inactive"} />
                    <Button
                      type="button"
                      className="bg-slate-100 text-slate-700 hover:bg-slate-200"
                      onClick={() => onToggleActive(price)}
                    >
                      <FontAwesomeIcon icon={faPowerOff} />
                      {price.is_active ? "Desactivar" : "Activar"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

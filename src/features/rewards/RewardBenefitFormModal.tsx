"use client";

import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  rewardBenefitAppliesToLabels,
  rewardBenefitLabels,
  type RewardBenefitFormValue,
  type RewardCatalogOption,
} from "@/features/rewards/rewards-types";

type RewardBenefitFormModalProps = {
  open: boolean;
  isSaving: boolean;
  isEditing: boolean;
  value: RewardBenefitFormValue;
  services: RewardCatalogOption[];
  products: RewardCatalogOption[];
  onClose: () => void;
  onChange: (value: RewardBenefitFormValue) => void;
  onSubmit: () => void;
};

const initialValue: RewardBenefitFormValue = {
  name: "",
  description: "",
  benefit_type: "voucher_amount",
  service_id: "",
  product_id: "",
  voucher_amount: "",
  discount_percent: "",
  applies_to: "all",
  max_discount_amount: "",
  is_active: true,
};

export function RewardBenefitFormModal({
  open,
  isSaving,
  isEditing,
  value,
  services,
  products,
  onClose,
  onChange,
  onSubmit,
}: RewardBenefitFormModalProps) {
  const isDirty = useMemo(
    () => JSON.stringify(value) !== JSON.stringify(initialValue),
    [value],
  );

  return (
    <Modal
      open={open}
      title={isEditing ? "Editar premio" : "Nuevo premio"}
      description="Configura el beneficio que se podra canjear."
      onClose={onClose}
      isDirty={isDirty}
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button
            className="bg-slate-100 text-slate-700 hover:bg-slate-200"
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={isSaving}>
            {isSaving ? "Guardando..." : "Guardar premio"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          placeholder="Nombre del premio"
        />
        <Select
          value={value.benefit_type}
          onChange={(event) =>
            onChange({
              ...value,
              benefit_type: event.target.value as RewardBenefitFormValue["benefit_type"],
            })
          }
        >
          {Object.entries(rewardBenefitLabels).map(([optionValue, label]) => (
            <option key={optionValue} value={optionValue}>
              {label}
            </option>
          ))}
        </Select>
        <Select
          value={value.applies_to}
          onChange={(event) =>
            onChange({
              ...value,
              applies_to: event.target.value as RewardBenefitFormValue["applies_to"],
            })
          }
        >
          {Object.entries(rewardBenefitAppliesToLabels).map(([optionValue, label]) => (
            <option key={optionValue} value={optionValue}>
              {label}
            </option>
          ))}
        </Select>
        <Input
          value={value.voucher_amount}
          onChange={(event) => onChange({ ...value, voucher_amount: event.target.value })}
          placeholder="Vale por monto"
          type="number"
          step="0.01"
        />
        <Input
          value={value.discount_percent}
          onChange={(event) => onChange({ ...value, discount_percent: event.target.value })}
          placeholder="Descuento %"
          type="number"
          step="0.01"
        />
        <Input
          value={value.max_discount_amount}
          onChange={(event) => onChange({ ...value, max_discount_amount: event.target.value })}
          placeholder="Tope descuento"
          type="number"
          step="0.01"
        />
        <Select
          value={value.service_id}
          onChange={(event) => onChange({ ...value, service_id: event.target.value })}
        >
          <option value="">Servicio opcional</option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
            </option>
          ))}
        </Select>
        <Select
          value={value.product_id}
          onChange={(event) => onChange({ ...value, product_id: event.target.value })}
        >
          <option value="">Producto opcional</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-3">
        <Textarea
          value={value.description}
          onChange={(event) => onChange({ ...value, description: event.target.value })}
          placeholder="Descripcion interna"
        />
      </div>

      <div className="mt-3 flex items-center gap-4 text-sm text-slate-600">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.is_active}
            onChange={(event) => onChange({ ...value, is_active: event.target.checked })}
          />
          Activo
        </label>
      </div>
    </Modal>
  );
}

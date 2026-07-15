"use client";

import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  rewardMetricLabels,
  rewardRuleAppliesToLabels,
  type RewardCatalogOption,
  type RewardRuleFormValue,
} from "@/features/rewards/rewards-types";

type RewardRuleFormModalProps = {
  open: boolean;
  isSaving: boolean;
  isEditing: boolean;
  value: RewardRuleFormValue;
  benefits: RewardCatalogOption[];
  services: RewardCatalogOption[];
  onClose: () => void;
  onChange: (value: RewardRuleFormValue) => void;
  onSubmit: () => void;
};

const initialValue: RewardRuleFormValue = {
  name: "",
  description: "",
  metric_type: "service_visit_count",
  threshold_value: "",
  benefit_id: "",
  service_id: "",
  applies_to: "global",
  starts_at: "",
  ends_at: "",
  expires_days: "",
  is_repeatable: true,
  is_active: true,
};

export function RewardRuleFormModal({
  open,
  isSaving,
  isEditing,
  value,
  benefits,
  services,
  onClose,
  onChange,
  onSubmit,
}: RewardRuleFormModalProps) {
  const isDirty = useMemo(
    () => JSON.stringify(value) !== JSON.stringify(initialValue),
    [value],
  );

  return (
    <Modal
      open={open}
      title={isEditing ? "Editar regla" : "Nueva regla"}
      description="Configura cuando se gana un beneficio."
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
            {isSaving ? "Guardando..." : "Guardar regla"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          placeholder="Nombre de la regla"
        />
        <Input
          value={value.threshold_value}
          onChange={(event) => onChange({ ...value, threshold_value: event.target.value })}
          placeholder="Umbral"
          type="number"
          step="0.01"
        />
        <Select
          value={value.metric_type}
          onChange={(event) =>
            onChange(
              event.target.value === "specific_service_count"
                ? {
                    ...value,
                    metric_type: "specific_service_count",
                    applies_to: "specific_service",
                  }
                : {
                    ...value,
                    metric_type: event.target.value as RewardRuleFormValue["metric_type"],
                    service_id: "",
                    applies_to:
                      value.applies_to === "specific_service" ? "global" : value.applies_to,
                  },
            )
          }
        >
          {Object.entries(rewardMetricLabels).map(([optionValue, label]) => (
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
              applies_to: event.target.value as RewardRuleFormValue["applies_to"],
            })
          }
          disabled={value.metric_type === "specific_service_count"}
        >
          {Object.entries(rewardRuleAppliesToLabels).map(([optionValue, label]) => (
            <option key={optionValue} value={optionValue}>
              {label}
            </option>
          ))}
        </Select>
        <Select
          value={value.benefit_id}
          onChange={(event) => onChange({ ...value, benefit_id: event.target.value })}
        >
          <option value="">Selecciona un premio</option>
          {benefits.map((benefit) => (
            <option key={benefit.id} value={benefit.id}>
              {benefit.name}
            </option>
          ))}
        </Select>
        <Input
          value={value.expires_days}
          onChange={(event) => onChange({ ...value, expires_days: event.target.value })}
          placeholder="Vence en dias"
          type="number"
          min="0"
        />
        <Input
          value={value.starts_at}
          onChange={(event) => onChange({ ...value, starts_at: event.target.value })}
          type="datetime-local"
        />
        <Input
          value={value.ends_at}
          onChange={(event) => onChange({ ...value, ends_at: event.target.value })}
          type="datetime-local"
        />
      </div>

      <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-800">
        Para tarjetas fisicas con stickers usa Atenciones generales.
      </div>

      {value.metric_type === "specific_service_count" ? (
        <div className="mt-3">
          <Select
            value={value.service_id}
            onChange={(event) => onChange({ ...value, service_id: event.target.value })}
          >
            <option value="">Selecciona un servicio obligatorio</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <div className="mt-3">
        <Textarea
          value={value.description}
          onChange={(event) => onChange({ ...value, description: event.target.value })}
          placeholder="Descripcion interna"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-600">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.is_repeatable}
            onChange={(event) => onChange({ ...value, is_repeatable: event.target.checked })}
          />
          Repetible
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.is_active}
            onChange={(event) => onChange({ ...value, is_active: event.target.checked })}
          />
          Activa
        </label>
      </div>
    </Modal>
  );
}

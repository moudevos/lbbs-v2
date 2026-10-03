"use client";

import { faFloppyDisk, faPlus, faRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { Textarea } from "@/components/ui/textarea";
import type { BranchRecord } from "@/features/branches/types";
import type { EmployeeFormValue } from "@/features/employees/types";
import { canHavePanelAccess } from "@/lib/auth/panel-access";
import {
  documentTypeOptions,
  employeeStatusOptions,
  roleOptions,
} from "@/lib/ui/labels";

type EmployeeFormProps = {
  value: EmployeeFormValue;
  branches: BranchRecord[];
  isSaving: boolean;
  isEditing: boolean;
  onChange: (next: EmployeeFormValue) => void;
  onSubmit: () => void;
  onReset: () => void;
};

export function EmployeeForm({
  value,
  branches,
  isSaving,
  isEditing,
  onChange,
  onSubmit,
  onReset,
}: EmployeeFormProps) {
  function updateField<K extends keyof EmployeeFormValue>(key: K, nextValue: EmployeeFormValue[K]) {
    onChange({ ...value, [key]: nextValue });
  }

  const accessLocked = isEditing;
  const canConfigureAccess = canHavePanelAccess(value.role);

  function updateRole(nextRole: EmployeeFormValue["role"]) {
    const canKeepAccess = canHavePanelAccess(nextRole);

    onChange({
      ...value,
      role: nextRole,
      can_login: canKeepAccess ? value.can_login : false,
      temporary_password: canKeepAccess ? value.temporary_password : "",
    });
  }

  return (
    <div className="space-y-4">
      <TextField
        label="Nombre completo"
        value={value.full_name}
        onChange={(event) => updateField("full_name", event.target.value)}
        placeholder="Nombre y apellido"
        required
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Tipo de documento"
          value={value.document_type}
          onChange={(event) =>
            updateField("document_type", event.target.value as EmployeeFormValue["document_type"])
          }
        >
          <option value="">Selecciona un tipo</option>
          {documentTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>

        <TextField
          label="Número de documento"
          value={value.document_number}
          onChange={(event) => updateField("document_number", event.target.value)}
          placeholder="12345678"
        />
      </div>

      <section className="space-y-3 rounded-xl border border-sky-100 bg-sky-50 p-4">
        <div><p className="text-sm font-semibold text-slate-800">Remuneración</p><p className="text-xs text-slate-600">Es independiente del rol y del cargo. Si se deja sin fecha, queda pendiente de configurar.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Tipo de remuneración" value={value.compensation_type} onChange={(event) => updateField("compensation_type", event.target.value as EmployeeFormValue["compensation_type"])}>
            <option value="commission_plus_bonus">Comisión + bonos</option><option value="commission_only">Solo comisiones</option><option value="fixed_plus_bonus">Fijo + bonos</option><option value="fixed">Solo fijo</option>
          </SelectField>
          <TextField label="Vigente desde" type="date" value={value.compensation_effective_from} onChange={(event) => updateField("compensation_effective_from", event.target.value)} />
          {["commission_plus_bonus", "commission_only"].includes(value.compensation_type) ? <p className="text-sm text-slate-600">El porcentaje de comisión se asigna al preparar cada liquidación.</p> : <TextField label="Sueldo base mensual" type="number" min="0.01" step="0.01" value={value.base_monthly_salary} onChange={(event) => updateField("base_monthly_salary", event.target.value)} required />}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={value.mandatory_discount_enabled} onChange={(event) => updateField("mandatory_discount_enabled", event.target.checked)} />Aplicar descuento obligatorio</label>
        {value.mandatory_discount_enabled ? <TextField label="Porcentaje descuento obligatorio" type="number" min="0" max="100" step="0.01" value={value.mandatory_discount_rate} onChange={(event) => updateField("mandatory_discount_rate", event.target.value)} /> : null}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Email"
          type="email"
          value={value.email}
          onChange={(event) => updateField("email", event.target.value)}
          placeholder="persona@lbbs.pe"
          required
        />

        <TextField
          label="Teléfono"
          value={value.phone}
          onChange={(event) => updateField("phone", event.target.value)}
          placeholder="+51 ..."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Sede"
          value={value.branch_id}
          onChange={(event) => updateField("branch_id", event.target.value)}
        >
          <option value="">Sin sede</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Rol"
          value={value.role}
          onChange={(event) => updateRole(event.target.value as EmployeeFormValue["role"])}
        >
          {roleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Estado"
          value={value.status}
          onChange={(event) => updateField("status", event.target.value as EmployeeFormValue["status"])}
        >
          {employeeStatusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>

        <TextField
          label="Cargo"
          value={value.position}
          onChange={(event) => updateField("position", event.target.value)}
          placeholder="Barbero principal"
        />
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <input
          type="checkbox"
          checked={value.can_login}
          disabled={accessLocked || !canConfigureAccess}
          onChange={(event) => updateField("can_login", event.target.checked)}
          className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500/20 disabled:opacity-60"
        />
        <span className="space-y-1">
          <span className="block text-sm font-medium text-slate-700">Acceso al sistema</span>
          <span className="block text-xs text-slate-500">
            {accessLocked
              ? "Este ajuste queda definido al crear el empleado."
              : "Activa esta opción solo si el empleado tendrá inicio de sesión."}
          </span>
        </span>
      </label>

      {!isEditing && value.can_login ? (
        <TextField
          label="Contraseña temporal"
          type="password"
          value={value.temporary_password}
          onChange={(event) => updateField("temporary_password", event.target.value)}
          placeholder="Ingresa la contraseña temporal"
          required
        />
      ) : null}

      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-700">Notas</span>
        <Textarea
          value={value.notes}
          onChange={(event) => updateField("notes", event.target.value)}
          placeholder="Notas internas"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button type="button" onClick={onSubmit} disabled={isSaving}>
          <FontAwesomeIcon icon={isEditing ? faFloppyDisk : faPlus} />
          {isSaving ? "Guardando..." : isEditing ? "Actualizar empleado" : "Crear empleado"}
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

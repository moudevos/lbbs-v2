"use client";

import { faChevronDown, faFloppyDisk, faMagnifyingGlass, faPlus, faRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { Textarea } from "@/components/ui/textarea";
import type { CustomerFormValue } from "@/features/customers/customer-types";
import { customerDocumentTypeOptions } from "@/lib/ui/labels";
import { validateCustomerDocument } from "@/lib/utils/document";

type CustomerFormProps = {
  value: CustomerFormValue;
  isSaving: boolean;
  isLookingUpDocument: boolean;
  isEditing: boolean;
  submitLabel?: string;
  onChange: (next: CustomerFormValue) => void;
  onLookupDocument: () => void;
  onSubmit: () => void;
  onReset: () => void;
};

export function CustomerForm({
  value,
  isSaving,
  isLookingUpDocument,
  isEditing,
  submitLabel,
  onChange,
  onLookupDocument,
  onSubmit,
  onReset,
}: CustomerFormProps) {
  const [showAdditionalData, setShowAdditionalData] = useState(false);

  function updateField<K extends keyof CustomerFormValue>(key: K, nextValue: CustomerFormValue[K]) {
    onChange({ ...value, [key]: nextValue });
  }

  const isBusinessDocument = value.document_type === "RUC";
  const canLookup = !validateCustomerDocument(value.document_type, value.document_number);
  const showLookupButton = value.document_type === "DNI" || value.document_type === "RUC";

  return (
    <div className="space-y-5">
      <section className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">Identificacion</p>
          <p className="mt-1 text-sm text-slate-600">
            Completa el documento y usa busqueda solo para DNI o RUC.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.2fr_auto]">
          <SelectField
            label="Tipo de documento"
            value={value.document_type}
            onChange={(event) =>
              updateField("document_type", event.target.value as CustomerFormValue["document_type"])
            }
            autoFocus
          >
            <option value="">Sin documento</option>
            {customerDocumentTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>

          <TextField
            label="Numero de documento"
            value={value.document_number}
            onChange={(event) => updateField("document_number", event.target.value)}
            placeholder={value.document_type === "RUC" ? "20123456789" : "12345678"}
          />

          <div className="flex items-end">
            {showLookupButton ? (
              <Button
                type="button"
                className="h-11 w-full bg-sky-100 px-4 text-sky-700 hover:bg-sky-200 lg:w-auto"
                onClick={onLookupDocument}
                disabled={!canLookup || isLookingUpDocument}
              >
                <FontAwesomeIcon icon={faMagnifyingGlass} />
                {isLookingUpDocument ? "Buscando..." : "Buscar"}
              </Button>
            ) : (
              <div className="hidden h-11 lg:block" />
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">Datos principales</p>
          <p className="mt-1 text-sm text-slate-600">
            Registra solo lo necesario para continuar rapido.
          </p>
        </div>

        {isBusinessDocument ? (
          <TextField
            label="Razon social"
            value={value.business_name}
            onChange={(event) => updateField("business_name", event.target.value)}
            placeholder="Nombre o razon social"
            required
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Nombres"
              value={value.first_name}
              onChange={(event) => updateField("first_name", event.target.value)}
              placeholder="Nombres del cliente"
              required
            />

            <TextField
              label="Apellidos"
              value={value.last_name}
              onChange={(event) => updateField("last_name", event.target.value)}
              placeholder="Apellidos del cliente"
            />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Celular"
            value={value.phone}
            onChange={(event) => updateField("phone", event.target.value)}
            placeholder="+51 955 131 793"
            required
          />

          <TextField
            label="Correo"
            type="email"
            value={value.email}
            onChange={(event) => updateField("email", event.target.value)}
            placeholder="cliente@correo.com"
          />
        </div>
      </section>

      <details
        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
        open={showAdditionalData}
        onToggle={(event) => setShowAdditionalData(event.currentTarget.open)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-900">
          <span>Datos adicionales</span>
          <FontAwesomeIcon
            icon={faChevronDown}
            className={[
              "h-3.5 w-3.5 text-slate-500 transition",
              showAdditionalData ? "rotate-180" : "",
            ].join(" ")}
          />
        </summary>

        <div className="mt-4 space-y-4">
          <TextField
            label="Fecha de nacimiento"
            type="date"
            value={value.birthdate}
            onChange={(event) => updateField("birthdate", event.target.value)}
          />

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Notas</span>
            <Textarea
              value={value.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              placeholder="Notas internas del cliente"
            />
          </label>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button type="button" onClick={onSubmit} disabled={isSaving}>
          <FontAwesomeIcon icon={isEditing ? faFloppyDisk : faPlus} />
          {isSaving
            ? "Guardando..."
            : submitLabel ?? (isEditing ? "Actualizar cliente" : "Crear cliente")}
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

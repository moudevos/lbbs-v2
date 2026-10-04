"use client";

import { faPen, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useRef } from "react";

import type { CustomerRecord } from "@/features/customers/customer-types";

type CustomerProfileModalProps = {
  customer: CustomerRecord | null;
  onClose: () => void;
  onEdit: (customer: CustomerRecord) => void;
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const second = parts.length > 1 ? (parts[1][0] ?? "") : "";
  return (first + second).toUpperCase();
}

// "2000-05-21" -> "21/05/2000" (sin pasar por Date para evitar desfases de zona horaria)
function formatBirthdate(value: string | null) {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function calculateAge(value: string | null) {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;

  const today = new Date();
  let age = today.getFullYear() - year;
  const hadBirthday = today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  if (!hadBirthday) age -= 1;

  return age >= 0 ? age : null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

const empty = <span className="font-normal text-slate-400">—</span>;

export function CustomerProfileModal({ customer, onClose, onEdit }: CustomerProfileModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isOpen = Boolean(customer);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!customer) return null;

  const birthdate = formatBirthdate(customer.birthdate);
  const age = calculateAge(customer.birthdate);
  const hasPersonName = Boolean(customer.first_name || customer.last_name);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-profile-title"
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl"
      >
        {/* Cabecera del perfil */}
        <div className="relative border-b border-sky-100 bg-[linear-gradient(135deg,#ffffff_0%,#f0f9ff_58%,#ecfdf5_100%)] px-5 pb-5 pt-6">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white/80 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>

          <div className="flex items-center gap-4">
            <span
              className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold ring-4 ring-white ${
                customer.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
              }`}
            >
              {getInitials(customer.full_name)}
            </span>
            <div className="min-w-0 pr-8">
              <h2 id="customer-profile-title" className="break-words text-lg font-semibold leading-tight text-slate-900">
                {customer.full_name}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                    customer.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${customer.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
                  {customer.is_active ? "Activo" : "Inactivo"}
                </span>
                {customer.document_type ? (
                  <span className="rounded-md bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                    {customer.document_type}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* Datos (solo lectura) */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <section>
            <h3 className="text-sm font-semibold text-slate-900">Contacto</h3>
            <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Field label="Teléfono">
                {customer.phone ? (
                  <a href={`tel:${customer.phone}`} className="tabular-nums hover:text-emerald-700 hover:underline">
                    {customer.phone}
                  </a>
                ) : (
                  empty
                )}
              </Field>
              <Field label="Email">
                {customer.email ? (
                  <a href={`mailto:${customer.email}`} className="hover:text-emerald-700 hover:underline">
                    {customer.email}
                  </a>
                ) : (
                  empty
                )}
              </Field>
            </dl>
          </section>

          <section className="border-t border-slate-100 pt-5">
            <h3 className="text-sm font-semibold text-slate-900">Identificación</h3>
            <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Field label="Tipo de documento">{customer.document_type || empty}</Field>
              <Field label="Número de documento">
                {customer.document_number ? <span className="tabular-nums">{customer.document_number}</span> : empty}
              </Field>
              {customer.business_name ? <Field label="Razón social">{customer.business_name}</Field> : null}
              {hasPersonName ? (
                <>
                  <Field label="Nombres">{customer.first_name || empty}</Field>
                  <Field label="Apellidos">{customer.last_name || empty}</Field>
                </>
              ) : null}
            </dl>
          </section>

          <section className="border-t border-slate-100 pt-5">
            <h3 className="text-sm font-semibold text-slate-900">Datos personales</h3>
            <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Field label="Fecha de nacimiento">
                {birthdate ? <span className="tabular-nums">{birthdate}</span> : empty}
              </Field>
              <Field label="Edad">{age !== null ? `${age} años` : empty}</Field>
            </dl>
          </section>

          <section className="border-t border-slate-100 pt-5">
            <h3 className="text-sm font-semibold text-slate-900">Notas</h3>
            {customer.notes ? (
              <p className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
                {customer.notes}
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-400">Sin notas registradas.</p>
            )}
          </section>
        </div>

        {/* Pie */}
        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => onEdit(customer)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            <FontAwesomeIcon icon={faPen} className="h-3 w-3" />
            Editar cliente
          </button>
        </div>
      </div>
    </div>
  );
}
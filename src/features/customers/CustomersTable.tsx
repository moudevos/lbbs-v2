"use client";

import { faEye, faPen, faUserCheck, faUserSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type { CustomerRecord } from "@/features/customers/customer-types";

type CustomersTableProps = {
  customers: CustomerRecord[];
  onView: (customer: CustomerRecord) => void;
  onEdit: (customer: CustomerRecord) => void;
  onToggleActive: (customer: CustomerRecord) => void;
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
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export function CustomersTable({ customers, onView, onEdit, onToggleActive }: CustomersTableProps) {
  return (
    <section className="max-h-[calc(100dvh-16rem)] min-h-[240px] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[860px] border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr className="text-xs font-medium text-slate-500">
            <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3">Cliente</th>
            <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3">Documento</th>
            <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3">Contacto</th>
            <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3">Nacimiento</th>
            <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3">Estado</th>
            <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {customers.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                No hay clientes que coincidan con la búsqueda.
              </td>
            </tr>
          ) : (
            customers.map((customer) => {
              const isCompany = Boolean(customer.business_name) && customer.document_type === "RUC";
              return (
                <tr key={customer.id} className="group transition-colors hover:bg-slate-50/80">
                  <td className="border-b border-slate-100 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                          customer.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {getInitials(customer.full_name)}
                      </span>
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onView(customer)}
                          className={`block max-w-full truncate text-left font-medium hover:text-emerald-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
                            customer.is_active ? "text-slate-900" : "text-slate-500"
                          }`}
                          title={`Ver perfil de ${customer.full_name}`}
                        >
                          {customer.full_name}
                        </button>
                        {customer.notes ? (
                          <p className="max-w-[240px] truncate text-xs text-slate-400" title={customer.notes}>
                            {customer.notes}
                          </p>
                        ) : isCompany ? (
                          <p className="text-xs text-slate-400">Empresa</p>
                        ) : null}
                      </div>
                    </div>
                  </td>

                  <td className="border-b border-slate-100 px-4 py-3">
                    {customer.document_number ? (
                      <div className="flex items-center gap-2">
                        {customer.document_type ? (
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                            {customer.document_type}
                          </span>
                        ) : null}
                        <span className="tabular-nums text-slate-700">{customer.document_number}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>

                  <td className="border-b border-slate-100 px-4 py-3">
                    <p className="tabular-nums text-slate-800">{customer.phone}</p>
                    {customer.email ? (
                      <p className="max-w-[220px] truncate text-xs text-slate-500" title={customer.email}>
                        {customer.email}
                      </p>
                    ) : null}
                  </td>

                  <td className="border-b border-slate-100 px-4 py-3 tabular-nums text-slate-600">
                    {formatBirthdate(customer.birthdate)}
                  </td>

                  <td className="border-b border-slate-100 px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                        customer.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${customer.is_active ? "bg-emerald-500" : "bg-slate-400"}`}
                      />
                      {customer.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </td>

                  <td className="border-b border-slate-100 px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onView(customer)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                      >
                        <FontAwesomeIcon icon={faEye} className="h-3 w-3" />
                        Ver
                      </button>
                      <button
                        type="button"
                        onClick={() => onEdit(customer)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                      >
                        <FontAwesomeIcon icon={faPen} className="h-3 w-3" />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleActive(customer)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
                          customer.is_active
                            ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        }`}
                      >
                        <FontAwesomeIcon icon={customer.is_active ? faUserSlash : faUserCheck} className="h-3 w-3" />
                        {customer.is_active ? "Inactivar" : "Reactivar"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </section>
  );
}
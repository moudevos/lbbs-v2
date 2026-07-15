"use client";

import { faPenToSquare, faPowerOff } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@/components/ui/button";
import { CustomerStatusBadge } from "@/features/customers/CustomerStatusBadge";
import type { CustomerRecord } from "@/features/customers/customer-types";
import {
  customerDocumentTypeLabels,
  customerSourceLabels,
} from "@/lib/ui/labels";

type CustomersTableProps = {
  customers: CustomerRecord[];
  onEdit: (customer: CustomerRecord) => void;
  onToggleActive: (customer: CustomerRecord) => void;
};

export function CustomersTable({ customers, onEdit, onToggleActive }: CustomersTableProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Clientes</p>
          <p className="mt-1 text-sm text-slate-600">
            Base central para reservas, ventas y rewards.
          </p>
        </div>

        <p className="text-sm text-slate-500">{customers.length} clientes</p>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-500">
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Documento</th>
              <th className="px-3 py-2">Origen</th>
              <th className="px-3 py-2">Sede</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id} className="rounded-xl bg-slate-50">
                <td className="px-3 py-3 text-sm text-slate-700">
                  <div className="font-medium text-slate-900">{customer.full_name}</div>
                  <div className="text-xs text-slate-500">
                    {customer.phone}
                    {customer.email ? ` · ${customer.email}` : ""}
                  </div>
                </td>
                <td className="px-3 py-3 text-sm text-slate-700">
                  <div className="font-medium text-slate-900">
                    {customer.document_type
                      ? customerDocumentTypeLabels[customer.document_type]
                      : "Sin documento"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {customer.document_number ?? "Sin numero"}
                  </div>
                </td>
                <td className="px-3 py-3 text-sm text-slate-700">
                  {customerSourceLabels[customer.source]}
                </td>
                <td className="px-3 py-3 text-sm text-slate-700">
                  {customer.preferred_branch_name ?? "Sin sede preferida"}
                </td>
                <td className="px-3 py-3">
                  <CustomerStatusBadge isActive={customer.is_active} />
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      className="h-9 bg-slate-100 px-3 text-slate-700 hover:bg-slate-200"
                      onClick={() => onEdit(customer)}
                    >
                      <FontAwesomeIcon icon={faPenToSquare} />
                    </Button>
                    <Button
                      type="button"
                      className={[
                        "h-9 px-3",
                        customer.is_active
                          ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                          : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
                      ].join(" ")}
                      onClick={() => onToggleActive(customer)}
                    >
                      <FontAwesomeIcon icon={faPowerOff} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}

            {customers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">
                  No hay clientes para mostrar.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

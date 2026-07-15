"use client";

import {
  faPenToSquare,
  faPowerOff,
  faStore,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { StatusBadge } from "@/components/feedback/status-badge";
import { Button } from "@/components/ui/button";
import type { ServiceRecord } from "@/features/services/service-types";
import { priceModeLabels } from "@/lib/ui/labels";

type ServicesTableProps = {
  services: ServiceRecord[];
  branchName: string | null;
  onEdit: (service: ServiceRecord) => void;
  onManageBranchPrice: (service: ServiceRecord) => void;
  onToggleActive: (service: ServiceRecord) => void;
};

function formatMoney(value: string) {
  const numeric = Number(value);

  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

export function ServicesTable({
  services,
  branchName,
  onEdit,
  onManageBranchPrice,
  onToggleActive,
}: ServicesTableProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Servicios</p>
          <p className="mt-1 text-sm text-slate-600">
            {branchName
              ? `Precios efectivos para ${branchName}.`
              : "Catalogo global de servicios con precio base."}
          </p>
        </div>

        <p className="text-sm text-slate-500">{services.length} servicios</p>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-500">
              <th className="px-3 py-2">Servicio</th>
              <th className="px-3 py-2">Categoria</th>
              <th className="px-3 py-2">Duracion</th>
              <th className="px-3 py-2">Precio base</th>
              <th className="px-3 py-2">Precio final</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <tr key={service.id} className="rounded-xl bg-slate-50">
                <td className="px-3 py-3 text-sm text-slate-700">
                  <div className="font-medium text-slate-900">{service.name}</div>
                  <div className="text-xs text-slate-500">
                    {service.description ?? "Sin descripcion"}
                  </div>
                </td>
                <td className="px-3 py-3 text-sm text-slate-700">
                  {service.category_name ?? "Sin categoria"}
                </td>
                <td className="px-3 py-3 text-sm text-slate-700">
                  {service.duration_minutes} min
                </td>
                <td className="px-3 py-3 text-sm text-slate-700">
                  {formatMoney(service.base_price)}
                </td>
                <td className="px-3 py-3 text-sm text-slate-700">
                  <div className="font-medium text-slate-900">
                    {formatMoney(service.final_price)}
                  </div>
                  <div className="text-xs text-slate-500">
                    {service.price_mode === "custom"
                      ? priceModeLabels.custom
                      : priceModeLabels.base}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <StatusBadge status={service.is_active ? "active" : "inactive"} />
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      className="h-9 bg-slate-100 px-3 text-slate-700 hover:bg-slate-200"
                      onClick={() => onEdit(service)}
                    >
                      <FontAwesomeIcon icon={faPenToSquare} />
                    </Button>
                    <Button
                      type="button"
                      className="h-9 bg-sky-100 px-3 text-sky-700 hover:bg-sky-200"
                      onClick={() => onManageBranchPrice(service)}
                    >
                      <FontAwesomeIcon icon={faStore} />
                    </Button>
                    <Button
                      type="button"
                      className={[
                        "h-9 px-3",
                        service.is_active
                          ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                          : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
                      ].join(" ")}
                      onClick={() => onToggleActive(service)}
                    >
                      <FontAwesomeIcon icon={faPowerOff} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}

            {services.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-500">
                  No hay servicios para mostrar.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

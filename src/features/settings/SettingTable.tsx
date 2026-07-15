"use client";

import {
  faPenToSquare,
  faPlus,
  faPowerOff,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@/components/ui/button";
import { SettingStatusBadge } from "@/features/settings/SettingStatusBadge";
import { getMovementTypeLabel } from "@/features/settings/settings-actions";
import type {
  SettingRecord,
  SettingsSectionConfig,
} from "@/features/settings/settings-types";

type SettingTableProps = {
  config: SettingsSectionConfig;
  items: SettingRecord[];
  isLoading: boolean;
  onCreate: () => void;
  onEdit: (item: SettingRecord) => void;
  onToggleActive: (item: SettingRecord) => void;
};

export function SettingTable({
  config,
  items,
  isLoading,
  onCreate,
  onEdit,
  onToggleActive,
}: SettingTableProps) {
  if (isLoading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-600">Cargando configuraciones...</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">{config.title}</p>
          <p className="mt-1 text-sm text-slate-600">{config.description}</p>
        </div>

        <Button type="button" onClick={onCreate}>
          <FontAwesomeIcon icon={faPlus} />
          {config.buttonLabel}
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm font-semibold text-slate-900">{config.emptyTitle}</p>
          <p className="mt-2 text-sm text-slate-500">{config.emptyDescription}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50/80">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Registro</th>
                <th className="px-5 py-3">{config.identityLabel}</th>
                {config.supportsMovementType ? (
                  <th className="px-5 py-3">Movimiento</th>
                ) : null}
                <th className="px-5 py-3">Orden</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {items.map((item) => {
                const identity =
                  config.identityKey === "slug" ? item.slug ?? "-" : item.code ?? "-";

                return (
                  <tr key={item.id} className="align-top">
                    <td className="px-5 py-4">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                        <p className="text-sm text-slate-500">
                          {item.description?.trim() || "Sin descripcion adicional."}
                        </p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                        {identity}
                      </span>
                    </td>
                    {config.supportsMovementType ? (
                      <td className="px-5 py-4 text-sm text-slate-600">
                        {getMovementTypeLabel(item.movement_type)}
                      </td>
                    ) : null}
                    <td className="px-5 py-4 text-sm text-slate-600">{item.sort_order}</td>
                    <td className="px-5 py-4">
                      <SettingStatusBadge active={item.is_active} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onEdit(item)}
                          className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:border-sky-200 hover:text-sky-700"
                        >
                          <FontAwesomeIcon icon={faPenToSquare} />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleActive(item)}
                          className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:border-emerald-200 hover:text-emerald-700"
                        >
                          <FontAwesomeIcon icon={faPowerOff} />
                          {item.is_active ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

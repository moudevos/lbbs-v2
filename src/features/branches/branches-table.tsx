"use client";

import { faEye, faPenToSquare, faToggleOff, faToggleOn } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/feedback/status-badge";
import type { BranchRecord } from "@/features/branches/types";

type BranchesTableProps = {
  branches: BranchRecord[];
  onView: (branch: BranchRecord) => void;
  onEdit: (branch: BranchRecord) => void;
  onToggleActive: (branch: BranchRecord) => void;
};

export function BranchesTable({ branches, onView, onEdit, onToggleActive }: BranchesTableProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Sedes</p>
          <p className="mt-1 text-sm text-slate-600">
            Registro operativo de sedes activas e inactivas.
          </p>
        </div>

        <p className="text-sm text-slate-500">{branches.length} sedes</p>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-500">
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Ciudad</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((branch) => (
              <tr key={branch.id} className="rounded-xl bg-slate-50">
                <td className="px-3 py-3 text-sm font-medium text-slate-900">
                  {branch.code ?? "Sin código"}
                </td>
                <td className="px-3 py-3 text-sm text-slate-700">
                  <div className="font-medium text-slate-900">{branch.name}</div>
                  <div className="text-xs text-slate-500">{branch.short_name ?? "Sin alias"}</div>
                </td>
                <td className="px-3 py-3 text-sm text-slate-700">{branch.city ?? "Sin ciudad"}</td>
                <td className="px-3 py-3">
                  <StatusBadge status={branch.is_active ? "active" : "inactive"} />
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      className="h-9 bg-sky-100 px-3 text-sky-700 hover:bg-sky-200"
                      onClick={() => onView(branch)}>
                      <FontAwesomeIcon icon={faEye} />
                    </Button>
                    <Button
                      type="button"
                      className="h-9 bg-slate-100 px-3 text-slate-700 hover:bg-slate-200"
                      onClick={() => onEdit(branch)}
                    >
                      <FontAwesomeIcon icon={faPenToSquare} />
                    </Button>
                    <Button
                      type="button"
                      className={[
                        "h-9 px-3",
                        branch.is_active
                          ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                          : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
                      ].join(" ")}
                      onClick={() => onToggleActive(branch)}
                    >
                      <FontAwesomeIcon icon={branch.is_active ? faToggleOff : faToggleOn} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}

            {branches.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-500">
                  No hay sedes para mostrar.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

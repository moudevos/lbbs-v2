"use client";

import { Button } from "@/components/ui/button";
import { CashMovementStatusBadge } from "@/features/cash/CashMovementStatusBadge";
import type { CashMovementRecord } from "@/features/cash/cash-types";

function formatMoney(value: string) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(Number(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function getTypeLabel(value: CashMovementRecord["movement_type"]) {
  if (value === "income") {
    return "Ingreso";
  }

  if (value === "expense") {
    return "Egreso";
  }

  return "Ajuste";
}

function getDisplayType(movement: CashMovementRecord) {
  return movement.category_code === "cash_withdrawal" ? "Retiro" : getTypeLabel(movement.movement_type);
}

type CashMovementsTableProps = {
  movements: CashMovementRecord[];
  isLoading: boolean;
  onCancel: (movement: CashMovementRecord) => void;
  cancellingId: string | null;
};

export function CashMovementsTable({
  movements,
  isLoading,
  onCancel,
  cancellingId,
}: CashMovementsTableProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <p className="text-sm font-semibold text-slate-900">Movimientos operativos</p>
        <p className="mt-1 text-sm text-slate-600">
          Incluye movimientos de la sede, incluso de sesiones cerradas. Solo los activos afectan el cuadre.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha/hora</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Categoria</th>
              <th className="px-4 py-3 font-medium">Descripcion</th>
              <th className="px-4 py-3 font-medium">Monto</th>
              <th className="px-4 py-3 font-medium">Registrado por</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {!isLoading && movements.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                  No hay movimientos para los filtros seleccionados.
                </td>
              </tr>
            ) : null}

            {movements.map((movement) => (
              <tr key={movement.id} className="align-top">
                <td className="px-4 py-3 text-slate-600">{formatDateTime(movement.created_at)}</td>
                <td className="px-4 py-3 text-slate-700">{getDisplayType(movement)}</td>
                <td className="px-4 py-3 text-slate-700">{movement.category_name ?? "Sin categoria"}</td>
                <td className="px-4 py-3 text-slate-700">
                  <div className="space-y-1">
                    <p>{movement.description}</p>
                    {movement.cancelled_reason ? (
                      <p className="text-xs text-rose-600">
                        Motivo de anulacion: {movement.cancelled_reason}
                      </p>
                    ) : null}
                    {movement.status === "cancelled" && movement.cancelled_at ? (
                      <p className="text-xs text-slate-500">
                        Anulado el {formatDateTime(movement.cancelled_at)} por {movement.cancelled_by_name ?? "Sin registro"}
                      </p>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 font-medium text-slate-900">{formatMoney(movement.amount)}</td>
                <td className="px-4 py-3 text-slate-700">{movement.created_by_name ?? "Sin usuario"}</td>
                <td className="px-4 py-3">
                  <CashMovementStatusBadge status={movement.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {movement.evidence_url ? (
                      <a
                        href={movement.evidence_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:border-sky-200 hover:text-sky-700"
                      >
                        Evidencia
                      </a>
                    ) : null}
                    <Button
                      type="button"
                      className="h-9 bg-rose-100 px-3 text-rose-700 hover:bg-rose-200 disabled:bg-slate-100 disabled:text-slate-400"
                      disabled={movement.status !== "active" || cancellingId === movement.id}
                      onClick={() => onCancel(movement)}
                    >
                      {cancellingId === movement.id ? "Anulando..." : "Anular"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

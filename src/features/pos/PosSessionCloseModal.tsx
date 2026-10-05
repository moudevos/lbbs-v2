"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/textarea";
import type { PosSessionCloseSummary } from "@/features/pos/pos-types";
import { formatMoney } from "@/features/pos/pos-utils";

type Props = {
  open: boolean;
  summary: PosSessionCloseSummary | null;
  countedAmounts: Record<string, string>;
  notes: string;
  isLoading: boolean;
  isSubmitting: boolean;
  onCountedAmountChange: (methodId: string, value: string) => void;
  onNotesChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

function formatDateTime(value: string | null) {
  if (!value) return "Sin registro";
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function differenceLabel(value: number) {
  if (Math.abs(value) < 0.005) return "OK";
  return value > 0 ? "Sobrante" : "Faltante";
}

export function PosSessionCloseModal({
  open,
  summary,
  countedAmounts,
  notes,
  isLoading,
  isSubmitting,
  onCountedAmountChange,
  onNotesChange,
  onClose,
  onSubmit,
}: Props) {
  const differences = (summary?.paymentMethods ?? []).map((method) => {
    const counted = Number(countedAmounts[method.paymentMethodId] ?? "0");
    return {
      ...method,
      counted: Number.isFinite(counted) ? counted : 0,
      difference: (Number.isFinite(counted) ? counted : 0) - method.expectedAmount,
    };
  });
  const isBlocked = Boolean(
    !summary ||
    summary.draftSalesCount > 0 ||
    isLoading ||
    isSubmitting,
  );
  function differenceTone(value: number) {
    if (Math.abs(value) < 0.005) return { text: "text-slate-500", badge: "bg-emerald-50 text-emerald-700" };
    return value > 0
      ? { text: "text-amber-700", badge: "bg-amber-50 text-amber-700" }
      : { text: "text-rose-700", badge: "bg-rose-50 text-rose-700" };
  }

  return (
    <Modal
      open={open}
      title={summary?.status === "closed" ? "Detalle del cierre POS" : "Cerrar sesion POS"}
      description="Resumen operativo y validacion de montos por metodo."
      onClose={onClose}
      isDirty={Object.values(countedAmounts).some((value) => value !== "0") || Boolean(notes.trim())}
      size="xl"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" className="bg-white text-slate-700 hover:bg-slate-100" onClick={onClose}>
            {summary?.status === "closed" ? "Cerrar" : "Cancelar"}
          </Button>
          {summary?.status !== "closed" ? (
            <Button type="button" disabled={isBlocked} onClick={onSubmit}>
              {isSubmitting ? "Cerrando..." : "Confirmar cierre"}
            </Button>
          ) : null}
        </div>
      }
    >
      {!summary || isLoading ? (
        <p className="text-sm text-slate-600">Cargando resumen de cierre...</p>
      ) : (
        <div className="max-h-[calc(100vh-14rem)] space-y-5 overflow-y-auto pr-1">
          <section className="grid gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm md:grid-cols-3">
            <p><span className="text-slate-500">Sede:</span> <strong>{summary.branchName}</strong></p>
            <p><span className="text-slate-500">Apertura:</span> <strong>{formatDateTime(summary.openedAt)}</strong></p>
            <p><span className="text-slate-500">Responsable:</span> <strong>{summary.openedByName ?? "Sin registro"}</strong></p>
          </section>

          {summary.draftSalesCount > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              No puedes cerrar la sesion con ventas en borrador.
            </div>
          ) : null}

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">Resumen de ventas</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-slate-500">Completas</dt><dd className="text-right font-medium">{summary.completedSalesCount}</dd>
                <dt className="text-slate-500">Anuladas</dt><dd className="text-right font-medium">{summary.cancelledSalesCount}</dd>
                <dt className="text-slate-500">En borrador</dt><dd className="text-right font-medium text-amber-700">{summary.draftSalesCount}</dd>
                <dt className="text-slate-500">Cortesias entregadas</dt><dd className="text-right font-medium">{summary.courtesyCount}</dd>
                <dt className="text-slate-500">Total bruto</dt><dd className="text-right font-medium">{formatMoney(summary.grossTotal)}</dd>
                <dt className="text-slate-500">Descuentos</dt><dd className="text-right font-medium">{formatMoney(summary.manualDiscountTotal)}</dd>
                <dt className="text-slate-500">Rewards</dt><dd className="text-right font-medium">{formatMoney(summary.rewardTotal)}</dd>
                <dt className="text-slate-500">Cortesias</dt><dd className="text-right font-medium">{formatMoney(summary.courtesyTotal)}</dd>
                <dt className="border-t border-slate-200 pt-2 font-semibold">Total neto</dt><dd className="border-t border-slate-200 pt-2 text-right font-semibold">{formatMoney(summary.netTotal)}</dd>
              </dl>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">Caja esperada por metodo</p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between text-slate-600"><span>Monto de apertura</span><strong>{formatMoney(summary.openingCashAmount)}</strong></div>
                {summary.paymentMethods.map((method) => (
                  <div key={method.paymentMethodId} className="flex justify-between text-slate-600">
                    <span>{method.name} esperado</span><strong>{formatMoney(method.expectedAmount)}</strong>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-900">Movimientos de efectivo</p>
            {summary.movements.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Sin movimientos de efectivo.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {summary.movements.map((movement) => (
                  <div key={movement.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 text-slate-600"><span className="block truncate">{movement.movementType === "income" ? "Ingreso de efectivo" : movement.movementType === "expense" ? "Salida de efectivo" : "Ajuste"}: {movement.description}</span><span className="block text-xs text-slate-400">{formatDateTime(movement.createdAt)}</span></span>
                    <strong className={movement.movementType === "expense" ? "text-rose-700" : "text-emerald-700"}>{movement.movementType === "expense" ? "-" : "+"}{formatMoney(movement.amount)}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-900">Rewards, descuentos y cortesias</p>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <p className="text-slate-600">Rewards: <strong>{formatMoney(summary.rewardTotal)}</strong></p>
              <p className="text-slate-600">Descuentos: <strong>{formatMoney(summary.manualDiscountTotal)}</strong></p>
              <p className="text-slate-600">Cortesias: <strong>{formatMoney(summary.courtesyTotal)}</strong></p>
            </div>
            {summary.rewards.length > 0 ? (
              <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
                {summary.rewards.map((reward) => (
                  <div key={reward.id} className="grid gap-1 py-2 text-xs text-slate-600 sm:grid-cols-[auto_1fr_auto] sm:gap-3">
                    <span>{formatDateTime(reward.appliedAt)}</span>
                    <span>{reward.saleReference} · {reward.customerName} · {reward.rewardName}</span>
                    <strong>{formatMoney(reward.discountAmount)}</strong>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-900">Validacion por metodo de pago</p>
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-2 text-left">Metodo</th>
                    <th className="px-3 py-2 text-right">Real</th>
                    <th className="px-3 py-2 text-right">Esperado</th>
                    <th className="px-3 py-2 text-right">Diferencia</th>
                    <th className="px-3 py-2 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {differences.map((item) => {
                    const difference = summary.status === "closed" ? item.differenceAmount ?? 0 : item.difference;
                    const tone = differenceTone(difference);
                    return (
                      <tr key={item.paymentMethodId}>
                        <td className="px-3 py-2 font-medium text-slate-900">{item.name}</td>
                        <td className="px-3 py-1.5 text-right">
                          <Input
                            className="ml-auto h-8 w-28 text-right tabular-nums"
                            type="number"
                            min="0"
                            step="0.01"
                            aria-label={`${item.name} validado`}
                            disabled={summary.status === "closed"}
                            value={summary.status === "closed" ? String(item.countedAmount ?? 0) : countedAmounts[item.paymentMethodId] ?? "0"}
                            onChange={(event) => onCountedAmountChange(item.paymentMethodId, event.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatMoney(item.expectedAmount)}</td>
                        <td className={`px-3 py-2 text-right font-semibold tabular-nums ${tone.text}`}>{formatMoney(difference)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${tone.badge}`}>{differenceLabel(difference)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="closing-notes">Observación del cierre (opcional)</label>
            <Textarea id="closing-notes" disabled={summary.status === "closed"} value={summary.status === "closed" ? summary.closingNotes ?? "" : notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="Observación opcional" className="min-h-24" />
          </section>

          {summary.status === "closed" ? (
            <section className="grid gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm sm:grid-cols-2">
              <p>Cerrada por: <strong>{summary.closedByName ?? "Sin registro"}</strong></p>
              <p>Cierre: <strong>{formatDateTime(summary.closedAt)}</strong></p>
            </section>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

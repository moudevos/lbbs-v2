"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import type { PosCourtesySessionSummary } from "@/features/pos/pos-types";

type Props = {
  open: boolean;
  data: PosCourtesySessionSummary | null;
  isLoading: boolean;
  onClose: () => void;
};

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function PosCourtesySummaryModal({
  open,
  data,
  isLoading,
  onClose,
}: Props) {
  return (
    <Modal
      open={open}
      title="Cortesias entregadas"
      description="Productos entregados como cortesia durante la sesion POS actual."
      onClose={onClose}
      confirmBeforeClose={false}
      size="md"
      footer={
        <Button
          type="button"
          className="bg-slate-100 text-slate-700 hover:bg-slate-200"
          onClick={onClose}
        >
          Cerrar
        </Button>
      }
    >
      {isLoading ? (
        <p className="py-8 text-center text-sm text-slate-500">
          Cargando cortesias...
        </p>
      ) : !data || data.products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-slate-700">
            Aun no se entregaron cortesias en esta sesion.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-violet-100 bg-violet-50 px-4 py-3">
            <span className="text-sm text-violet-800">Total entregado</span>
            <strong className="text-lg tabular-nums text-violet-900">
              {formatQuantity(data.totalQuantity)}
            </strong>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 text-left">Producto</th>
                  <th className="px-4 py-2.5 text-right">Cantidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.products.map((product) => (
                  <tr key={product.productId ?? product.productName}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {product.productName}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-700">
                      {formatQuantity(product.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50">
                <tr>
                  <td className="px-4 py-2.5 font-semibold text-slate-700">Total</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                    {formatQuantity(data.totalQuantity)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

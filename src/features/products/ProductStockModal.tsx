"use client";

import { faArrowRightArrowLeft, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import type {
  ProductRecord,
  ProductStockSummary,
  StockMovementRecord,
} from "@/features/products/product-types";
import { productMovementTypeLabels } from "@/lib/ui/labels";

type ProductStockModalProps = {
  open: boolean;
  product: ProductRecord | null;
  stockByBranch: ProductStockSummary[];
  movements: StockMovementRecord[];
  onClose: () => void;
  onCreateMovement: (branchId?: string) => void;
  canCreateForAllBranches?: boolean;
};

function formatMoney(value: string | null) {
  const numeric = Number(value);

  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

function formatQuantity(value: string) {
  const numeric = Number(value);

  return new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

export function ProductStockModal({
  open,
  product,
  stockByBranch,
  movements,
  onClose,
  onCreateMovement,
  canCreateForAllBranches = true,
}: ProductStockModalProps) {
  if (!product) {
    return null;
  }

  return (
    <Modal
      open={open}
      title="Stock por sede"
      description={`Resumen operativo de ${product.name}.`}
      onClose={onClose}
      size="xl"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="space-y-1 text-sm text-slate-600">
            <p>
              SKU: <span className="font-semibold text-slate-900">{product.sku ?? "Sin SKU"}</span>
            </p>
            <p>
              Precio base:{" "}
              <span className="font-semibold text-slate-900">
                {formatMoney(product.base_sale_price)}
              </span>
            </p>
          </div>

          <Button type="button" onClick={() => onCreateMovement()}>
            <FontAwesomeIcon icon={faPlus} />
            Registrar movimiento
          </Button>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {stockByBranch.map((item) => (
            <article
              key={item.branch_id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.branch_name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.branch_code ? `Codigo ${item.branch_code}` : item.branch_slug}
                  </p>
                </div>

                {canCreateForAllBranches ? (
                  <Button
                    type="button"
                    className="h-9 bg-sky-100 px-3 text-sky-700 hover:bg-sky-200"
                    onClick={() => onCreateMovement(item.branch_id)}
                  >
                    <FontAwesomeIcon icon={faArrowRightArrowLeft} />
                  </Button>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Stock</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {formatQuantity(item.stock_quantity)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Precio final</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {formatMoney(item.final_sale_price)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Precio sede
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {item.branch_sale_price ? formatMoney(item.branch_sale_price) : "Base"}
                  </p>
                </div>
              </div>
            </article>
          ))}

          {stockByBranch.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              No hay stock disponible para mostrar.
            </div>
          ) : null}
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Ultimos movimientos</p>
              <p className="mt-1 text-sm text-slate-600">
                El stock visible se calcula desde este historial.
              </p>
            </div>

            <p className="text-sm text-slate-500">{movements.length} registros</p>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Sede</th>
                  <th className="px-3 py-2">Movimiento</th>
                  <th className="px-3 py-2">Cantidad</th>
                  <th className="px-3 py-2">Costo</th>
                  <th className="px-3 py-2">Responsable</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id} className="rounded-xl bg-slate-50">
                    <td className="px-3 py-3 text-sm text-slate-700">
                      {new Date(movement.created_at).toLocaleString("es-PE")}
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-700">
                      {movement.branch_name ?? "Sede"}
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-700">
                      {productMovementTypeLabels[movement.movement_type]}
                    </td>
                    <td className="px-3 py-3 text-sm font-medium text-slate-900">
                      {formatQuantity(movement.signed_quantity)}
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-700">
                      {movement.unit_cost ? formatMoney(movement.unit_cost) : "Sin costo"}
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-700">
                      {movement.created_by_name ?? "Sin registro"}
                    </td>
                  </tr>
                ))}

                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">
                      Aun no hay movimientos registrados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Modal>
  );
}

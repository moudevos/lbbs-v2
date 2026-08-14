"use client";

import {
  faBoxArchive,
  faEye,
  faPenToSquare,
  faPowerOff,
  faStore,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@/components/ui/button";
import { ProductStatusBadge } from "@/features/products/ProductStatusBadge";
import type { ProductRecord } from "@/features/products/product-types";
import { priceModeLabels, productUnitLabels } from "@/lib/ui/labels";

type ProductsTableProps = {
  products: ProductRecord[];
  branchName: string | null;
  onView: (product: ProductRecord) => void;
  onEdit: (product: ProductRecord) => void;
  onManageBranchPrice: (product: ProductRecord) => void;
  onManageStock: (product: ProductRecord) => void;
  onToggleActive: (product: ProductRecord) => void;
  canManageCatalog?: boolean;
};

function formatMoney(value: string) {
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

export function ProductsTable({
  products,
  branchName,
  onView,
  onEdit,
  onManageBranchPrice,
  onManageStock,
  onToggleActive,
  canManageCatalog = true,
}: ProductsTableProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Productos</p>
          <p className="mt-1 text-sm text-slate-600">
            {branchName
              ? `Precio final y stock operativo para ${branchName}.`
              : "Catalogo global de productos."}
          </p>
        </div>

        <p className="text-sm text-slate-500">{products.length} productos</p>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-500">
              <th className="px-3 py-2">Producto</th>
              <th className="px-3 py-2">Categoria</th>
              <th className="px-3 py-2">Unidad</th>
              <th className="px-3 py-2">Precio base</th>
              <th className="px-3 py-2">Precio final</th>
              <th className="px-3 py-2">Stock</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="rounded-xl bg-slate-50">
                <td className="px-3 py-3 text-sm text-slate-700">
                  <div className="font-medium text-slate-900">{product.name}</div>
                  <div className="text-xs text-slate-500">
                    {product.sku ?? "Sin SKU"}
                    {product.barcode ? ` · ${product.barcode}` : ""}
                  </div>
                </td>
                <td className="px-3 py-3 text-sm text-slate-700">
                  {product.category_name ?? "Sin categoria"}
                </td>
                <td className="px-3 py-3 text-sm text-slate-700">
                  {productUnitLabels[product.unit]}
                </td>
                <td className="px-3 py-3 text-sm text-slate-700">
                  <div className="font-medium text-slate-900">
                    {formatMoney(product.base_sale_price)}
                  </div>
                  <div className="text-xs text-slate-500">
                    Costo {formatMoney(product.cost_price)}
                  </div>
                </td>
                <td className="px-3 py-3 text-sm text-slate-700">
                  <div className="font-medium text-slate-900">
                    {formatMoney(product.final_sale_price)}
                  </div>
                  <div className="text-xs text-slate-500">
                    {product.branch_sale_price ? priceModeLabels.custom : priceModeLabels.base}
                  </div>
                  {product.allow_custom_price ? (
                    <div className="text-xs text-sky-600">Precio manual permitido</div>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-sm text-slate-700">
                  {product.is_stockable ? formatQuantity(product.stock_quantity) : "No maneja"}
                </td>
                <td className="px-3 py-3">
                  <ProductStatusBadge isActive={product.is_active} />
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      className="h-9 bg-white px-3 text-slate-700 hover:bg-slate-100"
                      onClick={() => onView(product)}
                    >
                      <FontAwesomeIcon icon={faEye} />
                    </Button>
                    {canManageCatalog ? (
                      <>
                        <Button
                          type="button"
                          className="h-9 bg-slate-100 px-3 text-slate-700 hover:bg-slate-200"
                          onClick={() => onEdit(product)}
                        >
                          <FontAwesomeIcon icon={faPenToSquare} />
                        </Button>
                        <Button
                          type="button"
                          className="h-9 bg-sky-100 px-3 text-sky-700 hover:bg-sky-200"
                          onClick={() => onManageBranchPrice(product)}
                        >
                          <FontAwesomeIcon icon={faStore} />
                        </Button>
                      </>
                    ) : null}
                    <Button
                      type="button"
                      className="h-9 bg-emerald-100 px-3 text-emerald-700 hover:bg-emerald-200"
                      onClick={() => onManageStock(product)}
                    >
                      <FontAwesomeIcon icon={faBoxArchive} />
                    </Button>
                    {canManageCatalog ? (
                      <Button
                        type="button"
                        className={[
                          "h-9 px-3",
                          product.is_active
                            ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                            : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
                        ].join(" ")}
                        onClick={() => onToggleActive(product)}
                      >
                        <FontAwesomeIcon icon={faPowerOff} />
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}

            {products.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-500">
                  No hay productos para mostrar.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

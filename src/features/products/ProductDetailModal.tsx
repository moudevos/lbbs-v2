"use client";

import { Modal } from "@/components/ui/Modal";
import { ProductStatusBadge } from "@/features/products/ProductStatusBadge";
import type { ProductRecord } from "@/features/products/product-types";
import { productUnitLabels } from "@/lib/ui/labels";

type ProductDetailModalProps = {
  open: boolean;
  product: ProductRecord | null;
  onClose: () => void;
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

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

export function ProductDetailModal({
  open,
  product,
  onClose,
}: ProductDetailModalProps) {
  if (!product) {
    return null;
  }

  return (
    <Modal
      open={open}
      title="Detalle del producto"
      description="Consulta la informacion del producto sin entrar en modo edicion."
      onClose={onClose}
      size="lg"
      confirmBeforeClose={false}
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-slate-900">{product.name}</p>
              <p className="mt-1 text-sm text-slate-500">
                {product.sku ?? "Sin SKU"}
                {product.barcode ? ` · ${product.barcode}` : ""}
              </p>
            </div>

            <ProductStatusBadge isActive={product.is_active} />
          </div>

          <p className="mt-4 text-sm text-slate-600">
            {product.description ?? "Sin descripcion registrada."}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <DetailItem label="Categoria" value={product.category_name ?? "Sin categoria"} />
          <DetailItem label="Unidad" value={productUnitLabels[product.unit]} />
          <DetailItem
            label="Maneja stock"
            value={product.is_stockable ? "Si" : "No"}
          />
          <DetailItem
            label="Permite cortesia"
            value={product.is_courtesy_allowed ? "Si" : "No"}
          />
          <DetailItem
            label="Precio personalizado"
            value={product.allow_custom_price ? "Si" : "No"}
          />
          <DetailItem label="Costo de compra" value={formatMoney(product.cost_price)} />
          <DetailItem label="Precio base" value={formatMoney(product.base_sale_price)} />
          <DetailItem label="Precio final" value={formatMoney(product.final_sale_price)} />
          <DetailItem
            label="Stock visible"
            value={product.is_stockable ? formatQuantity(product.stock_quantity) : "No maneja"}
          />
          <DetailItem label="Slug" value={product.slug} />
        </div>
      </div>
    </Modal>
  );
}

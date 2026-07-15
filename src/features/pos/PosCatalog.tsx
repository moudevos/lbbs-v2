"use client";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PosCatalogCard } from "@/features/pos/PosCatalogCard";
import type {
  PosProductRecord,
  PosServiceRecord,
} from "@/features/pos/pos-types";

type PosCatalogProps = {
  search: string;
  onSearchChange: (value: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  serviceCategories: Array<{ id: string; name: string }>;
  productCategories: Array<{ id: string; name: string }>;
  services: PosServiceRecord[];
  products: PosProductRecord[];
  onAddService: (service: PosServiceRecord) => void;
  onAddProduct: (product: PosProductRecord) => void;
};

export function PosCatalog({
  search,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  serviceCategories,
  productCategories,
  services,
  products,
  onAddService,
  onAddProduct,
}: PosCatalogProps) {
  const categories = Array.from(
    new Map(
      [...serviceCategories, ...productCategories].map((category) => [category.id, category]),
    ).values(),
  );

  const hasItems = services.length > 0 || products.length > 0;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 p-2">
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar por nombre, categoria, SKU o codigo"
          className="h-9 flex-1"
        />

        <Select
          value={categoryFilter}
          onChange={(event) => onCategoryFilterChange(event.target.value)}
          className="h-9 w-48 shrink-0"
        >
          <option value="">Todas las categorias</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>

        <span className="shrink-0 text-xs font-medium text-slate-400">
          {services.length + products.length}
        </span>
      </div>

      <div className="grid min-h-0 flex-1 auto-rows-max content-start grid-cols-3 gap-1.5 overflow-y-auto p-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
        {services.map((service) => (
          <PosCatalogCard
            key={service.id}
            title={service.name}
            category={service.category_name}
            price={service.final_price}
            isInactive={!service.is_active}
            onAdd={() => onAddService(service)}
          />
        ))}

        {products.map((product) => (
          <PosCatalogCard
            key={product.id}
            title={product.name}
            category={product.category_name}
            price={product.final_sale_price}
            isInactive={!product.is_active}
            disabled={product.is_stockable && Number(product.stock_quantity) <= 0}
            onAdd={() => onAddProduct(product)}
          />
        ))}

        {!hasItems ? (
          <div className="col-span-full rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
            No hay servicios ni productos disponibles para esta sede.
          </div>
        ) : null}
      </div>
    </section>
  );
}
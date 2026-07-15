import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/supabase/route-auth";
import { normalizeSlug } from "@/lib/utils/slug";

function trimOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseMoney(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeMoneyValue(value: unknown) {
  const parsed = parseMoney(value);
  return parsed === null ? null : parsed.toFixed(2);
}

type ProductCategory = {
  id: string;
  name: string;
  slug: string;
} | null;

type ProductRow = {
  id: string;
  category_id: string | null;
  sku: string | null;
  name: string;
  slug: string;
  description: string | null;
  barcode: string | null;
  unit: "unidad" | "paquete" | "botella" | "porcion" | "otro";
  cost_price: number | string;
  base_sale_price: number | string;
  allow_custom_price: boolean;
  is_stockable: boolean;
  is_courtesy_allowed: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category?: ProductCategory[] | ProductCategory;
};

function formatProduct(product: ProductRow) {
  const category = Array.isArray(product.category)
    ? product.category[0] ?? null
    : product.category ?? null;

  return {
    id: product.id,
    category_id: product.category_id,
    sku: product.sku,
    name: product.name,
    slug: product.slug,
    description: product.description,
    barcode: product.barcode,
    unit: product.unit,
    cost_price: normalizeMoneyValue(product.cost_price) ?? "0.00",
    base_sale_price: normalizeMoneyValue(product.base_sale_price) ?? "0.00",
    allow_custom_price: product.allow_custom_price,
    is_stockable: product.is_stockable,
    is_courtesy_allowed: product.is_courtesy_allowed,
    is_active: product.is_active,
    created_at: product.created_at,
    updated_at: product.updated_at,
    category_name: category?.name ?? null,
    category_slug: category?.slug ?? null,
  };
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminSession();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const payload = await request.json().catch(() => null);
  const name = trimOrNull(payload?.name);
  const slugRaw = trimOrNull(payload?.slug);
  const unit = trimOrNull(payload?.unit);
  const costPrice = parseMoney(payload?.cost_price);
  const baseSalePrice = parseMoney(payload?.base_sale_price);

  if (!name || !slugRaw) {
    return NextResponse.json(
      { error: "Nombre y slug son obligatorios." },
      { status: 400 },
    );
  }

  if (!unit || !["unidad", "paquete", "botella", "porcion", "otro"].includes(unit)) {
    return NextResponse.json(
      { error: "La unidad seleccionada no es valida." },
      { status: 400 },
    );
  }

  if (costPrice === null || costPrice < 0) {
    return NextResponse.json(
      { error: "El costo de compra debe ser un numero valido mayor o igual a cero." },
      { status: 400 },
    );
  }

  if (baseSalePrice === null || baseSalePrice < 0) {
    return NextResponse.json(
      { error: "El precio de venta base debe ser un numero valido mayor o igual a cero." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("products")
    .update({
      category_id: trimOrNull(payload?.category_id),
      sku: trimOrNull(payload?.sku),
      name,
      slug: normalizeSlug(slugRaw),
      description: trimOrNull(payload?.description),
      barcode: trimOrNull(payload?.barcode),
      unit,
      cost_price: costPrice,
      base_sale_price: baseSalePrice,
      allow_custom_price: payload?.allow_custom_price === true,
      is_stockable: payload?.is_stockable !== false,
      is_courtesy_allowed: payload?.is_courtesy_allowed === true,
      is_active: payload?.is_active !== false,
    })
    .eq("id", id)
    .select(
      "id, category_id, sku, name, slug, description, barcode, unit, cost_price, base_sale_price, allow_custom_price, is_stockable, is_courtesy_allowed, is_active, created_at, updated_at, category:product_categories(id, name, slug)",
    )
    .single();

  if (error) {
    console.error("[products/put] Error al actualizar producto", {
      message: error.message,
      code: error.code,
      productId: id,
    });
    return NextResponse.json(
      { error: error.message || "No se pudo actualizar el producto." },
      { status: 400 },
    );
  }

  return NextResponse.json({ data: formatProduct(data as ProductRow) });
}

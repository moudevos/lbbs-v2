import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requirePosWriteSession } from "@/lib/supabase/route-auth";
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

type StockRow = {
  product_id: string;
  branch_id: string;
  stock_quantity: number | string | null;
  branch_sale_price: number | string | null;
  final_sale_price: number | string | null;
};

function formatProduct(product: ProductRow, stock?: StockRow | null) {
  const category = Array.isArray(product.category)
    ? product.category[0] ?? null
    : product.category ?? null;

  const baseSalePrice = normalizeMoneyValue(product.base_sale_price) ?? "0.00";
  const branchSalePrice = normalizeMoneyValue(stock?.branch_sale_price);
  const finalSalePrice = normalizeMoneyValue(stock?.final_sale_price) ?? baseSalePrice;
  const stockQuantity = (() => {
    const numeric =
      typeof stock?.stock_quantity === "number"
        ? stock.stock_quantity
        : Number(stock?.stock_quantity ?? 0);

    return Number.isFinite(numeric) ? numeric.toFixed(2) : "0.00";
  })();

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
    base_sale_price: baseSalePrice,
    branch_sale_price: branchSalePrice,
    final_sale_price: finalSalePrice,
    stock_quantity: stockQuantity,
    allow_custom_price: product.allow_custom_price,
    is_stockable: product.is_stockable,
    is_courtesy_allowed: product.is_courtesy_allowed,
    is_active: product.is_active,
    created_at: product.created_at,
    updated_at: product.updated_at,
    category_name: category?.name ?? null,
    category_slug: category?.slug ?? null,
    selected_branch_id: stock?.branch_id ?? null,
  };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const branchId = trimOrNull(searchParams.get("branchId"));

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select(
      "id, category_id, sku, name, slug, description, barcode, unit, cost_price, base_sale_price, allow_custom_price, is_stockable, is_courtesy_allowed, is_active, created_at, updated_at, category:product_categories(id, name, slug)",
    )
    .order("name", { ascending: true });

  if (productsError) {
    console.error("[products/get] Error al listar productos", {
      message: productsError.message,
      code: productsError.code,
      branchId,
    });
    return NextResponse.json(
      { error: "No se pudieron cargar los productos." },
      { status: 500 },
    );
  }

  let stockRows: StockRow[] = [];

  if (branchId) {
    const { data, error } = await supabase
      .from("vw_product_stock")
      .select("product_id, branch_id, stock_quantity, branch_sale_price, final_sale_price")
      .eq("branch_id", branchId);

    if (error) {
      console.error("[products/get] Error al cargar stock por sede", {
        message: error.message,
        code: error.code,
        branchId,
      });
      return NextResponse.json(
        { error: "No se pudo cargar el stock por sede." },
        { status: 500 },
      );
    }

    stockRows = data ?? [];
  }

  const stockMap = new Map(stockRows.map((item) => [item.product_id, item]));
  const formatted = (products ?? []).map((product) =>
    formatProduct(product as ProductRow, stockMap.get(product.id) ?? null),
  );

  return NextResponse.json({ data: formatted });
}

export async function POST(request: Request) {
  // Reception can register a product needed during operations, but remains
  // unable to edit, deactivate or change an existing catalog item.
  const auth = await requirePosWriteSession();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

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
    .insert({
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
    .select(
      "id, category_id, sku, name, slug, description, barcode, unit, cost_price, base_sale_price, allow_custom_price, is_stockable, is_courtesy_allowed, is_active, created_at, updated_at, category:product_categories(id, name, slug)",
    )
    .single();

  if (error) {
    console.error("[products/post] Error al crear producto", {
      message: error.message,
      code: error.code,
    });
    return NextResponse.json(
      { error: error.message || "No se pudo crear el producto." },
      { status: 400 },
    );
  }

  return NextResponse.json({ data: formatProduct(data as ProductRow, null) });
}

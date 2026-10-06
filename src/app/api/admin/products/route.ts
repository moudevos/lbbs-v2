import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requirePosWriteSession } from "@/lib/supabase/route-auth";
import { normalizeSlug } from "@/lib/utils/slug";
import { resolveProductPrice } from "@/lib/pos/employee-pricing";

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

function parseEmployeePricing(payload: Record<string, unknown> | null, visibilityScope: string) {
  const supportsEmployeePricing = visibilityScope === "internal" || visibilityScope === "both";
  const enabled = supportsEmployeePricing && payload?.employee_price_enabled === true;
  const price = parseMoney(payload?.employee_unit_price);
  if (enabled && (price === null || price <= 0)) {
    return { error: "El precio especial para empleados debe ser un número mayor que cero." as const };
  }
  return { enabled, price };
}

async function syncEmployeePricing(productId: string, enabled: boolean, price: number | null) {
  if (!enabled) {
    const { error } = await getSupabaseAdmin().from("employee_supply_catalog_items").update({ is_active: false }).eq("product_id", productId);
    return error;
  }
  const { error } = await getSupabaseAdmin().from("employee_supply_catalog_items").upsert(
    { product_id: productId, employee_unit_price: price, is_active: true },
    { onConflict: "product_id" },
  );
  return error;
}

type ProductCategory = {
  id: string;
  name: string;
  slug: string;
  business_line?: "barbershop_products" | "cafeteria_products" | "other";
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
  visibility_scope: "pos" | "internal" | "both";
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
    visibility_scope: product.visibility_scope,
    is_active: product.is_active,
    created_at: product.created_at,
    updated_at: product.updated_at,
    category_name: category?.name ?? null,
    category_slug: category?.slug ?? null,
    business_line: category?.business_line ?? "other",
    selected_branch_id: stock?.branch_id ?? null,
  };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const branchId = trimOrNull(searchParams.get("branchId"));
  const customerId = trimOrNull(searchParams.get("customerId"));

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select(
      "id, category_id, sku, name, slug, description, barcode, unit, cost_price, base_sale_price, allow_custom_price, is_stockable, is_courtesy_allowed, visibility_scope, is_active, created_at, updated_at, category:product_categories(id, name, slug, business_line)",
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
  let employeeId: string | null = null;
  if (customerId && branchId) {
    const { data, error } = await supabase.rpc("get_pos_internal_options", {
      p_customer_id: customerId,
      p_branch_id: branchId,
    });
    if (error) return NextResponse.json({ error: "No se pudo resolver el contexto del comprador." }, { status: 500 });
    const options = data as { employee?: { id?: string } | null } | null;
    employeeId = options?.employee?.id ?? null;
  }

  const productIds = (products ?? []).map((product) => product.id);
  const { data: employeeCatalog, error: catalogError } = productIds.length
    ? await supabase.from("employee_supply_catalog_items").select("product_id, employee_unit_price, is_active").in("product_id", productIds)
    : { data: [], error: null };
  if (catalogError) return NextResponse.json({ error: "No se pudo cargar el precio de empleado." }, { status: 500 });
  const employeePriceByProduct = new Map((employeeCatalog ?? []).map((row) => [row.product_id, row]));

  const formatted = (products ?? [])
    .filter((product) => !customerId || employeeId || (product as ProductRow).visibility_scope !== "internal")
    .map((product) => {
      const base = formatProduct(product as ProductRow, stockMap.get(product.id) ?? null);
      const catalogItem = employeePriceByProduct.get(product.id);
      const special = catalogItem?.employee_unit_price ?? null;
      const hasSpecial = catalogItem?.is_active === true && special !== null;
      const retail = base.final_sale_price;
      const pricing = resolveProductPrice({
        retailPrice: Number(retail),
        employeePrice: hasSpecial ? Number(special) : null,
        isEmployeeBuyer: Boolean(employeeId),
        visibilityScope: base.visibility_scope,
      });
      return {
        ...base,
        retail_price: retail,
        employee_price: hasSpecial ? normalizeMoneyValue(special) : null,
        employee_price_active: pricing.employeePriceActive,
        employee_unit_price: special === null ? null : normalizeMoneyValue(special),
        employee_catalog_active: catalogItem?.is_active === true,
        effective_price: normalizeMoneyValue(pricing.effectivePrice),
        price_source: pricing.priceSource,
      };
    });

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
  const visibilityScope = trimOrNull(payload?.visibility_scope) ?? "pos";
  const employeePricing = parseEmployeePricing(payload, visibilityScope);

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

  if (!['pos', 'internal', 'both'].includes(visibilityScope)) {
    return NextResponse.json({ error: "La visibilidad seleccionada no es valida." }, { status: 400 });
  }
  if ("error" in employeePricing) return NextResponse.json({ error: employeePricing.error }, { status: 400 });

  const categoryId = trimOrNull(payload?.category_id);
  if (visibilityScope === "pos" || visibilityScope === "both") {
    if (!categoryId) {
      return NextResponse.json(
        { error: "Todo producto comercial requiere categoría y familia." },
        { status: 400 },
      );
    }

    const { data: category, error: categoryError } = await getSupabaseAdmin()
      .from("product_categories")
      .select("id, business_line")
      .eq("id", categoryId)
      .maybeSingle();
    if (categoryError || !category || !["barbershop_products", "cafeteria_products"].includes(category.business_line ?? "other")) {
      return NextResponse.json(
        { error: "Selecciona una categoría comercial de Barbería o Cafetería." },
        { status: 400 },
      );
    }
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("products")
    .insert({
      category_id: categoryId,
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
      visibility_scope: visibilityScope,
      is_active: payload?.is_active !== false,
    })
    .select(
      "id, category_id, sku, name, slug, description, barcode, unit, cost_price, base_sale_price, allow_custom_price, is_stockable, is_courtesy_allowed, visibility_scope, is_active, created_at, updated_at, category:product_categories(id, name, slug, business_line)",
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

  const catalogSyncError = await syncEmployeePricing(data.id, employeePricing.enabled, employeePricing.price);
  if (catalogSyncError) {
    await admin.from("products").delete().eq("id", data.id);
    return NextResponse.json({ error: "No se pudo guardar el precio para empleados; el producto no fue creado." }, { status: 400 });
  }

  return NextResponse.json({ data: { ...formatProduct(data as ProductRow, null), employee_unit_price: employeePricing.enabled ? employeePricing.price?.toFixed(2) ?? null : null, employee_catalog_active: employeePricing.enabled } });
}

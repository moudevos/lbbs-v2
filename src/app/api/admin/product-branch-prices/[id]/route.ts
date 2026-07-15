import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/supabase/route-auth";

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

type BranchPriceBranch = {
  id: string;
  name: string;
  slug: string;
  code: string | null;
} | null;

type BranchPriceRow = {
  id: string;
  product_id: string;
  branch_id: string;
  sale_price: number | string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  branch?: BranchPriceBranch[] | BranchPriceBranch;
};

function formatBranchPrice(row: BranchPriceRow) {
  const branch = Array.isArray(row.branch) ? row.branch[0] ?? null : row.branch ?? null;

  return {
    id: row.id,
    product_id: row.product_id,
    branch_id: row.branch_id,
    sale_price: normalizeMoneyValue(row.sale_price) ?? "0.00",
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    branch_name: branch?.name ?? null,
    branch_slug: branch?.slug ?? null,
    branch_code: branch?.code ?? null,
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
  const productId = trimOrNull(payload?.product_id);
  const branchId = trimOrNull(payload?.branch_id);
  const salePrice = parseMoney(payload?.sale_price);

  if (!productId || !branchId) {
    return NextResponse.json(
      { error: "Producto y sede son obligatorios." },
      { status: 400 },
    );
  }

  if (salePrice === null || salePrice < 0) {
    return NextResponse.json(
      { error: "El precio debe ser un numero valido mayor o igual a cero." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  const { data: existing } = await admin
    .from("product_branch_prices")
    .select("id")
    .eq("product_id", productId)
    .eq("branch_id", branchId)
    .neq("id", id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "Ya existe un precio especial para esa sede." },
      { status: 409 },
    );
  }

  const { data, error } = await admin
    .from("product_branch_prices")
    .update({
      product_id: productId,
      branch_id: branchId,
      sale_price: salePrice,
      is_active: payload?.is_active !== false,
    })
    .eq("id", id)
    .select("id, product_id, branch_id, sale_price, is_active, created_at, updated_at, branch:branches(id, name, slug, code)")
    .single();

  if (error) {
    console.error("[product-branch-prices/put] Error al actualizar precio especial", {
      message: error.message,
      code: error.code,
      priceId: id,
    });
    return NextResponse.json(
      { error: error.message || "No se pudo actualizar el precio especial." },
      { status: 400 },
    );
  }

  return NextResponse.json({ data: formatBranchPrice(data as BranchPriceRow) });
}

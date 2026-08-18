import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requirePosWriteSession } from "@/lib/supabase/route-auth";

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
  service_id: string;
  branch_id: string;
  price: number | string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  branch?: BranchPriceBranch[] | BranchPriceBranch;
};

function formatBranchPrice(row: BranchPriceRow) {
  const branch = Array.isArray(row.branch) ? row.branch[0] ?? null : row.branch ?? null;

  return {
    id: row.id,
    service_id: row.service_id,
    branch_id: row.branch_id,
    price: normalizeMoneyValue(row.price) ?? "0.00",
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    branch_name: branch?.name ?? null,
    branch_slug: branch?.slug ?? null,
    branch_code: branch?.code ?? null,
  };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const serviceId = trimOrNull(searchParams.get("serviceId"));

  if (!serviceId) {
    return NextResponse.json(
      { error: "El servicio es obligatorio." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("service_branch_prices")
    .select("id, service_id, branch_id, price, is_active, created_at, updated_at, branch:branches(id, name, slug, code)")
    .eq("service_id", serviceId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[service-branch-prices/get] Error al listar precios por sede", {
      message: error.message,
      code: error.code,
      serviceId,
    });
    return NextResponse.json(
      { error: "No se pudieron cargar los precios por sede." },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: (data ?? []).map((row) => formatBranchPrice(row as BranchPriceRow)) });
}

export async function POST(request: Request) {
  const auth = await requirePosWriteSession();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const payload = await request.json().catch(() => null);
  const serviceId = trimOrNull(payload?.service_id);
  const branchId = trimOrNull(payload?.branch_id);
  const price = parseMoney(payload?.price);

  if (!serviceId || !branchId) {
    return NextResponse.json(
      { error: "Servicio y sede son obligatorios." },
      { status: 400 },
    );
  }

  if (price === null || price < 0) {
    return NextResponse.json(
      { error: "El precio debe ser un numero valido mayor o igual a cero." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  const { data: existing } = await admin
    .from("service_branch_prices")
    .select("id")
    .eq("service_id", serviceId)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "Ya existe un precio especial para esa sede." },
      { status: 409 },
    );
  }

  const { data, error } = await admin
    .from("service_branch_prices")
    .insert({
      service_id: serviceId,
      branch_id: branchId,
      price,
      is_active: payload?.is_active !== false,
    })
    .select("id, service_id, branch_id, price, is_active, created_at, updated_at, branch:branches(id, name, slug, code)")
    .single();

  if (error) {
    console.error("[service-branch-prices/post] Error al crear precio especial", {
      message: error.message,
      code: error.code,
      serviceId,
      branchId,
    });
    return NextResponse.json(
      { error: error.message || "No se pudo guardar el precio especial." },
      { status: 400 },
    );
  }

  return NextResponse.json({ data: formatBranchPrice(data as BranchPriceRow) });
}

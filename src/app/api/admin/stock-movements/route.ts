import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireStockMovementSession,
} from "@/lib/supabase/route-auth";
import { createClient } from "@/lib/supabase/server";

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

function normalizeSignedQuantity(movementType: string, quantity: number) {
  if (movementType === "adjustment") {
    return quantity;
  }

  return Math.abs(quantity);
}

type BranchRow = {
  id: string;
  name: string;
  slug: string;
  code: string | null;
};

type MovementBranch = {
  id: string;
  name: string;
  slug: string;
} | null;

type MovementCreator = {
  id: string;
  full_name: string | null;
} | null;

type MovementRow = {
  id: string;
  product_id: string;
  branch_id: string;
  movement_type:
    | "purchase"
    | "sale"
    | "courtesy"
    | "adjustment"
    | "waste"
    | "transfer_in"
    | "transfer_out";
  quantity: number | string;
  unit_cost: number | string | null;
  notes: string | null;
  created_at: string;
  branch?: MovementBranch[] | MovementBranch;
  creator?: MovementCreator[] | MovementCreator;
};

function toSignedQuantity(row: MovementRow) {
  const rawQuantity = typeof row.quantity === "number" ? row.quantity : Number(row.quantity);

  if (!Number.isFinite(rawQuantity)) {
    return "0.00";
  }

  if (row.movement_type === "adjustment") {
    return rawQuantity.toFixed(2);
  }

  if (row.movement_type === "purchase" || row.movement_type === "transfer_in") {
    return Math.abs(rawQuantity).toFixed(2);
  }

  return (Math.abs(rawQuantity) * -1).toFixed(2);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const productId = trimOrNull(searchParams.get("productId"));

  if (!productId) {
    return NextResponse.json(
      { error: "El producto es obligatorio." },
      { status: 400 },
    );
  }

  const [stockResponse, movementsResponse, branchesResponse] = await Promise.all([
    supabase
      .from("vw_product_stock")
      .select(
        "product_id, branch_id, stock_quantity, base_sale_price, branch_sale_price, final_sale_price, is_stockable, is_courtesy_allowed, is_active",
      )
      .eq("product_id", productId),
    supabase
      .from("stock_movements")
      .select(
        "id, product_id, branch_id, movement_type, quantity, unit_cost, notes, created_at, branch:branches(id, name, slug), creator:employees(id, full_name)",
      )
      .eq("product_id", productId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.from("branches").select("id, name, slug, code").order("name", { ascending: true }),
  ]);

  if (stockResponse.error) {
    console.error("[stock-movements/get] Error al cargar stock", {
      message: stockResponse.error.message,
      code: stockResponse.error.code,
      productId,
    });
    return NextResponse.json(
      { error: "No se pudo cargar el stock del producto." },
      { status: 500 },
    );
  }

  if (movementsResponse.error) {
    console.error("[stock-movements/get] Error al cargar movimientos", {
      message: movementsResponse.error.message,
      code: movementsResponse.error.code,
      productId,
    });
    return NextResponse.json(
      { error: "No se pudo cargar el historial de movimientos." },
      { status: 500 },
    );
  }

  if (branchesResponse.error) {
    console.error("[stock-movements/get] Error al cargar sedes", {
      message: branchesResponse.error.message,
      code: branchesResponse.error.code,
      productId,
    });
    return NextResponse.json(
      { error: "No se pudieron cargar las sedes." },
      { status: 500 },
    );
  }

  const branchMap = new Map(
    (branchesResponse.data ?? []).map((branch) => [branch.id, branch as BranchRow]),
  );

  const stockByBranch = (stockResponse.data ?? []).map((row) => {
    const branch = branchMap.get(row.branch_id);
    const stockQuantity =
      typeof row.stock_quantity === "number"
        ? row.stock_quantity
        : Number(row.stock_quantity ?? 0);

    return {
      product_id: row.product_id,
      branch_id: row.branch_id,
      branch_name: branch?.name ?? "Sede",
      branch_slug: branch?.slug ?? "",
      branch_code: branch?.code ?? null,
      stock_quantity: Number.isFinite(stockQuantity) ? stockQuantity.toFixed(2) : "0.00",
      base_sale_price: normalizeMoneyValue(row.base_sale_price) ?? "0.00",
      branch_sale_price: normalizeMoneyValue(row.branch_sale_price),
      final_sale_price: normalizeMoneyValue(row.final_sale_price) ?? "0.00",
      is_stockable: row.is_stockable,
      is_courtesy_allowed: row.is_courtesy_allowed,
      is_active: row.is_active,
    };
  });

  const movements = (movementsResponse.data ?? []).map((row) => {
    const branch = Array.isArray(row.branch) ? row.branch[0] ?? null : row.branch ?? null;
    const creator = Array.isArray(row.creator) ? row.creator[0] ?? null : row.creator ?? null;

    return {
      id: row.id,
      product_id: row.product_id,
      branch_id: row.branch_id,
      branch_name: branch?.name ?? null,
      branch_slug: branch?.slug ?? null,
      movement_type: row.movement_type,
      quantity: normalizeMoneyValue(row.quantity) ?? "0.00",
      signed_quantity: toSignedQuantity(row as MovementRow),
      unit_cost: normalizeMoneyValue(row.unit_cost),
      notes: row.notes,
      created_at: row.created_at,
      created_by_name: creator?.full_name ?? null,
    };
  });

  return NextResponse.json({ stockByBranch, movements });
}

export async function POST(request: Request) {
  const auth = await requireStockMovementSession();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const payload = await request.json().catch(() => null);
  const productId = trimOrNull(payload?.product_id);
  const branchId = trimOrNull(payload?.branch_id);
  const movementType = trimOrNull(payload?.movement_type);
  const quantity = parseMoney(payload?.quantity);
  const unitCost = payload?.unit_cost === null || payload?.unit_cost === undefined
    ? null
    : parseMoney(payload?.unit_cost);

  if (!productId || !branchId) {
    return NextResponse.json(
      { error: "Producto y sede son obligatorios." },
      { status: 400 },
    );
  }

  if (
    !movementType ||
    ![
      "purchase",
      "sale",
      "courtesy",
      "adjustment",
      "waste",
      "transfer_in",
      "transfer_out",
    ].includes(movementType)
  ) {
    return NextResponse.json(
      { error: "El tipo de movimiento no es valido." },
      { status: 400 },
    );
  }

  if (quantity === null || quantity === 0) {
    return NextResponse.json(
      { error: "La cantidad debe ser distinta de cero." },
      { status: 400 },
    );
  }

  if (unitCost !== null && unitCost < 0) {
    return NextResponse.json(
      { error: "El costo unitario debe ser mayor o igual a cero." },
      { status: 400 },
    );
  }

  if (auth.role === "reception") {
    const supabase = await createClient();
    const { data: canAccessBranch, error: accessError } = await supabase.rpc("can_access_branch", {
      branch_id: branchId,
    });

    if (accessError) {
      console.error("[stock-movements/post] No se pudo validar acceso a sede", {
        message: accessError.message,
        code: accessError.code,
        branchId,
      });
      return NextResponse.json(
        { error: "No se pudo validar la sede del movimiento." },
        { status: 500 },
      );
    }

    if (!canAccessBranch) {
      return NextResponse.json(
        { error: "No tienes acceso a la sede seleccionada." },
        { status: 403 },
      );
    }
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("stock_movements")
    .insert({
      product_id: productId,
      branch_id: branchId,
      movement_type: movementType,
      quantity: normalizeSignedQuantity(movementType, quantity),
      unit_cost: unitCost,
      notes: trimOrNull(payload?.notes),
      created_by: auth.employeeId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[stock-movements/post] Error al registrar movimiento", {
      message: error.message,
      code: error.code,
      productId,
      branchId,
      movementType,
    });
    return NextResponse.json(
      { error: error.message || "No se pudo registrar el movimiento." },
      { status: 400 },
    );
  }

  return NextResponse.json({ data });
}

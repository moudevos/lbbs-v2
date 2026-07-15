import { NextResponse } from "next/server";

import {
  normalizeCode,
  parseSortOrder,
  toFriendlyDatabaseError,
  trimOrNull,
} from "@/app/api/admin/settings/route-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/supabase/route-auth";
import { createClient } from "@/lib/supabase/server";

const selectFields =
  "id, code, name, description, sort_order, is_active, created_at, updated_at";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_units")
    .select(selectFields)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("[product-units/get] Error al listar unidades", {
      message: error.message,
      code: error.code,
    });
    return NextResponse.json(
      { error: "No se pudieron cargar las unidades de producto." },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdminSession();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const payload = await request.json().catch(() => null);
  const codeRaw = trimOrNull(payload?.code);
  const name = trimOrNull(payload?.name);

  if (!codeRaw || !name) {
    return NextResponse.json(
      { error: "Codigo y nombre son obligatorios." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("product_units")
    .insert({
      code: normalizeCode(codeRaw),
      name,
      description: trimOrNull(payload?.description),
      sort_order: parseSortOrder(payload?.sort_order),
      is_active: payload?.is_active !== false,
    })
    .select(selectFields)
    .single();

  if (error) {
    console.error("[product-units/post] Error al crear unidad", {
      message: error.message,
      code: error.code,
    });
    return NextResponse.json(
      {
        error: toFriendlyDatabaseError(
          error,
          "No se pudo crear la unidad de producto.",
        ),
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ data });
}

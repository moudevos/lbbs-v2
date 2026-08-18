import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePosWriteSession } from "@/lib/supabase/route-auth";
import { normalizeSlug } from "@/lib/utils/slug";
import { createClient } from "@/lib/supabase/server";
import {
  parseSortOrder,
  toFriendlyDatabaseError,
  trimOrNull,
} from "@/app/api/admin/settings/route-helpers";

const selectFields =
  "id, name, slug, description, sort_order, is_active, created_at, updated_at";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_categories")
    .select(selectFields)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("[product-categories/get] Error al listar categorias", {
      message: error.message,
      code: error.code,
    });
    return NextResponse.json(
      { error: "No se pudieron cargar las categorias de productos." },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requirePosWriteSession();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const payload = await request.json().catch(() => null);
  const name = trimOrNull(payload?.name);
  const slugRaw = trimOrNull(payload?.slug);

  if (!name || !slugRaw) {
    return NextResponse.json(
      { error: "Nombre y slug son obligatorios." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("product_categories")
    .insert({
      name,
      slug: normalizeSlug(slugRaw),
      description: trimOrNull(payload?.description),
      sort_order: parseSortOrder(payload?.sort_order),
      is_active: payload?.is_active !== false,
    })
    .select(selectFields)
    .single();

  if (error) {
    console.error("[product-categories/post] Error al crear categoria", {
      message: error.message,
      code: error.code,
    });
    return NextResponse.json(
      {
        error: toFriendlyDatabaseError(
          error,
          "No se pudo crear la categoria de productos.",
        ),
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ data });
}

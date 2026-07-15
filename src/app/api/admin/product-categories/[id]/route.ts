import { NextResponse } from "next/server";

import {
  parseSortOrder,
  toFriendlyDatabaseError,
  trimOrNull,
} from "@/app/api/admin/settings/route-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/supabase/route-auth";
import { normalizeSlug } from "@/lib/utils/slug";

const selectFields =
  "id, name, slug, description, sort_order, is_active, created_at, updated_at";

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

  if (!name || !slugRaw) {
    return NextResponse.json(
      { error: "Nombre y slug son obligatorios." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("product_categories")
    .update({
      name,
      slug: normalizeSlug(slugRaw),
      description: trimOrNull(payload?.description),
      sort_order: parseSortOrder(payload?.sort_order),
      is_active: payload?.is_active !== false,
    })
    .eq("id", id)
    .select(selectFields)
    .single();

  if (error) {
    console.error("[product-categories/put] Error al actualizar categoria", {
      message: error.message,
      code: error.code,
      categoryId: id,
    });
    return NextResponse.json(
      {
        error: toFriendlyDatabaseError(
          error,
          "No se pudo actualizar la categoria de productos.",
        ),
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ data });
}

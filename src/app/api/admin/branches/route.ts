import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";
import { normalizeSlug } from "@/lib/utils/slug";

function trimOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("branches")
    .select(
      "id, code, name, slug, short_name, city, address, phone, notes, is_active, created_at, updated_at",
    )
    .order("name", { ascending: true });

  if (error) {
    console.error("[branches/get] Error al listar sedes", {
      message: error.message,
      code: error.code,
    });
    return NextResponse.json(
      { error: "No se pudieron cargar las sedes." },
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
    .from("branches")
    .insert({
      code: trimOrNull(payload?.code),
      name,
      slug: normalizeSlug(slugRaw),
      short_name: trimOrNull(payload?.short_name),
      city: trimOrNull(payload?.city),
      address: trimOrNull(payload?.address),
      phone: trimOrNull(payload?.phone),
      notes: trimOrNull(payload?.notes),
      is_active: payload?.is_active !== false,
    })
    .select(
      "id, code, name, slug, short_name, city, address, phone, notes, is_active, created_at, updated_at",
    )
    .single();

  if (error) {
    console.error("[branches/post] Error al crear sede", {
      message: error.message,
      code: error.code,
    });
    return NextResponse.json(
      { error: error.message || "No se pudo crear la sede." },
      { status: 400 },
    );
  }

  return NextResponse.json({ data });
}

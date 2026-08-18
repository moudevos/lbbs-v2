import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePosWriteSession } from "@/lib/supabase/route-auth";
import { normalizeSlug } from "@/lib/utils/slug";

function isMissingServiceCustomPriceColumn(error: { code?: string; message?: string } | null | undefined) {
  return (
    error?.code === "42703" &&
    typeof error.message === "string" &&
    error.message.includes("services.allow_custom_price")
  );
}

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

function parseInteger(value: unknown) {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : null;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isInteger(parsed) ? parsed : null;
  }

  return null;
}

function normalizeMoneyValue(value: unknown) {
  const parsed = parseMoney(value);
  return parsed === null ? null : parsed.toFixed(2);
}

type ServiceCategory = {
  id: string;
  name: string;
  slug: string;
} | null;

type ServiceRow = {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  base_price: number | string;
  duration_minutes: number;
  allow_custom_price: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category?: ServiceCategory[] | ServiceCategory;
};

function formatService(service: ServiceRow) {
  const category = Array.isArray(service.category)
    ? service.category[0] ?? null
    : service.category ?? null;

  return {
    id: service.id,
    category_id: service.category_id,
    name: service.name,
    slug: service.slug,
    description: service.description,
    base_price: normalizeMoneyValue(service.base_price) ?? "0.00",
    duration_minutes: service.duration_minutes,
    allow_custom_price: service.allow_custom_price ?? false,
    is_active: service.is_active,
    created_at: service.created_at,
    updated_at: service.updated_at,
    category_name: category?.name ?? null,
    category_slug: category?.slug ?? null,
  };
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePosWriteSession();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const payload = await request.json().catch(() => null);
  const name = trimOrNull(payload?.name);
  const slugRaw = trimOrNull(payload?.slug);
  const basePrice = parseMoney(payload?.base_price);
  const durationMinutes = parseInteger(payload?.duration_minutes);

  if (!name || !slugRaw) {
    return NextResponse.json(
      { error: "Nombre y slug son obligatorios." },
      { status: 400 },
    );
  }

  if (basePrice === null || basePrice < 0) {
    return NextResponse.json(
      { error: "El precio base debe ser un numero valido mayor o igual a cero." },
      { status: 400 },
    );
  }

  if (durationMinutes === null || durationMinutes <= 0) {
    return NextResponse.json(
      { error: "La duracion debe ser un numero entero mayor a cero." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  const baseUpdatePayload = {
    category_id: trimOrNull(payload?.category_id),
    name,
    slug: normalizeSlug(slugRaw),
    description: trimOrNull(payload?.description),
    base_price: basePrice,
    duration_minutes: durationMinutes,
    is_active: payload?.is_active !== false,
  };

  let data: ServiceRow | null = null;
  let error: { message?: string; code?: string } | null = null;
  const updateResult = await admin
    .from("services")
    .update({
      ...baseUpdatePayload,
      allow_custom_price: payload?.allow_custom_price === true,
    })
    .eq("id", id)
    .select(
      "id, category_id, name, slug, description, base_price, duration_minutes, allow_custom_price, is_active, created_at, updated_at, category:service_categories(id, name, slug)",
    )
    .single();

  if (updateResult.error && isMissingServiceCustomPriceColumn(updateResult.error)) {
    const fallbackResult = await admin
      .from("services")
      .update(baseUpdatePayload)
      .eq("id", id)
      .select(
        "id, category_id, name, slug, description, base_price, duration_minutes, is_active, created_at, updated_at, category:service_categories(id, name, slug)",
      )
      .single();

    data = fallbackResult.data
      ? ({
          ...fallbackResult.data,
          allow_custom_price: false,
        } as ServiceRow)
      : null;
    error = fallbackResult.error;
  } else {
    data = (updateResult.data as ServiceRow | null) ?? null;
    error = updateResult.error;
  }

  if (error) {
    console.error("[services/put] Error al actualizar servicio", {
      message: error.message,
      code: error.code,
      serviceId: id,
    });
    return NextResponse.json(
      { error: error.message || "No se pudo actualizar el servicio." },
      { status: 400 },
    );
  }

  return NextResponse.json({ data: formatService(data as ServiceRow) });
}

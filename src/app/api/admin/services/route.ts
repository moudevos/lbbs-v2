import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";
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

type EffectivePriceRow = {
  service_id: string;
  branch_id: string;
  branch_price: number | string | null;
  final_price: number | string | null;
  branch_price_is_active: boolean | null;
};

function formatService(service: ServiceRow, effectivePrice?: EffectivePriceRow | null) {
  const category = Array.isArray(service.category)
    ? service.category[0] ?? null
    : service.category ?? null;

  const customPriceIsActive = effectivePrice?.branch_price_is_active === true;
  const branchPrice = customPriceIsActive ? normalizeMoneyValue(effectivePrice?.branch_price) : null;
  const basePrice = normalizeMoneyValue(service.base_price) ?? "0.00";
  const finalPrice = customPriceIsActive ? branchPrice ?? basePrice : basePrice;

  return {
    id: service.id,
    category_id: service.category_id,
    name: service.name,
    slug: service.slug,
    description: service.description,
    base_price: basePrice,
    duration_minutes: service.duration_minutes,
    allow_custom_price: service.allow_custom_price ?? false,
    is_active: service.is_active,
    created_at: service.created_at,
    updated_at: service.updated_at,
    category_name: category?.name ?? null,
    category_slug: category?.slug ?? null,
    branch_price: branchPrice,
    branch_price_is_active: customPriceIsActive,
    final_price: finalPrice,
    price_mode: customPriceIsActive ? "custom" : "base",
    selected_branch_id: effectivePrice?.branch_id ?? null,
  };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const branchId = trimOrNull(searchParams.get("branchId"));
  let services: ServiceRow[] | null = null;
  let servicesError: { message?: string; code?: string } | null = null;

  const primaryResult = await supabase
    .from("services")
    .select(
      "id, category_id, name, slug, description, base_price, duration_minutes, allow_custom_price, is_active, created_at, updated_at, category:service_categories(id, name, slug)",
    )
    .order("name", { ascending: true });

  if (primaryResult.error && isMissingServiceCustomPriceColumn(primaryResult.error)) {
    const fallbackResult = await supabase
      .from("services")
      .select(
        "id, category_id, name, slug, description, base_price, duration_minutes, is_active, created_at, updated_at, category:service_categories(id, name, slug)",
      )
      .order("name", { ascending: true });

    services = ((fallbackResult.data ?? []) as Array<Omit<ServiceRow, "allow_custom_price">>).map(
      (service) => ({
        ...service,
        allow_custom_price: false,
      }),
    ) as ServiceRow[];
    servicesError = fallbackResult.error;
  } else {
    services = (primaryResult.data ?? []) as ServiceRow[];
    servicesError = primaryResult.error;
  }

  if (servicesError) {
    console.error("[services/get] Error al listar servicios", {
      message: servicesError.message,
      code: servicesError.code,
      branchId,
    });
    return NextResponse.json(
      { error: "No se pudieron cargar los servicios." },
      { status: 500 },
    );
  }

  let effectivePrices: EffectivePriceRow[] = [];

  if (branchId) {
    const { data, error } = await supabase
      .from("vw_services_effective_prices")
      .select("service_id, branch_id, branch_price, final_price, branch_price_is_active")
      .eq("branch_id", branchId);

    if (error) {
      console.error("[services/get] Error al cargar precios efectivos", {
        message: error.message,
        code: error.code,
        branchId,
      });
      return NextResponse.json(
        { error: "No se pudieron cargar los precios por sede." },
        { status: 500 },
      );
    }

    effectivePrices = data ?? [];
  }

  const effectivePriceMap = new Map(effectivePrices.map((item) => [item.service_id, item]));
  const formatted = (services ?? []).map((service) =>
    formatService(service as ServiceRow, effectivePriceMap.get(service.id) ?? null),
  );

  return NextResponse.json({ data: formatted });
}

export async function POST(request: Request) {
  const auth = await requireAdminSession();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

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
  const baseInsertPayload = {
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
  const insertResult = await admin
    .from("services")
    .insert({
      ...baseInsertPayload,
      allow_custom_price: payload?.allow_custom_price === true,
    })
    .select(
      "id, category_id, name, slug, description, base_price, duration_minutes, allow_custom_price, is_active, created_at, updated_at, category:service_categories(id, name, slug)",
    )
    .single();

  if (insertResult.error && isMissingServiceCustomPriceColumn(insertResult.error)) {
    const fallbackResult = await admin
      .from("services")
      .insert(baseInsertPayload)
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
    data = (insertResult.data as ServiceRow | null) ?? null;
    error = insertResult.error;
  }

  if (error) {
    console.error("[services/post] Error al crear servicio", {
      message: error.message,
      code: error.code,
    });
    return NextResponse.json(
      { error: error.message || "No se pudo crear el servicio." },
      { status: 400 },
    );
  }

  return NextResponse.json({ data: formatService(data as ServiceRow, null) });
}

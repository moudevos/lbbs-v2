import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

type BranchRow = { id: string; slug: string; name: string; is_active: boolean };
type ServiceRow = {
  id: string;
  name: string;
  slug: string;
  base_price: number | string;
  allow_custom_price: boolean | null;
  category: { name: string; slug: string; is_active: boolean; sort_order: number } | null;
};

type EffectivePriceRow = {
  service_id: string;
  branch_price: number | string | null;
  final_price: number | string | null;
  branch_price_is_active: boolean | null;
};

const cacheHeaders = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" };

function publicBranch(branch: Pick<BranchRow, "slug" | "name">) {
  return { slug: branch.slug, name: branch.name };
}

export async function GET(request: NextRequest) {
  const branchSlug = request.nextUrl.searchParams.get("branchSlug")?.trim().toLocaleLowerCase("es") ?? "";
  const supabase = getSupabaseAdmin();

  if (!branchSlug) {
    const { data, error } = await supabase
      .from("branches")
      .select("slug,name")
      .eq("is_active", true)
      .not("slug", "is", null)
      .order("name");

    if (error) {
      console.error("[public/service-menu] Could not load branches", { code: error.code });
      return NextResponse.json({ error: "No se pudieron cargar las sedes." }, { status: 500 });
    }

    const branches = (data ?? [])
      .filter((branch) => Boolean(branch.slug?.trim() && branch.name?.trim()))
      .map((branch) => publicBranch({ slug: branch.slug.trim(), name: branch.name.trim() }));

    return NextResponse.json({ data: { branches } }, { headers: cacheHeaders });
  }

  const { data: branchData, error: branchError } = await supabase
    .from("branches")
    .select("id,slug,name,is_active")
    .eq("slug", branchSlug)
    .maybeSingle();

  if (branchError) {
    console.error("[public/service-menu] Could not load branch", { code: branchError.code });
    return NextResponse.json({ error: "No se pudo cargar la sede." }, { status: 500 });
  }

  const branch = branchData as BranchRow | null;
  if (!branch) return NextResponse.json({ error: "Sede no disponible." }, { status: 404 });
  if (!branch.is_active) return NextResponse.json({ error: "Sede no disponible." }, { status: 410 });

  // El catálogo administrativo es global. service_branch_prices solo contiene
  // overrides de precio por sede; una fila ausente (o inactiva) usa base_price.
  const [servicesResult, effectivePricesResult] = await Promise.all([
    supabase
      .from("services")
      .select("id,name,slug,base_price,allow_custom_price,category:service_categories(name,slug,is_active,sort_order)")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("vw_services_effective_prices")
      .select("service_id,branch_price,final_price,branch_price_is_active")
      .eq("branch_id", branch.id),
  ]);

  if (servicesResult.error || effectivePricesResult.error) {
    console.error("[public/service-menu] Could not load branch services", {
      servicesCode: servicesResult.error?.code,
      pricesCode: effectivePricesResult.error?.code,
    });
    return NextResponse.json({ error: "No se pudieron cargar los servicios." }, { status: 500 });
  }

  const effectivePrices = new Map(
    ((effectivePricesResult.data as EffectivePriceRow[] | null) ?? []).map((price) => [price.service_id, price]),
  );
  const services = ((servicesResult.data as unknown as ServiceRow[] | null) ?? [])
    .sort((a, b) => (a.category?.sort_order ?? 9999) - (b.category?.sort_order ?? 9999) || a.name.localeCompare(b.name, "es"))
    .map((service) => {
      const effectivePrice = effectivePrices.get(service.id);
      const price = Number(
        effectivePrice?.branch_price_is_active === true
          ? effectivePrice.final_price
          : service.base_price,
      );
      if (!service.name?.trim() || !Number.isFinite(price) || price < 0) return null;
      const category = service.category?.is_active && service.category.slug?.trim() && service.category.name?.trim()
        ? { slug: service.category.slug.trim(), name: service.category.name.trim() }
        : null;
      // Los servicios con precio personalizado se cotizan en la atención.
      // No exponemos un monto orientativo que pueda inducir a error en la carta.
      const isVariablePrice = service.allow_custom_price === true
        || service.name.trim().localeCompare("Personalizado", "es", { sensitivity: "accent" }) === 0;
      return { name: service.name.trim(), price: isVariablePrice ? null : price, is_variable_price: isVariablePrice, category };
    })
    .filter((service) => service !== null);

  return NextResponse.json({ data: { branch: publicBranch(branch), services } }, { headers: cacheHeaders });
}

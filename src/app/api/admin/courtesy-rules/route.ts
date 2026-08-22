import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/supabase/route-auth";
import { createClient } from "@/lib/supabase/server";

function optionalMoney(value: unknown): number | null {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
    return null;
  }

  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const supabase = await createClient();
  const [rules, services, products, branches] = await Promise.all([
    supabase.from("courtesy_rules").select("id,name,description,branch_id,is_active,priority,qualifying_service_id,qualifying_service_category_id,minimum_unit_amount,maximum_courtesy_items,maximum_courtesy_amount,allow_with_reward,starts_at,ends_at,benefits:courtesy_rule_benefits(id,product_id,max_quantity,max_unit_amount,is_active)").order("priority", { ascending: false }).order("name"),
    supabase.from("services").select("id,name,category_id").eq("is_active", true).order("name"),
    supabase.from("products").select("id,name,category_id,is_courtesy_allowed").eq("is_active", true).eq("is_courtesy_allowed", true).order("name"),
    supabase.from("branches").select("id,name").eq("is_active", true).order("name"),
  ]);
  const error = rules.error ?? services.error ?? products.error ?? branches.error;
  if (error) return NextResponse.json({ error: "No se pudieron cargar las reglas de cortesía." }, { status: 500 });
  return NextResponse.json({ rules: rules.data ?? [], services: services.data ?? [], products: products.data ?? [], branches: branches.data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const body = await request.json().catch(() => null);
  if (!body?.name || !Array.isArray(body.benefits) || Number(body.maximumCourtesyItems) < 1) {
    return NextResponse.json({ error: "Nombre y cantidad permitida son obligatorios." }, { status: 400 });
  }
  if (body.benefits.some((benefit: { productId?: unknown; maxQuantity?: unknown }) => !benefit.productId || Number(benefit.maxQuantity) < 1)) {
    return NextResponse.json({ error: "Cada producto elegible debe tener una cantidad máxima válida." }, { status: 400 });
  }
  const supabase = await createClient();
  const payload = {
    name: String(body.name).trim(), description: body.description?.trim() || null, branch_id: body.branchId || null,
    qualifying_service_id: body.qualifyingServiceId || null, qualifying_service_category_id: null,
    minimum_unit_amount: Number(body.minimumUnitAmount || 0), maximum_courtesy_items: Number(body.maximumCourtesyItems),
    maximum_courtesy_amount: body.maximumCourtesyAmount === "" || body.maximumCourtesyAmount == null ? null : Number(body.maximumCourtesyAmount),
    priority: Number(body.priority || 0), allow_with_reward: Boolean(body.allowWithReward), is_active: body.isActive !== false,
  };
  const ruleId = body.id || null;
  const saved = ruleId
    ? await supabase.from("courtesy_rules").update(payload).eq("id", ruleId).select("id").single()
    : await supabase.from("courtesy_rules").insert(payload).select("id").single();
  if (saved.error || !saved.data) return NextResponse.json({ error: saved.error?.message || "No se pudo guardar la regla." }, { status: 400 });
  const { error: deleteError } = await supabase.from("courtesy_rule_benefits").delete().eq("rule_id", saved.data.id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });
  const benefits = body.benefits.map((benefit: { productId: string; maxQuantity: number; maxUnitAmount?: unknown }) => ({
    rule_id: saved.data.id,
    benefit_item_type: "product",
    product_id: benefit.productId,
    max_quantity: Number(benefit.maxQuantity),
    // Un campo vacío significa “sin tope”; Number(\"\") sería 0 y bloquearía
    // cualquier producto cuyo precio sea mayor a cero.
    max_unit_amount: optionalMoney(benefit.maxUnitAmount),
    is_active: true,
  }));
  if (benefits.length > 0) {
    const { error: benefitsError } = await supabase.from("courtesy_rule_benefits").insert(benefits);
    if (benefitsError) return NextResponse.json({ error: benefitsError.message }, { status: 400 });
  }
  return NextResponse.json({ id: saved.data.id });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const body = await request.json().catch(() => null);
  if (!body?.id || typeof body.isActive !== "boolean") return NextResponse.json({ error: "Regla inválida." }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.from("courtesy_rules").update({ is_active: body.isActive }).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

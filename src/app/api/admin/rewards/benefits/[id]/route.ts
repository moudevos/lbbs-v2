import { NextResponse } from "next/server";

import {
  parseNumber,
  toFriendlyRewardsError,
  trimOrNull,
} from "@/app/api/admin/rewards/route-helpers";
import { recalculateAllEligibleCustomers } from "@/app/api/admin/rewards/recalculate-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/supabase/route-auth";

const selectFields =
  "id, name, description, benefit_type, service_id, product_id, voucher_amount, discount_percent, applies_to, max_discount_amount, is_active, created_at, updated_at";

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
  const benefitType = trimOrNull(payload?.benefit_type);
  const appliesTo = trimOrNull(payload?.applies_to);

  if (!name || !benefitType || !appliesTo) {
    return NextResponse.json(
      { error: "Completa nombre, tipo de beneficio y alcance." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  if (payload?.is_active === false) {
    const { data: activeRule, error: activeRuleError } = await admin
      .from("reward_rules")
      .select("id")
      .eq("benefit_id", id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (activeRuleError) {
      return NextResponse.json(
        { error: "No se pudo validar si el premio esta en uso por una regla activa." },
        { status: 500 },
      );
    }

    if (activeRule) {
      return NextResponse.json(
        { error: "No se puede desactivar un premio usado por una regla activa." },
        { status: 400 },
      );
    }
  }

  const { data, error } = await admin
    .from("reward_benefits")
    .update({
      name,
      description: trimOrNull(payload?.description),
      benefit_type: benefitType,
      service_id: trimOrNull(payload?.service_id),
      product_id: trimOrNull(payload?.product_id),
      voucher_amount: parseNumber(payload?.voucher_amount),
      discount_percent: parseNumber(payload?.discount_percent),
      applies_to: appliesTo,
      max_discount_amount: parseNumber(payload?.max_discount_amount),
      is_active: payload?.is_active !== false,
    })
    .eq("id", id)
    .select(selectFields)
    .single();

  if (error) {
    console.error("[rewards/benefits/put] Error al actualizar beneficio", {
      message: error.message,
      code: error.code,
      benefitId: id,
    });
    return NextResponse.json(
      { error: toFriendlyRewardsError(error, "No se pudo actualizar el premio de rewards.") },
      { status: 400 },
    );
  }

  try {
    await recalculateAllEligibleCustomers();
  } catch (recalculateError) {
    console.error("[rewards/benefits/put] No se pudo recalcular rewards despues de editar premio", {
      message:
        recalculateError instanceof Error
          ? recalculateError.message
          : "Error inesperado",
    });
  }

  return NextResponse.json({ data });
}

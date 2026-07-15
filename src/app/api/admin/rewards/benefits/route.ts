import { NextResponse } from "next/server";

import {
  parseNumber,
  toFriendlyRewardsError,
  trimOrNull,
} from "@/app/api/admin/rewards/route-helpers";
import { recalculateAllEligibleCustomers } from "@/app/api/admin/rewards/recalculate-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/supabase/route-auth";
import { createClient } from "@/lib/supabase/server";

const selectFields =
  "id, name, description, benefit_type, service_id, product_id, voucher_amount, discount_percent, applies_to, max_discount_amount, is_active, created_at, updated_at";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reward_benefits")
    .select(selectFields)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[rewards/benefits/get] Error al listar beneficios", {
      message: error.message,
      code: error.code,
    });
    return NextResponse.json(
      { error: "No se pudieron cargar los premios de rewards." },
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
  const benefitType = trimOrNull(payload?.benefit_type);
  const appliesTo = trimOrNull(payload?.applies_to);

  if (!name || !benefitType || !appliesTo) {
    return NextResponse.json(
      { error: "Completa nombre, tipo de beneficio y alcance." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("reward_benefits")
    .insert({
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
    .select(selectFields)
    .single();

  if (error) {
    console.error("[rewards/benefits/post] Error al crear beneficio", {
      message: error.message,
      code: error.code,
    });
    return NextResponse.json(
      { error: toFriendlyRewardsError(error, "No se pudo crear el premio de rewards.") },
      { status: 400 },
    );
  }

  try {
    await recalculateAllEligibleCustomers();
  } catch (recalculateError) {
    console.error("[rewards/benefits/post] No se pudo recalcular rewards despues de crear premio", {
      message:
        recalculateError instanceof Error
          ? recalculateError.message
          : "Error inesperado",
    });
  }

  return NextResponse.json({ data });
}

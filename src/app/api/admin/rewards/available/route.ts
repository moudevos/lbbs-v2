import { NextRequest, NextResponse } from "next/server";

import { recalculateCustomerRewardsById } from "@/app/api/admin/rewards/recalculate-helpers";
import { createClient } from "@/lib/supabase/server";
import { requireRewardsWriteSession } from "@/lib/supabase/route-auth";

export async function GET(request: NextRequest) {
  const auth = await requireRewardsWriteSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const customerId = request.nextUrl.searchParams.get("customerId")?.trim() ?? "";
  if (!customerId) {
    return NextResponse.json({ data: [] });
  }

  const supabase = await createClient();
  const { error: expireError } = await supabase.rpc("mark_expired_reward_entitlements", {
    p_customer_id: customerId,
  });

  if (expireError) {
    console.error("[rewards/available] No se pudieron marcar rewards vencidos", {
      message: expireError.message,
      code: expireError.code,
      customerId,
    });
  }

  try {
    await recalculateCustomerRewardsById(customerId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    console.error("[rewards/available] No se pudo recalcular rewards antes de listar", {
      message,
      customerId,
    });
  }

  const { data, error } = await supabase
    .from("customer_reward_entitlements")
    .select("id, rule_id, benefit_id, status, earned_at, expires_at, notes, reward_benefits(name, description, benefit_type, service_id, product_id, voucher_amount, discount_percent, applies_to, max_discount_amount)")
    .eq("customer_id", customerId)
    .eq("status", "available")
    .order("earned_at", { ascending: true });

  if (error) {
    console.error("[rewards/available] Error al listar rewards disponibles", {
      message: error.message,
      code: error.code,
      customerId,
    });
    return NextResponse.json(
      { error: "No se pudieron cargar los rewards disponibles." },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: data ?? [] });
}

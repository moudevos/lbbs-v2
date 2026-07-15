import { NextResponse } from "next/server";

import { recalculateCustomerRewardsById } from "@/app/api/admin/rewards/recalculate-helpers";
import { createClient } from "@/lib/supabase/server";
import { requireRewardsWriteSession } from "@/lib/supabase/route-auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ customerId: string }> },
) {
  const auth = await requireRewardsWriteSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const supabase = await createClient();
  const { customerId } = await params;

  try {
    await recalculateCustomerRewardsById(customerId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    console.error("[rewards/customer/get] No se pudo recalcular rewards antes de consultar", {
      message,
      customerId,
    });
  }

  const [customerResult, summaryResult, ledgerResult, entitlementsResult, redemptionsResult] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id, full_name, first_name, last_name, business_name, phone, document_type, document_number, is_active")
        .eq("id", customerId)
        .maybeSingle(),
      supabase
        .from("vw_customer_rewards_summary")
        .select("*")
        .eq("customer_id", customerId)
        .maybeSingle(),
      supabase
        .from("customer_reward_ledger")
        .select("id, sale_id, rule_id, movement_type, metric_type, quantity, amount, description, metadata, created_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false }),
      supabase
        .from("customer_reward_entitlements")
        .select("id, rule_id, benefit_id, source_ledger_id, status, earned_at, expires_at, redeemed_at, redeemed_sale_id, cancelled_at, notes, reward_benefits(name, benefit_type)")
        .eq("customer_id", customerId)
        .order("earned_at", { ascending: false }),
      supabase
        .from("reward_redemptions")
        .select("id, entitlement_id, sale_id, benefit_id, discount_amount, status, applied_at, cancelled_at, cancellation_reason, reward_benefits(name)")
        .eq("customer_id", customerId)
        .order("applied_at", { ascending: false }),
    ]);

  if (
    customerResult.error ||
    summaryResult.error ||
    ledgerResult.error ||
    entitlementsResult.error ||
    redemptionsResult.error
  ) {
    console.error("[rewards/customer/get] Error al cargar rewards del cliente", {
      customerError: customerResult.error?.message,
      summaryError: summaryResult.error?.message,
      ledgerError: ledgerResult.error?.message,
      entitlementsError: entitlementsResult.error?.message,
      redemptionsError: redemptionsResult.error?.message,
      customerId,
    });
    return NextResponse.json(
      { error: "No se pudo cargar el historial de rewards del cliente." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    data: {
      customer: customerResult.data,
      summary: summaryResult.data,
      ledger: ledgerResult.data ?? [],
      entitlements: entitlementsResult.data ?? [],
      redemptions: redemptionsResult.data ?? [],
    },
  });
}

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

function getMonthStartIso() {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function getCustomerLabel(customer: { full_name: string | null; business_name: string | null }) {
  return customer.business_name || customer.full_name || "Cliente";
}

export async function GET() {
  const supabase = await createClient();
  const { data: role, error: roleError } = await supabase.rpc("current_user_role");

  if (roleError || !role) {
    console.error("[rewards/bootstrap] No se pudo leer el rol actual", {
      message: roleError?.message,
      code: roleError?.code,
    });
    return NextResponse.json(
      { error: "No se pudo validar la sesion actual." },
      { status: 500 },
    );
  }

  if (!["owner", "admin", "reception"].includes(role)) {
    return NextResponse.json(
      { error: "No tienes permiso para acceder a este modulo." },
      { status: 403 },
    );
  }

  const monthStartIso = getMonthStartIso();

  const [
    rulesResult,
    benefitsResult,
    servicesResult,
    productsResult,
    availableEntitlementsResult,
    migrationsCountResult,
    monthRedemptionsResult,
    monthVisitsResult,
    latestMigrationsResult,
    latestRedemptionsResult,
  ] = await Promise.all([
    supabase
      .from("reward_rules")
      .select(
        "id, name, description, metric_type, threshold_value, benefit_id, service_id, applies_to, starts_at, ends_at, expires_days, is_repeatable, is_active, created_at, updated_at",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("reward_benefits")
      .select(
        "id, name, description, benefit_type, service_id, product_id, voucher_amount, discount_percent, applies_to, max_discount_amount, is_active, created_at, updated_at",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("services")
      .select("id, name, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("products")
      .select("id, name, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("customer_reward_entitlements")
      .select("customer_id")
      .eq("status", "available"),
    supabase
      .from("customer_reward_ledger")
      .select("id", { count: "exact", head: true })
      .eq("movement_type", "manual_migration"),
    supabase
      .from("reward_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "applied")
      .gte("applied_at", monthStartIso),
    supabase
      .from("customer_reward_ledger")
      .select("quantity")
      .eq("movement_type", "accrual")
      .in("metric_type", ["service_visit_count", "specific_service_count"])
      .gte("created_at", monthStartIso),
    supabase
      .from("customer_reward_ledger")
      .select("customer_id, quantity, description, created_at")
      .eq("movement_type", "manual_migration")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("reward_redemptions")
      .select("customer_id, benefit_id, discount_amount, applied_at")
      .eq("status", "applied")
      .order("applied_at", { ascending: false })
      .limit(8),
  ]);

  if (
    rulesResult.error ||
    benefitsResult.error ||
    servicesResult.error ||
    productsResult.error ||
    availableEntitlementsResult.error ||
    migrationsCountResult.error ||
    monthRedemptionsResult.error ||
    monthVisitsResult.error ||
    latestMigrationsResult.error ||
    latestRedemptionsResult.error
  ) {
    console.error("[rewards/bootstrap] No se pudieron cargar los datos base", {
      rulesError: rulesResult.error?.message,
      benefitsError: benefitsResult.error?.message,
      servicesError: servicesResult.error?.message,
      productsError: productsResult.error?.message,
      availableEntitlementsError: availableEntitlementsResult.error?.message,
      migrationsCountError: migrationsCountResult.error?.message,
      monthRedemptionsError: monthRedemptionsResult.error?.message,
      monthVisitsError: monthVisitsResult.error?.message,
      latestMigrationsError: latestMigrationsResult.error?.message,
      latestRedemptionsError: latestRedemptionsResult.error?.message,
    });
    return NextResponse.json(
      { error: "No se pudieron cargar los datos base de rewards." },
      { status: 500 },
    );
  }

  const latestMigrationCustomerIds = Array.from(
    new Set((latestMigrationsResult.data ?? []).map((item) => item.customer_id).filter(Boolean)),
  );
  const latestRedemptionCustomerIds = Array.from(
    new Set((latestRedemptionsResult.data ?? []).map((item) => item.customer_id).filter(Boolean)),
  );
  const latestRedemptionBenefitIds = Array.from(
    new Set((latestRedemptionsResult.data ?? []).map((item) => item.benefit_id).filter(Boolean)),
  );

  const customerIds = Array.from(
    new Set([...latestMigrationCustomerIds, ...latestRedemptionCustomerIds]),
  );

  const [customersResult, rewardBenefitsResult] = await Promise.all([
    customerIds.length > 0
      ? supabase
          .from("customers")
          .select("id, full_name, business_name")
          .in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
    latestRedemptionBenefitIds.length > 0
      ? supabase
          .from("reward_benefits")
          .select("id, name")
          .in("id", latestRedemptionBenefitIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (customersResult.error || rewardBenefitsResult.error) {
    console.error("[rewards/bootstrap] No se pudieron cargar nombres de actividad reciente", {
      customersError: customersResult.error?.message,
      benefitsError: rewardBenefitsResult.error?.message,
    });
    return NextResponse.json(
      { error: "No se pudo completar la actividad reciente de rewards." },
      { status: 500 },
    );
  }

  const customerMap = new Map(
    (customersResult.data ?? []).map((item) => [item.id, getCustomerLabel(item)]),
  );
  const benefitMap = new Map((rewardBenefitsResult.data ?? []).map((item) => [item.id, item.name]));

  const customersWithAvailableRewards = new Set(
    (availableEntitlementsResult.data ?? []).map((item) => item.customer_id).filter(Boolean),
  ).size;

  const accumulatedVisitsMonth = (monthVisitsResult.data ?? []).reduce((total, item) => {
    const quantity = Number(item.quantity ?? 0);
    return total + (Number.isFinite(quantity) ? quantity : 0);
  }, 0);

  return NextResponse.json({
    role,
    rules: rulesResult.data ?? [],
    benefits: benefitsResult.data ?? [],
    services: servicesResult.data ?? [],
    products: productsResult.data ?? [],
    metrics: {
      active_rules_count: (rulesResult.data ?? []).filter((item) => item.is_active).length,
      active_benefits_count: (benefitsResult.data ?? []).filter((item) => item.is_active).length,
      customers_with_available_rewards: customersWithAvailableRewards,
      migrations_registered: migrationsCountResult.count ?? 0,
      redeemed_rewards_month: monthRedemptionsResult.count ?? 0,
      accumulated_visits_month: accumulatedVisitsMonth,
    },
    activity: {
      latest_migrations: (latestMigrationsResult.data ?? []).map((item) => ({
        customer_id: item.customer_id,
        customer_name: customerMap.get(item.customer_id) ?? "Cliente",
        quantity: item.quantity,
        note: item.description,
        created_at: item.created_at,
      })),
      latest_redemptions: (latestRedemptionsResult.data ?? []).map((item) => ({
        customer_id: item.customer_id,
        customer_name: customerMap.get(item.customer_id) ?? "Cliente",
        benefit_id: item.benefit_id,
        benefit_name: benefitMap.get(item.benefit_id) ?? "Reward aplicado",
        discount_amount: item.discount_amount,
        applied_at: item.applied_at,
      })),
    },
  });
}

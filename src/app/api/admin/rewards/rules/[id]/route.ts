import { NextResponse } from "next/server";

import {
  parseInteger,
  parseNumber,
  toFriendlyRewardsError,
  trimOrNull,
} from "@/app/api/admin/rewards/route-helpers";
import { recalculateAllEligibleCustomers } from "@/app/api/admin/rewards/recalculate-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/supabase/route-auth";

const selectFields =
  "id, name, description, metric_type, threshold_value, benefit_id, service_id, applies_to, starts_at, ends_at, expires_days, is_repeatable, is_active, created_at, updated_at";

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
  const metricType = trimOrNull(payload?.metric_type);
  const appliesTo = trimOrNull(payload?.applies_to);
  const thresholdValue = parseNumber(payload?.threshold_value);
  const benefitId = trimOrNull(payload?.benefit_id);
  const serviceId = trimOrNull(payload?.service_id);

  if (
    !name ||
    !metricType ||
    !appliesTo ||
    !benefitId ||
    thresholdValue === null ||
    thresholdValue <= 0
  ) {
    return NextResponse.json(
      { error: "Completa nombre, metrica, premio y umbral validos." },
      { status: 400 },
    );
  }

  if (metricType === "specific_service_count" && !serviceId) {
    return NextResponse.json(
      { error: "Selecciona un servicio cuando la metrica sea atenciones de un servicio especifico." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  const { data: benefit, error: benefitError } = await admin
    .from("reward_benefits")
    .select("id, is_active")
    .eq("id", benefitId)
    .maybeSingle();

  if (benefitError) {
    return NextResponse.json(
      { error: "No se pudo validar el premio seleccionado." },
      { status: 500 },
    );
  }

  if (!benefit) {
    return NextResponse.json(
      { error: "Selecciona un premio valido para la regla." },
      { status: 400 },
    );
  }

  if (payload?.is_active !== false && benefit.is_active !== true) {
    return NextResponse.json(
      { error: "No se puede activar una regla con un premio inactivo." },
      { status: 400 },
    );
  }

  const { data, error } = await admin
    .from("reward_rules")
    .update({
      name,
      description: trimOrNull(payload?.description),
      metric_type: metricType,
      threshold_value: Number(thresholdValue.toFixed(2)),
      benefit_id: benefitId,
      service_id: metricType === "specific_service_count" ? serviceId : null,
      applies_to: appliesTo,
      starts_at: trimOrNull(payload?.starts_at),
      ends_at: trimOrNull(payload?.ends_at),
      expires_days: parseInteger(payload?.expires_days),
      is_repeatable: payload?.is_repeatable !== false,
      is_active: payload?.is_active !== false,
    })
    .eq("id", id)
    .select(selectFields)
    .single();

  if (error) {
    console.error("[rewards/rules/put] Error al actualizar regla", {
      message: error.message,
      code: error.code,
      ruleId: id,
    });
    return NextResponse.json(
      { error: toFriendlyRewardsError(error, "No se pudo actualizar la regla de rewards.") },
      { status: 400 },
    );
  }

  try {
    await recalculateAllEligibleCustomers();
  } catch (recalculateError) {
    console.error("[rewards/rules/put] No se pudo recalcular rewards despues de editar regla", {
      message:
        recalculateError instanceof Error
          ? recalculateError.message
          : "Error inesperado",
    });
  }

  return NextResponse.json({ data });
}

import type {
  RewardBenefitRecord,
  RewardEntitlementRecord,
  RewardLedgerRecord,
  RewardRuleRecord,
  RewardSummaryRecord,
} from "@/features/rewards/rewards-types";

export function formatRewardsMoney(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);

  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

export function formatRewardsNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("es-PE").format(Number.isFinite(numeric) ? numeric : 0);
}

export function formatRewardsDateTime(value: string | null | undefined) {
  if (!value) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function toDateTimeLocalValue(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

export function getRewardMetricLabel(
  metricType: RewardLedgerRecord["metric_type"] | RewardRuleRecord["metric_type"],
) {
  if (metricType === "service_visit_count") {
    return "Atenciones generales";
  }

  if (metricType === "sale_count") {
    return "Ventas";
  }

  if (metricType === "product_purchase_count") {
    return "Compras con productos";
  }

  if (metricType === "amount_spent") {
    return "Monto acumulado";
  }

  return "Atenciones de un servicio especifico";
}

export function getRewardRuleSubtitle(rule: RewardRuleRecord) {
  return `${getRewardMetricLabel(rule.metric_type)} · Umbral ${formatRewardsNumber(rule.threshold_value)}`;
}

export function getRewardBenefitTypeLabel(benefitType: RewardBenefitRecord["benefit_type"]) {
  if (benefitType === "free_service") {
    return "Servicio gratis";
  }

  if (benefitType === "voucher_amount") {
    return "Vale por monto";
  }

  return "Descuento en productos";
}

export function getRewardBenefitSubtitle(benefit: RewardBenefitRecord) {
  const parts = [getRewardBenefitTypeLabel(benefit.benefit_type)];

  if (benefit.voucher_amount) {
    parts.push(formatRewardsMoney(benefit.voucher_amount));
  }

  if (benefit.discount_percent) {
    parts.push(`${benefit.discount_percent}%`);
  }

  return parts.join(" · ");
}

export function getRewardAppliesToLabel(
  value: RewardRuleRecord["applies_to"] | RewardBenefitRecord["applies_to"],
) {
  if (value === "global" || value === "all") {
    return "Global";
  }

  if (value === "products_only") {
    return "Solo productos";
  }

  if (value === "services_only") {
    return "Solo servicios";
  }

  if (value === "specific_service") {
    return "Servicio especifico";
  }

  return "Producto especifico";
}

export function getRewardMovementLabel(movementType: RewardLedgerRecord["movement_type"]) {
  if (movementType === "accrual") {
    return "Acumulacion";
  }

  if (movementType === "reversal") {
    return "Reversion";
  }

  if (movementType === "manual_migration") {
    return "Migracion";
  }

  return "Ajuste manual";
}

export function getRewardStatusLabel(status: RewardEntitlementRecord["status"]) {
  if (status === "available") {
    return "Disponible";
  }

  if (status === "redeemed") {
    return "Canjeado";
  }

  if (status === "expired") {
    return "Vencido";
  }

  return "Cancelado";
}

export function getCustomerRewardsSummaryItems(summary: RewardSummaryRecord | null) {
  return [
    {
      label: "Atenciones acumuladas",
      value: formatRewardsNumber(summary?.total_service_visits),
    },
    {
      label: "Ventas acumuladas",
      value: formatRewardsNumber(summary?.total_sales_count),
    },
    {
      label: "Monto acumulado",
      value: formatRewardsMoney(summary?.total_amount_spent),
    },
    {
      label: "Rewards disponibles",
      value: formatRewardsNumber(summary?.available_rewards_count),
    },
    {
      label: "Rewards canjeados",
      value: formatRewardsNumber(summary?.redeemed_rewards_count),
    },
    {
      label: "Proximo premio",
      value: summary?.next_reward_name ?? "Sin dato",
    },
  ];
}

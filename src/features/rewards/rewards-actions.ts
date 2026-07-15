"use client";

import type {
  CustomerRecord,
} from "@/features/customers/customer-types";
import type {
  RewardBenefitFormValue,
  RewardBenefitRecord,
  RewardCustomerDetail,
  RewardRuleFormValue,
  RewardRuleRecord,
  RewardsBootstrapPayload,
} from "@/features/rewards/rewards-types";

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "No se pudo completar la operacion.");
  }

  return payload;
}

export async function fetchRewardsBootstrap() {
  const response = await fetch("/api/admin/rewards/bootstrap", {
    cache: "no-store",
  });
  const payload = await readJson(response);
  return payload as RewardsBootstrapPayload;
}

export async function searchRewardCustomers(query: string) {
  const response = await fetch(
    `/api/admin/customers/search?q=${encodeURIComponent(query)}&limit=8`,
    {
      cache: "no-store",
    },
  );
  const payload = await readJson(response);
  return (payload.data ?? []) as CustomerRecord[];
}

export async function fetchRewardCustomer(customerId: string) {
  const response = await fetch(`/api/admin/rewards/customers/${customerId}`, {
    cache: "no-store",
  });
  const payload = await readJson(response);
  return payload.data as RewardCustomerDetail;
}

export async function registerRewardMigration(
  customerId: string,
  stickers: string,
  note: string,
  serviceId?: string,
) {
  const response = await fetch("/api/admin/rewards/migrations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customer_id: customerId,
      stickers,
      note,
      service_id: serviceId || null,
    }),
  });

  return readJson(response);
}

export async function recalculateRewardCustomer(customerId: string) {
  const response = await fetch("/api/admin/rewards/recalculate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customer_id: customerId,
    }),
  });

  return readJson(response);
}

function buildRulePayload(form: RewardRuleFormValue) {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    metric_type: form.metric_type,
    threshold_value: form.threshold_value,
    benefit_id: form.benefit_id || null,
    service_id: form.service_id || null,
    applies_to: form.applies_to,
    starts_at: form.starts_at || null,
    ends_at: form.ends_at || null,
    expires_days: form.expires_days || null,
    is_repeatable: form.is_repeatable,
    is_active: form.is_active,
  };
}

function buildBenefitPayload(form: RewardBenefitFormValue) {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    benefit_type: form.benefit_type,
    service_id: form.service_id || null,
    product_id: form.product_id || null,
    voucher_amount: form.voucher_amount || null,
    discount_percent: form.discount_percent || null,
    applies_to: form.applies_to,
    max_discount_amount: form.max_discount_amount || null,
    is_active: form.is_active,
  };
}

export async function saveRewardRule(form: RewardRuleFormValue, editingId?: string | null) {
  const response = await fetch(
    editingId ? `/api/admin/rewards/rules/${editingId}` : "/api/admin/rewards/rules",
    {
      method: editingId ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildRulePayload(form)),
    },
  );
  const payload = await readJson(response);
  return payload.data as RewardRuleRecord;
}

export async function saveRewardBenefit(
  form: RewardBenefitFormValue,
  editingId?: string | null,
) {
  const response = await fetch(
    editingId
      ? `/api/admin/rewards/benefits/${editingId}`
      : "/api/admin/rewards/benefits",
    {
      method: editingId ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildBenefitPayload(form)),
    },
  );
  const payload = await readJson(response);
  return payload.data as RewardBenefitRecord;
}

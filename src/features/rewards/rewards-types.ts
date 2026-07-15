export type RewardsRole = "owner" | "admin" | "reception" | "barber" | "viewer";

export type RewardMetricType =
  | "service_visit_count"
  | "sale_count"
  | "product_purchase_count"
  | "amount_spent"
  | "specific_service_count";

export type RewardRuleAppliesTo =
  | "global"
  | "products_only"
  | "services_only"
  | "specific_service"
  | "specific_product";

export type RewardBenefitType =
  | "free_service"
  | "voucher_amount"
  | "product_discount_percent";

export type RewardBenefitAppliesTo =
  | "all"
  | "products_only"
  | "services_only"
  | "specific_service"
  | "specific_product";

export type RewardRuleRecord = {
  id: string;
  name: string;
  description: string | null;
  metric_type: RewardMetricType;
  threshold_value: number | string;
  benefit_id: string | null;
  service_id: string | null;
  applies_to: RewardRuleAppliesTo;
  starts_at: string | null;
  ends_at: string | null;
  expires_days: number | null;
  is_repeatable: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type RewardBenefitRecord = {
  id: string;
  name: string;
  description: string | null;
  benefit_type: RewardBenefitType;
  service_id: string | null;
  product_id: string | null;
  voucher_amount: number | string | null;
  discount_percent: number | string | null;
  applies_to: RewardBenefitAppliesTo;
  max_discount_amount: number | string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type RewardCatalogOption = {
  id: string;
  name: string;
  is_active: boolean;
};

export type RewardsBootstrapPayload = {
  role: RewardsRole;
  rules: RewardRuleRecord[];
  benefits: RewardBenefitRecord[];
  services: RewardCatalogOption[];
  products: RewardCatalogOption[];
  metrics: RewardDashboardMetrics;
  activity: RewardDashboardActivity;
};

export type RewardDashboardMetrics = {
  active_rules_count: number;
  active_benefits_count: number;
  customers_with_available_rewards: number;
  migrations_registered: number;
  redeemed_rewards_month: number;
  accumulated_visits_month: number;
};

export type RewardMigrationActivity = {
  customer_id: string;
  customer_name: string;
  quantity: number | string;
  note: string | null;
  created_at: string;
};

export type RewardRedemptionActivity = {
  customer_id: string;
  customer_name: string;
  benefit_id: string | null;
  benefit_name: string;
  discount_amount: number | string;
  applied_at: string;
};

export type RewardDashboardActivity = {
  latest_migrations: RewardMigrationActivity[];
  latest_redemptions: RewardRedemptionActivity[];
};

export type RewardSummaryRecord = {
  customer_id: string;
  total_service_visits: number | string;
  total_sales_count: number | string;
  total_product_purchases: number | string;
  total_amount_spent: number | string;
  available_rewards_count: number | string;
  redeemed_rewards_count: number | string;
  next_reward_name: string | null;
  next_reward_remaining: number | string | null;
};

export type RewardLedgerRecord = {
  id: string;
  sale_id: string | null;
  rule_id: string | null;
  movement_type: "accrual" | "reversal" | "manual_migration" | "manual_adjustment";
  metric_type: RewardMetricType;
  quantity: number | string;
  amount: number | string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type RewardEntitlementRecord = {
  id: string;
  rule_id: string | null;
  benefit_id: string;
  source_ledger_id: string | null;
  status: "available" | "redeemed" | "expired" | "cancelled";
  earned_at: string;
  expires_at: string | null;
  redeemed_at: string | null;
  redeemed_sale_id: string | null;
  cancelled_at: string | null;
  notes: string | null;
  reward_benefits?: {
    name: string | null;
    benefit_type: RewardBenefitType | null;
  } | null;
};

export type RewardRedemptionRecord = {
  id: string;
  entitlement_id: string;
  sale_id: string;
  benefit_id: string;
  discount_amount: number | string;
  status: "applied" | "cancelled";
  applied_at: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  reward_benefits?: {
    name: string | null;
  } | null;
};

export type RewardCustomerRecord = {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  phone: string | null;
  document_type: string | null;
  document_number: string | null;
  is_active: boolean;
};

export type RewardCustomerDetail = {
  customer: RewardCustomerRecord | null;
  summary: RewardSummaryRecord | null;
  ledger: RewardLedgerRecord[];
  entitlements: RewardEntitlementRecord[];
  redemptions: RewardRedemptionRecord[];
};

export type RewardAvailableRecord = {
  id: string;
  rule_id: string | null;
  benefit_id: string;
  status: "available";
  earned_at: string;
  expires_at: string | null;
  notes: string | null;
  reward_benefits?: {
    name: string | null;
    description: string | null;
    benefit_type: RewardBenefitType | null;
    service_id: string | null;
    product_id: string | null;
    voucher_amount: number | string | null;
    discount_percent: number | string | null;
    applies_to: RewardBenefitAppliesTo | null;
    max_discount_amount: number | string | null;
  } | null;
};

export type RewardRuleFormValue = {
  name: string;
  description: string;
  metric_type: RewardMetricType;
  threshold_value: string;
  benefit_id: string;
  service_id: string;
  applies_to: RewardRuleAppliesTo;
  starts_at: string;
  ends_at: string;
  expires_days: string;
  is_repeatable: boolean;
  is_active: boolean;
};

export type RewardBenefitFormValue = {
  name: string;
  description: string;
  benefit_type: RewardBenefitType;
  service_id: string;
  product_id: string;
  voucher_amount: string;
  discount_percent: string;
  applies_to: RewardBenefitAppliesTo;
  max_discount_amount: string;
  is_active: boolean;
};

export const rewardMetricLabels: Record<RewardMetricType, string> = {
  service_visit_count: "Atenciones generales",
  sale_count: "Ventas",
  product_purchase_count: "Compras con productos",
  amount_spent: "Monto acumulado",
  specific_service_count: "Atenciones de un servicio especifico",
};

export const rewardRuleAppliesToLabels: Record<RewardRuleAppliesTo, string> = {
  global: "Global",
  products_only: "Solo productos",
  services_only: "Solo servicios",
  specific_service: "Servicio especifico",
  specific_product: "Producto especifico",
};

export const rewardBenefitLabels: Record<RewardBenefitType, string> = {
  free_service: "Servicio gratis",
  voucher_amount: "Vale por monto",
  product_discount_percent: "Descuento en productos",
};

export const rewardBenefitAppliesToLabels: Record<RewardBenefitAppliesTo, string> = {
  all: "Todo",
  products_only: "Solo productos",
  services_only: "Solo servicios",
  specific_service: "Servicio especifico",
  specific_product: "Producto especifico",
};

export function createEmptyRewardRuleForm(): RewardRuleFormValue {
  return {
    name: "",
    description: "",
    metric_type: "service_visit_count",
    threshold_value: "",
    benefit_id: "",
    service_id: "",
    applies_to: "global",
    starts_at: "",
    ends_at: "",
    expires_days: "",
    is_repeatable: true,
    is_active: true,
  };
}

export function createEmptyRewardBenefitForm(): RewardBenefitFormValue {
  return {
    name: "",
    description: "",
    benefit_type: "voucher_amount",
    service_id: "",
    product_id: "",
    voucher_amount: "",
    discount_percent: "",
    applies_to: "all",
    max_discount_amount: "",
    is_active: true,
  };
}

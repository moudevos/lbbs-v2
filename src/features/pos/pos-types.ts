export type PosRole = "owner" | "admin" | "reception" | "barber" | "viewer";

export type PosBranchRecord = {
  id: string;
  code: string | null;
  name: string;
  slug: string;
  short_name: string | null;
  is_active: boolean;
};

export type PosSessionRecord = {
  id: string;
  branch_id: string;
  branch_name: string | null;
  branch_code: string | null;
  branch_slug: string | null;
  status: "open" | "pending_close" | "closed" | "cancelled";
  business_date: string;
  opening_cash_amount: string;
  opened_at: string;
  opened_by: string | null;
  opened_by_name: string | null;
  opening_notes: string | null;
  total_sales_amount?: string;
};

export type PosEmployeeRecord = {
  id: string;
  branch_id: string | null;
  full_name: string;
  role: PosRole;
  status: "active" | "inactive" | "blocked";
};

export type PosCustomerRecord = {
  id: string;
  full_name: string;
  phone: string;
  document_number: string | null;
  is_active: boolean;
};

export type PosPaymentMethodRecord = {
  id: string;
  code: "cash" | "wallet_qr" | "card_pos" | string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  payment_kind: "cash" | "wallet_qr" | "card" | "bank_transfer" | "other_digital" | "internal_credit";
  allows_change: boolean;
  counts_as_cash: boolean;
};

export type PosCourtesyReasonRecord = {
  id: string;
  code: string;
  name: string;
};

export type PosServiceRecord = {
  id: string;
  category_id: string | null;
  category_name: string | null;
  name: string;
  description: string | null;
  duration_minutes: number;
  final_price: string;
  allow_custom_price: boolean;
  is_active: boolean;
};

export type PosProductRecord = {
  id: string;
  category_id: string | null;
  category_name: string | null;
  name: string;
  description: string | null;
  sku: string | null;
  barcode: string | null;
  final_sale_price: string;
  stock_quantity: string;
  allow_custom_price: boolean;
  is_stockable: boolean;
  is_courtesy_allowed: boolean;
  is_active: boolean;
};

export type PosCourtesyRuleBenefit = {
  id: string;
  benefit_item_type: "service" | "product";
  service_id: string | null;
  product_id: string | null;
  service_category_id: string | null;
  product_category_id: string | null;
  max_quantity: number;
  max_unit_amount: number | null;
  is_active: boolean;
};

export type PosCourtesyRule = {
  id: string;
  name: string;
  branch_id: string | null;
  priority: number;
  qualifying_service_id: string | null;
  qualifying_service_category_id: string | null;
  minimum_unit_amount: number;
  maximum_courtesy_items: number;
  maximum_courtesy_amount: number | null;
  allow_with_reward: boolean;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  benefits: PosCourtesyRuleBenefit[];
};

export type PosCatalogTab = "all" | "services" | "products";

export type PosCartItem = {
  id: string;
  catalog_id: string;
  item_type: "service" | "product";
  name: string;
  description: string | null;
  category_id?: string | null;
  category_name: string | null;
  quantity: number;
  unit_price: number;
  allow_custom_price?: boolean;
  discount_amount: number;
  is_courtesy: boolean;
  courtesy_reason: string;
  duration_minutes?: number;
  stock_quantity?: number;
  is_stockable?: boolean;
  is_courtesy_allowed?: boolean;
  reservation_suggestion?: boolean;
};

export type PosPreparedPayment = {
  id: string;
  payment_method_id: string;
  payment_method_code: string;
  payment_method_name: string;
  amount: number;
  tendered_amount: number;
  change_amount: number;
  allows_change?: boolean;
};

export type PosPaymentReconciliation = {
  payments: PosPreparedPayment[];
  appliedTotal: number;
  pendingBalance: number;
  changeAmount: number;
  difference: number;
  invalidPaymentIds: string[];
  requiresAdjustment: boolean;
};

export type PosRewardBenefitRecord = {
  name: string | null;
  description: string | null;
  benefit_type: "free_service" | "voucher_amount" | "product_discount_percent" | null;
  service_id: string | null;
  product_id: string | null;
  voucher_amount: number | string | null;
  discount_percent: number | string | null;
  applies_to:
    | "all"
    | "products_only"
    | "services_only"
    | "specific_service"
    | "specific_product"
    | null;
  max_discount_amount: number | string | null;
};

export type PosRewardEntitlement = {
  id: string;
  rule_id: string | null;
  benefit_id: string;
  status: "available";
  earned_at: string;
  expires_at: string | null;
  notes: string | null;
  reward_benefits?: PosRewardBenefitRecord | null;
};

export type PosInternalBenefitRule = {
  id: string;
  name: string;
  description: string | null;
  applies_to: "service" | "product" | "all";
  service_id: string | null;
  product_id: string | null;
  benefit_type: "free" | "fixed_price" | "discount_percent";
  benefit_value: number | string;
  usage_limit: number;
  period_kind: "calendar_month" | "payroll_period" | "none";
  production_mode?: "fixed" | "percentage" | "none";
  fixed_barber_payout: number | string;
  operational_contribution: number | string;
  recognized_production_amount?: number | string;
  beneficiary_scope?: "employee" | "socio" | "both";
  requires_owner_authorization: boolean;
  is_internal_complimentary: boolean;
};

export type PosInternalCustomerOptions = {
  employee: { id: string; fullName: string; role: string } | null;
  socio: { id: string; customerId: string; code: string | null } | null;
  beneficiaryType: "employee" | "socio" | null;
  canUseCredit: boolean;
  rules: PosInternalBenefitRule[];
};

export type PosCheckoutPayload = {
  idempotency_key: string;
  pos_session_id: string;
  branch_id: string;
  customer_id: string;
  barber_id: string | null;
  reservation_id?: string | null;
  reward_entitlement_id?: string | null;
  employee_benefit_rule_id?: string | null;
  socio_benefit_rule_id?: string | null;
  internal_credit?: boolean;
  authorization_pin?: string | null;
  notes?: string | null;
  items: Array<{
    catalog_id: string;
    item_type: "service" | "product";
    quantity: number;
    unit_price: number;
    discount_amount: number;
    is_courtesy: boolean;
    courtesy_reason?: string;
  }>;
  payments: Array<{
    payment_method_id: string;
    amount: number;
    tendered_amount: number;
    change_amount: number;
  }>;
};

export type PosSaleReceiptItem = {
  id: string;
  name: string;
  itemType: "service" | "product";
  quantity: number;
  unitPrice: number;
  total: number;
  isCourtesy: boolean;
};

export type PosCheckoutResult = {
  saleId: string;
  saleReference: string;
  occurredAt: string;
  branchName: string;
  customerName: string;
  barberName: string | null;
  reservationCompleted: boolean;
  items: PosSaleReceiptItem[];
  subtotal: number;
  discountTotal: number;
  courtesyTotal: number;
  total: number;
  payments: PosPreparedPayment[];
  paidTotal: number;
  changeAmount: number;
};

export type PosRecentSaleRecord = {
  id: string;
  saleReference: string;
  status: "draft" | "completed" | "cancelled";
  customerName: string;
  barberName: string | null;
  total: number;
  paidTotal: number;
  changeAmount: number;
  createdAt: string;
  closedAt: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  canCancel: boolean;
  paymentMethodLabels?: string[];
};

export type PosSessionCloseSummary = {
  sessionId: string;
  status: "open" | "pending_close" | "closed" | "cancelled";
  isOverdue: boolean;
  businessDate: string;
  branchId: string;
  branchName: string;
  openedAt: string;
  openedByName: string | null;
  openingCashAmount: number;
  openingNotes: string | null;
  grossTotal: number;
  discountTotal: number;
  manualDiscountTotal: number;
  rewardTotal: number;
  courtesyTotal: number;
  netTotal: number;
  completedSalesCount: number;
  cancelledSalesCount: number;
  draftSalesCount: number;
  paymentMethods: PosSessionPaymentSummary[];
  movements: PosSessionMovement[];
  rewards: PosSessionRewardDetail[];
  sales: PosSessionSaleDetail[];
  closingNotes: string | null;
  closedAt: string | null;
  closedByName: string | null;
};

export type PosSessionPaymentSummary = {
  paymentMethodId: string;
  code: string;
  name: string;
  isActive: boolean;
  expectedAmount: number;
  countedAmount: number | null;
  differenceAmount: number | null;
};

export type PosSessionMovement = {
  id: string;
  movementType: "income" | "expense" | "adjustment";
  categoryName: string;
  amount: number;
  description: string;
  status: string;
  createdAt: string;
};

export type PosSessionRewardDetail = {
  id: string;
  saleId: string;
  saleReference: string;
  customerName: string;
  rewardName: string;
  discountAmount: number;
  appliedAt: string;
};

export type PosSessionSaleDetail = {
  id: string;
  reference: string;
  status: SaleStatus;
  customerName: string;
  subtotal: number;
  discountTotal: number;
  courtesyTotal: number;
  total: number;
  createdAt: string;
  closedAt: string | null;
};

export type PosSessionHistoryRecord = {
  id: string;
  businessDate: string;
  branchId: string;
  branchName: string;
  openedAt: string;
  openedByName: string | null;
  closedAt: string | null;
  closedByName: string | null;
  status: "open" | "pending_close" | "closed" | "cancelled";
  isOverdue: boolean;
  openingCashAmount: number;
  totalSalesAmount: number;
  expectedCashAmount: number;
  countedCashAmount: number | null;
  totalDifferenceAmount: number | null;
};

export type SaleStatus = "draft" | "completed" | "cancelled";

export type SalesHistoryRecord = {
  id: string;
  saleReference: string;
  createdAt: string;
  closedAt: string | null;
  status: SaleStatus;
  customerName: string;
  branchName: string;
  barberName: string | null;
  total: number;
  paidTotal: number;
  changeAmount: number;
  paymentMethodLabels: string[];
  posSessionLabel: string;
  hasCourtesy: boolean;
  itemTypes: Array<"service" | "product">;
  canCancel: boolean;
};

export type SalesHistoryFilters = {
  dateFrom: string;
  dateTo: string;
  branchId: string;
  status: "" | SaleStatus;
  customer: string;
  barberId: string;
  paymentMethodId: string;
  posSessionId: string;
  itemType: "" | "service" | "product";
  courtesy: "" | "with_courtesy" | "without_courtesy";
};

export type SalesHistoryOption = {
  id: string;
  label: string;
};

export type SaleDetailItem = {
  id: string;
  itemType: "service" | "product";
  name: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  total: number;
  isCourtesy: boolean;
  courtesyReason: string | null;
  barberName: string | null;
};

export type SaleDetailPayment = {
  id: string;
  paymentMethodCode: string;
  paymentMethodName: string;
  amount: number;
  tenderedAmount: number;
  changeAmount: number;
  reference: string | null;
  notes: string | null;
};

export type SaleDetailRecord = {
  id: string;
  saleReference: string;
  status: SaleStatus;
  createdAt: string;
  closedAt: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  branchName: string;
  customerName: string;
  barberName: string | null;
  reservationId: string | null;
  subtotal: number;
  discountTotal: number;
  courtesyTotal: number;
  total: number;
  paidTotal: number;
  changeAmount: number;
  closedByName: string | null;
  canCancel: boolean;
  items: SaleDetailItem[];
  payments: SaleDetailPayment[];
};

export type SalesHistoryPayload = {
  data: SalesHistoryRecord[];
  filters: {
    branches: SalesHistoryOption[];
    barbers: SalesHistoryOption[];
    paymentMethods: SalesHistoryOption[];
    sessions: SalesHistoryOption[];
  };
};

export type ClosePosSessionPayload = {
  counted_amounts: Record<string, string>;
  notes: string;
};

export type PosBootstrapPayload = {
  role: PosRole;
  employee: PosEmployeeRecord | null;
  branches: PosBranchRecord[];
  selectedBranchId: string;
  openSessions: PosSessionRecord[];
  activeSession: PosSessionRecord | null;
  customerVarious: PosCustomerRecord | null;
  paymentMethods: PosPaymentMethodRecord[];
  courtesyReasons: PosCourtesyReasonRecord[];
  courtesyRules: PosCourtesyRule[];
  reservationPrefill?: {
    id: string;
    customer: PosCustomerRecord;
    branchId: string;
    barberId: string | null;
    serviceId: string | null;
  } | null;
};

export type OpenPosSessionPayload = {
  branch_id: string;
  opening_cash_amount: string;
  notes: string;
};

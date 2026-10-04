type Row = Record<string, unknown>;

export type SettlementAmountLine = { id: string; label: string; amount: number; detail?: string };
export type SettlementServiceLineSummary = {
  id: string;
  accountingDate: string; saleReference: string; saleId: string;
  serviceName: string;
  origin: string;
  commercialValue: number;
  recognized: number;
  contribution: number;
  commissionBase: number;
  commissionRate: number;
  commission: number;
  fixedCommission: number;
  isPercentageCommission: boolean;
};
export type SettlementProductLineSummary = {
  id: string; accountingDate: string; saleReference: string; saleId: string; saleNumber: string; productName: string;
  family: string; quantity: number; salesGross: number; recognized: number; bonus: number; origin: string;
};

const numeric = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const relation = (value: unknown) => {
  const item = Array.isArray(value) ? value[0] : value;
  return item && typeof item === "object" ? (item as Row) : null;
};
const sourceLabel: Record<string, string> = {
  normal: "Venta normal",
  commercial_discount: "Descuento comercial",
  reward: "Reward",
  courtesy: "Cortesía",
  employee_benefit: "Beneficio interno",
};
const debtLabels: Record<string, string> = {
  loan: "Adelantos y/o préstamos",
  advance: "Adelantos y/o préstamos",
  internal_credit: "Consumo personal",
  supply: "Entrega de productos",
  penalty: "Penalidad",
  administrative_charge: "Cargo administrativo",
  other: "Otros descuentos",
};
const familyLabels: Record<string, string> = { barbershop_products: "Productos de barbería", cafeteria_products: "Cafetería", other: "Sin clasificar" };

/**
 * Canonical presentation model for settlement review, HTML document and PDF.
 * It reads immutable settlement snapshots first and only uses production
 * relations as a backward-compatible fallback for older documents.
 */
export function buildSettlementFinancialSummary(detail: Row, services: Row[], deductions: Row[], bonuses: Row[] = []) {
  const serviceLines: SettlementServiceLineSummary[] = services.map((line) => {
    const source = String(line.production_source_snapshot ?? "normal");
    return {
      id: String(line.id ?? line.production_entry_id ?? "service"),
      accountingDate: String(line.accounting_date_snapshot ?? line.production_date_snapshot ?? ""),
      saleReference: String(line.sale_reference_snapshot ?? ""),
      saleId: String(line.sale_id_snapshot ?? ""),
      serviceName: String(line.service_name_snapshot ?? "Servicio"),
      origin: sourceLabel[source] ?? source,
      commercialValue: numeric(line.original_line_total_snapshot),
      recognized: numeric(line.recognized_production_amount_snapshot),
      contribution: numeric(line.operational_contribution_snapshot),
      commissionBase: numeric(line.commissionable_amount),
      commissionRate: numeric(line.commission_rate),
      commission: numeric(line.commission_amount),
      fixedCommission: numeric(line.fixed_commission_amount),
      isPercentageCommission: source === "normal"
        || source === "commercial_discount"
        || (source === "reward" && String(line.reward_commission_mode_snapshot ?? "") === "percentage"),
    };
  });
  const isReward = (line: Row) => String(line.production_source_snapshot ?? "normal") === "reward";
  const serviceCount = numeric(detail.total_service_count) || services.filter((line) => !isReward(line)).length;
  const rewardCount = numeric(detail.total_reward_count) || services.filter(isReward).length;
  const productCount = numeric(detail.total_product_count);
  const productLines: SettlementProductLineSummary[] = bonuses.map((line) => {
    const saleReference = String(line.sale_number_snapshot ?? "").startsWith("VTA-")
      ? String(line.sale_number_snapshot)
      : (line.sale_id_snapshot ? `VTA-${String(line.sale_id_snapshot).slice(0, 8).toUpperCase()}` : "");
    return {
      id: String(line.id ?? line.product_bonus_entry_id ?? "product"),
      accountingDate: String(line.accounting_date_snapshot ?? line.accounting_date ?? ""),
      saleReference,
      saleId: String(line.sale_id_snapshot ?? ""),
      // Alias de compatibilidad para los documentos existentes; siempre usa la
      // referencia snapshot canónica y nunca sale.sale_number.
      saleNumber: saleReference,
      productName: String(line.product_name_snapshot ?? "Producto atribuido"),
      family: familyLabels[String(line.business_line_snapshot ?? line.business_line ?? "other")] ?? "Sin clasificar",
      quantity: numeric(line.quantity_snapshot ?? line.quantity ?? 1),
      salesGross: numeric(line.sales_gross_snapshot ?? line.sales_gross),
      recognized: numeric(line.recognized_production_amount_snapshot ?? line.recognized_production_amount),
      bonus: numeric(line.bonus_amount_snapshot ?? line.bonus_amount),
      origin: sourceLabel[String(line.origin_snapshot ?? "")] ?? String(line.origin_snapshot ?? "Venta de producto"),
    };
  });
  // Gross retail keeps the original commercial price of every service,
  // including Rewards. Recognized production below intentionally differs:
  // a Reward contributes its configured basis, never its retail price.
  const grossServices = services.reduce((total, line) => {
    return total + numeric(line.original_line_total_snapshot);
  }, 0);
  const recognizedServices = serviceLines.reduce((total, line) => total + line.recognized, 0);
  const totalProduction = numeric(detail.recognized_production_total) || numeric(detail.total_production_amount) || recognizedServices;
  const recognizedProducts = productLines.reduce((total, line) => total + line.recognized, 0) || Math.max(0, totalProduction - recognizedServices);
  const productionContribution = serviceLines.reduce((total, line) => total + line.contribution, 0);
  const commissionBase = numeric(detail.commissionable_base_total);
  const commissionRate = numeric(detail.commission_rate);
  const debtLines = deductions.map((deduction) => {
    const debt = relation(deduction.debt);
    const source = relation(deduction.debt_source);
    const debtType = String(deduction.debt_type_snapshot ?? debt?.debt_type ?? "other");
    let description = String(deduction.debt_description_snapshot ?? debt?.description ?? "Sin detalle");
    const createdAt = String(deduction.debt_created_at_snapshot ?? debt?.created_at ?? "");
    const before = numeric(deduction.balance_before);
    const after = numeric(deduction.balance_after);
    const isPosDebt = debtType === "internal_credit" || debtType === "supply";
    const displayDescription = String(
      isPosDebt
        ? deduction.debt_first_item_description_snapshot ?? source?.first_item_description ?? source?.source_description ?? description
        : description,
    );
    const saleReference = String(deduction.debt_sale_reference_snapshot ?? source?.sale_reference ?? "");
    const extraItems = numeric(deduction.debt_extra_item_count_snapshot ?? source?.extra_item_count);
    description = `${displayDescription}${extraItems > 0 ? ` · + ${extraItems} items más` : ""}${saleReference ? ` · Venta ${saleReference}` : ""}`;
    return {
      id: String(deduction.id ?? deduction.employee_debt_id ?? `${debtType}:${description}`),
      label: isPosDebt ? "Consumo POS" : debtLabels[debtType] ?? debtLabels.other,
      amount: numeric(deduction.amount),
      detail: `${description}${createdAt ? ` · ${createdAt.slice(0, 10)}` : ""}${before ? ` · saldo ${before.toFixed(2)} → ${after.toFixed(2)}` : ""}`,
    };
  });
  const incomes: SettlementAmountLine[] = [
    { id: "percentage-commission", label: "Comisión porcentual", detail: `Base ${commissionBase.toFixed(2)} × ${commissionRate.toFixed(2)} %`, amount: numeric(detail.percentage_commission_total) },
    { id: "product-bonuses", label: "Bonos por productos", amount: numeric(detail.product_bonus_total) },
    { id: "reward-fixed", label: "Rewards con pago fijo", amount: numeric(detail.reward_fixed_commission_total) },
    { id: "courtesy-fixed", label: "Bonos por servicios", amount: numeric(detail.courtesy_fixed_commission_total) },
    { id: "manual-bonuses", label: "Bonos o ajustes manuales", amount: numeric(detail.manual_bonus_total) },
  ].filter((line) => line.amount > 0);
  const expenses: SettlementAmountLine[] = [
    ...debtLines,
    { id: "other-deductions", label: "Otros descuentos", amount: numeric(detail.other_deduction_total) },
    {
      id: "mandatory-discount", label: "Descuento obligatorio",
      detail: `${numeric(detail.mandatory_discount_rate).toFixed(2)} % sobre producción reconocida: S/ ${numeric(detail.mandatory_discount_base_amount).toFixed(2)}`,
      amount: numeric(detail.mandatory_discount_amount),
    },
  ].filter((line) => line.amount > 0);

  return {
    serviceCount,
    productCount,
    rewardCount,
    grossServices,
    recognizedServices,
    recognizedProducts,
    totalProduction,
    productionContribution,
    productionBase: commissionBase,
    commissionRate,
    serviceLines,
    productLines,
    incomes,
    expenses,
    totalIncome: incomes.reduce((total, line) => total + line.amount, 0),
    totalExpenses: expenses.reduce((total, line) => total + line.amount, 0),
  };
}

export const buildSettlementDocumentSummary = buildSettlementFinancialSummary;

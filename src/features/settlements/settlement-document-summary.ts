type Row = Record<string, unknown>;

export type SettlementAmountLine = { label: string; amount: number; detail?: string };

const numeric = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const relation = (value: unknown) => {
  const item = Array.isArray(value) ? value[0] : value;
  return item && typeof item === "object" ? (item as Row) : null;
};
const debtLabels: Record<string, string> = {
  loan: "Adelantos y/o préstamos", advance: "Adelantos y/o préstamos", internal_credit: "Consumo personal", supply: "Entrega de productos", penalty: "Penalidad", other: "Otros descuentos",
};

export function buildSettlementDocumentSummary(detail: Row, services: Row[], deductions: Row[]) {
  const sourceOf = (line: Row) => String(line.production_source_snapshot ?? relation(line.production)?.production_source ?? "normal");
  const serviceCount = numeric(detail.total_service_count) || services.filter((line) => sourceOf(line) !== "reward").length;
  const rewardCount = numeric(detail.total_reward_count) || services.filter((line) => sourceOf(line) === "reward").length;
  const productCount = numeric(detail.total_product_count);
  const servicesGross = services.reduce((total, line) => {
    const production = relation(line.production);
    return total + numeric(production?.original_line_total ?? line.original_line_total_snapshot);
  }, 0);
  const productionDiscount = services.reduce((total, line) => {
    const production = relation(line.production);
    return total + numeric(production?.operational_contribution_amount ?? line.operational_contribution_snapshot);
  }, 0);
  const productionBase = numeric(detail.commissionable_base_total);
  const commissionRate = numeric(detail.commission_rate);
  const debtLines = deductions.map((deduction) => {
    const debt = relation(deduction.debt);
    const debtType = String(deduction.debt_type_snapshot ?? debt?.debt_type ?? "other");
    const description = String(deduction.debt_description_snapshot ?? debt?.description ?? "Sin detalle");
    const createdAt = String(deduction.debt_created_at_snapshot ?? debt?.created_at ?? "");
    const before = numeric(deduction.balance_before);
    const after = numeric(deduction.balance_after);
    return { label: debtLabels[debtType] ?? debtLabels.other, amount: numeric(deduction.amount), detail: `${description}${createdAt ? ` · ${createdAt.slice(0, 10)}` : ""}${before ? ` · saldo ${before.toFixed(2)} → ${after.toFixed(2)}` : ""}` };
  });
  const incomes: SettlementAmountLine[] = [
    { label: "Total producción", detail: `Base × ${commissionRate.toFixed(2)} %`, amount: numeric(detail.percentage_commission_total) },
    { label: "Bonos por productos", amount: numeric(detail.product_bonus_total) },
    { label: "Rewards con pago fijo", amount: numeric(detail.reward_fixed_commission_total) },
    { label: "Rewards por porcentaje", detail: "Incluido en Total producción", amount: 0 },
    { label: "Bonos por servicios", amount: numeric(detail.courtesy_fixed_commission_total) },
    { label: "Bonos o ajustes manuales", amount: numeric(detail.manual_bonus_total) },
  ].filter((line) => line.amount > 0);
  const expenses: SettlementAmountLine[] = [
    ...debtLines,
    { label: "Otros descuentos", amount: numeric(detail.other_deduction_total) },
    { label: "Descuento obligatorio", detail: `${numeric(detail.mandatory_discount_rate).toFixed(2)} % sobre ventas brutas atribuidas: S/ ${numeric(detail.mandatory_discount_base_amount).toFixed(2)}`, amount: numeric(detail.mandatory_discount_amount) },
  ].filter((line) => line.amount > 0);
  return { serviceCount, productCount, rewardCount, servicesGross, productionDiscount, productionBase, totalProduction: numeric(detail.total_production_amount) || numeric(detail.mandatory_discount_base_amount), incomes, expenses, totalIncome: incomes.reduce((total, line) => total + line.amount, 0), totalExpenses: expenses.reduce((total, line) => total + line.amount, 0) };
}

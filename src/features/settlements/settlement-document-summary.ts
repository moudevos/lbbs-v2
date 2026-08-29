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
  loan: "Pago de deuda", advance: "Pago de adelanto", internal_credit: "Pago de consumo", supply: "Pago de insumo", other: "Otros descuentos",
};

export function buildSettlementDocumentSummary(detail: Row, services: Row[], deductions: Row[]) {
  const serviceCount = services.length;
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
  const debtByType = deductions.reduce<Record<string, number>>((totals, deduction) => {
    const debtType = String(relation(deduction.debt)?.debt_type ?? "other");
    totals[debtType] = (totals[debtType] ?? 0) + numeric(deduction.amount);
    return totals;
  }, {});
  const incomes: SettlementAmountLine[] = [
    { label: "Total producción", detail: `Base × ${commissionRate.toFixed(2)} %`, amount: numeric(detail.percentage_commission_total) },
    { label: "Bonos por productos", amount: numeric(detail.product_bonus_total) },
    { label: "Bonos por rewards", amount: numeric(detail.reward_fixed_commission_total) },
    { label: "Bonos por servicios", amount: numeric(detail.courtesy_fixed_commission_total) },
    { label: "Bonos o ajustes manuales", amount: numeric(detail.manual_bonus_total) },
  ].filter((line) => line.amount > 0);
  const expenses: SettlementAmountLine[] = [
    ...Object.entries(debtByType).map(([debtType, amount]) => ({ label: debtLabels[debtType] ?? debtLabels.other, amount })),
    { label: "Otros descuentos", amount: numeric(detail.other_deduction_total) },
    { label: "Descuento obligatorio", detail: `${numeric(detail.mandatory_discount_rate).toFixed(2)} %`, amount: numeric(detail.mandatory_discount_amount) },
  ].filter((line) => line.amount > 0);
  return { serviceCount, servicesGross, productionDiscount, productionBase, incomes, expenses, totalIncome: incomes.reduce((total, line) => total + line.amount, 0), totalExpenses: expenses.reduce((total, line) => total + line.amount, 0) };
}

export const profitLossLines = {
  service_revenue: { label: "Ingresos por servicios", section: "income", detailLine: "service_revenue" },
  barbershop_product_revenue: { label: "Venta de productos de barbería", section: "income", detailLine: "barbershop_product_revenue" },
  cafeteria_product_revenue: { label: "Venta de productos de cafetería", section: "income", detailLine: "cafeteria_product_revenue" },
  other_operating_revenue: { label: "Otros ingresos operativos", section: "income", detailLine: "other_operating_revenue" },
  total_operating_revenue: { label: "Ingresos operativos totales", section: "income", detailLine: null },
  product_cogs: { label: "Costo de productos vendidos", section: "direct_cost", detailLine: "product_cogs" },
  courtesy_real_cost: { label: "Costo real de cortesías", section: "direct_cost", detailLine: "courtesy_real_cost", description: "Costo histórico de los productos entregados como cortesía, no su precio de venta." },
  personnel_accrued_cost: { label: "Costo de personal devengado", section: "direct_cost", detailLine: "personnel_accrued_cost", description: "Costo reconocido por el trabajo realizado en el periodo, independientemente de si la liquidación ya fue pagada." },
  total_direct_costs: { label: "Costos directos totales", section: "direct_cost", detailLine: null },
  gross_profit: { label: "Utilidad bruta", section: "result", detailLine: null },
  operating_expenses: { label: "Gastos operativos", section: "expense", detailLine: "operating_expenses" },
  operating_profit: { label: "Resultado operativo", section: "result", detailLine: null },
} as const;

export type ProfitLossLineId = keyof typeof profitLossLines;

const financialPostingCodeLabels: Record<string, string> = {
  sale_revenue: "Ingresos por ventas",
  sale_revenue_reversal: "Reversa de ingresos por ventas",
  sale_revenue_historical_reversal: "Reversa histórica de ingresos por ventas",
  product_cost_of_sales: "Costo de productos vendidos",
  product_cost_of_sales_reversal: "Reversa de costo de productos vendidos",
  product_cost_of_sales_historical_reversal: "Reversa histórica de costo de productos vendidos",
  courtesy_actual_cost: "Costo real de cortesías",
  courtesy_actual_cost_reversal: "Reversa de costo real de cortesías",
  courtesy_actual_cost_historical_reversal: "Reversa histórica de costo real de cortesías",
  approved_settlement_personnel_cost: "Costo de personal por liquidación aprobada",
  approved_settlement_personnel_cost_reversal: "Reversa de costo de personal",
  finance_manual_entry: "Ajuste financiero manual",
  finance_manual_entry_reversal: "Reversa de ajuste financiero manual",
  finance_manual_entry_payable: "Cuenta por pagar registrada",
  employee_credit_receivable: "Crédito de empleado por cobrar",
  employee_debt_collection: "Cobro de deuda de empleado",
  employee_debt_receivable: "Deuda de empleado por cobrar",
};

const technicalWordLabels: Record<string, string> = {
  approved: "aprobado",
  settlement: "liquidación",
  personnel: "personal",
  cost: "costo",
  reversal: "reversa",
  historical: "histórica",
  sale: "venta",
  revenue: "ingresos",
  product: "producto",
  courtesy: "cortesía",
  actual: "real",
  finance: "financiero",
  manual: "manual",
  entry: "registro",
  payable: "cuenta por pagar",
  employee: "empleado",
  credit: "crédito",
  receivable: "cuenta por cobrar",
  debt: "deuda",
  collection: "cobro",
  operating: "operativo",
  income: "ingreso",
  expense: "gasto",
  asset: "activo",
  movement: "movimiento",
  financing: "financiamiento",
};

function humanizeTechnicalFinancialLabel(value: string) {
  if (!value.includes("_") && !value.includes("-")) return value;
  const words = value
    .toLowerCase()
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => technicalWordLabels[word] ?? word);
  const text = words.join(" ");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : value;
}

export function getFinancialPostingLabel(code: string, context?: ProfitLossLineId | null) {
  if (code === "finance_manual_entry") {
    if (context === "personnel_accrued_cost") return "Ajuste manual de costo de personal";
    if (context === "operating_expenses") return "Gasto operativo registrado manualmente";
    if (context === "other_operating_revenue") return "Ingreso operativo registrado manualmente";
  }
  if (code === "finance_manual_entry_reversal") {
    if (context === "personnel_accrued_cost") return "Reversa de ajuste manual de costo de personal";
    if (context === "operating_expenses") return "Reversa de gasto operativo manual";
    if (context === "other_operating_revenue") return "Reversa de ingreso operativo manual";
  }
  return financialPostingCodeLabels[code] ?? humanizeTechnicalFinancialLabel(code);
}
export type ProfitLossNumbers = { serviceRevenue: number; barbershopRevenue: number; cafeteriaRevenue: number; otherRevenue: number; totalRevenue: number; productCogs: number; courtesyCost: number; personnelCost: number; directCosts: number; grossProfit: number; operatingExpenses: number; operatingProfit: number };
export const moneyDifference = (left: number, right: number) => Math.round((left - right) * 100) / 100;
export function reconcileProfitLoss(value: ProfitLossNumbers) {
  return {
    income: moneyDifference(value.serviceRevenue + value.barbershopRevenue + value.cafeteriaRevenue + value.otherRevenue, value.totalRevenue),
    directCosts: moneyDifference(value.productCogs + value.courtesyCost + value.personnelCost, value.directCosts),
    grossProfit: moneyDifference(value.totalRevenue - value.directCosts, value.grossProfit),
    operatingProfit: moneyDifference(value.grossProfit - value.operatingExpenses, value.operatingProfit),
  };
}
export const isReconciled = (difference: number) => Math.abs(difference) <= 0.01;

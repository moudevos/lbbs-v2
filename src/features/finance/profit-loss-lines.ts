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

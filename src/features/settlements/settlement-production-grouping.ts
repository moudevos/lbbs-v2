import type { SettlementProductLineSummary, SettlementServiceLineSummary } from "@/features/settlements/settlement-document-summary";

export type SettlementProductionSaleGroup = {
  reference: string;
  date: string;
  services: SettlementServiceLineSummary[];
  products: SettlementProductLineSummary[];
  recognized: number;
  contribution: number;
  commissionBase: number;
  commission: number;
};

const saleReference = (reference: string, saleId: string) => {
  if (reference) return reference;
  if (saleId) return `VTA-${saleId.slice(0, 8).toUpperCase()}`;
  return "VTA-SIN-REFERENCIA";
};

/** Groups immutable settlement snapshots only; it never reads live sales. */
export function groupSettlementProductionBySale(
  services: SettlementServiceLineSummary[],
  products: SettlementProductLineSummary[],
): SettlementProductionSaleGroup[] {
  const groups = new Map<string, Omit<SettlementProductionSaleGroup, "recognized" | "contribution" | "commissionBase" | "commission">>();
  const add = (reference: string, saleId: string, date: string) => {
    const key = saleReference(reference, saleId);
    if (!groups.has(key)) groups.set(key, { reference: key, date, services: [], products: [] });
    const group = groups.get(key)!;
    if (!group.date && date) group.date = date;
    return group;
  };

  services.forEach((line) => add(line.saleReference, line.saleId, line.accountingDate).services.push(line));
  products.forEach((line) => add(line.saleReference, line.saleId, line.accountingDate).products.push(line));

  return [...groups.values()].map((group) => ({
    ...group,
    recognized: group.services.reduce((total, line) => total + line.recognized, 0) + group.products.reduce((total, line) => total + line.recognized, 0),
    contribution: group.services.reduce((total, line) => total + line.contribution, 0),
    commissionBase: group.services.reduce((total, line) => total + line.commissionBase, 0),
    commission: group.services.reduce((total, line) => total + line.commission + line.fixedCommission, 0) + group.products.reduce((total, line) => total + line.bonus, 0),
  }));
}

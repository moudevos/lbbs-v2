import { describe, expect, it } from "vitest";

import { buildSettlementDraftPreview, getSettlementDebtMaximum } from "@/features/settlements/settlement-draft-preview";

const preview = (debts: number[], totalOutstandingDebt = 0) => buildSettlementDraftPreview({
  percentageCommission: 49.5,
  fixedCommissions: 0,
  productBonuses: 2,
  manualBonuses: 0,
  mandatoryDiscount: 1.4,
  otherDeductions: 0,
  selectedDebtAmounts: debts,
  totalOutstandingDebt,
});

describe("settlement draft financial preview", () => {
  it("treats debt as an expense and computes the final net locally", () => {
    expect(preview([2.5])).toMatchObject({ totalIncome: 51.5, netBeforeDebt: 50.1, selectedDebtTotal: 2.5, totalExpenses: 3.9, netPay: 47.6, maxAdditionalDebt: 47.6 });
  });

  it("accumulates selected debts as expenses", () => {
    expect(preview([2.5, 20])).toMatchObject({ selectedDebtTotal: 22.5, totalExpenses: 23.9, netPay: 27.6, maxAdditionalDebt: 27.6 });
  });

  it("does not provide more debt capacity than the net before debts", () => {
    const result = preview([60]);
    expect(result).toMatchObject({ netBeforeDebt: 50.1, maxAdditionalDebt: 0, netPay: 0 });
    expect(60).toBeGreaterThan(result.netBeforeDebt);
    expect(getSettlementDebtMaximum(100, result.netBeforeDebt, 60, 60)).toBe(50.1);
  });

  it("caps Total at the draft capacity instead of the complete debt balance", () => {
    expect(getSettlementDebtMaximum(100, 30, 0, 0)).toBe(30);
  });

  it("returns the edited row's current amount to its available local limit", () => {
    expect(getSettlementDebtMaximum(100, 50.1, 30, 20)).toBe(40.1);
  });

  it("identifies debt exceeding the liquidation's total coverage capacity", () => {
    expect(preview([], 100)).toMatchObject({ netBeforeDebt: 50.1, totalOutstandingDebt: 100, debtCoverageCapacity: 50.1, debtExcess: 49.9 });
  });

  it("does not flag excess debt when the liquidation can cover all active debt", () => {
    expect(buildSettlementDraftPreview({
      percentageCommission: 100, fixedCommissions: 0, productBonuses: 0, manualBonuses: 0,
      mandatoryDiscount: 0, otherDeductions: 0, selectedDebtAmounts: [], totalOutstandingDebt: 60,
    }).debtExcess).toBe(0);
  });

  it("keeps debt remaining distinct from debt excess and never makes net pay negative", () => {
    const result = buildSettlementDraftPreview({
      percentageCommission: 50, fixedCommissions: 0, productBonuses: 0, manualBonuses: 0,
      mandatoryDiscount: 0, otherDeductions: 0, selectedDebtAmounts: [20], totalOutstandingDebt: 80,
    });
    expect(result).toMatchObject({ remainingDebtAfterSelection: 60, maxAdditionalDebt: 30, debtExcess: 30, netPay: 30 });
  });

  it("covers active debt only up to the liquidation capacity", () => {
    const result = preview([50.1], 100);
    expect(result).toMatchObject({ selectedDebtTotal: 50.1, netPay: 0, remainingDebtAfterSelection: 49.9 });
  });
});

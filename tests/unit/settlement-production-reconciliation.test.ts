import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildSettlementFinancialSummary } from "@/features/settlements/settlement-document-summary";

const migrationPath = path.join(process.cwd(), "src/sql/170_release_pre_treasury.sql");
const productionReconciliationBlock = (sql: string) => sql.slice(
  sql.indexOf("-- BLOQUE: Settlement production reconciliation"),
  sql.indexOf("-- BLOQUE: Phase 1A/1B close initial migration"),
);
const detail = {
  total_service_count: 1, total_product_count: 1, total_reward_count: 2,
  recognized_production_total: 110, total_production_amount: 110,
  commissionable_base_total: 69, commission_rate: 50, percentage_commission_total: 34.5,
  mandatory_discount_base_amount: 110, mandatory_discount_rate: 1, mandatory_discount_amount: 1.1,
};
const services = [
  { id: "normal", service_name_snapshot: "Corte", production_source_snapshot: "normal", original_line_total_snapshot: 35, recognized_production_amount_snapshot: 35, operational_contribution_snapshot: 2, commissionable_amount: 33, commission_rate: 50, commission_amount: 16.5, fixed_commission_amount: 0 },
  { id: "reward-1", service_name_snapshot: "Reward", production_source_snapshot: "reward", original_line_total_snapshot: 35, recognized_production_amount_snapshot: 20, operational_contribution_snapshot: 2, commissionable_amount: 18, commission_rate: 50, commission_amount: 9, fixed_commission_amount: 0 },
  { id: "reward-2", service_name_snapshot: "Reward", production_source_snapshot: "reward", original_line_total_snapshot: 35, recognized_production_amount_snapshot: 20, operational_contribution_snapshot: 2, commissionable_amount: 18, commission_rate: 50, commission_amount: 9, fixed_commission_amount: 0 },
];

describe("reconciliación de producción y liquidación", () => {
  it("separa S/105 bruto de servicios, S/75 reconocido por servicios y S/35 de producto", () => {
    const summary = buildSettlementFinancialSummary(detail, services, []);
    expect(summary.grossServices).toBe(105);
    expect(summary.recognizedServices).toBe(75);
    expect(summary.recognizedProducts).toBe(35);
    expect(summary.totalProduction).toBe(110);
  });

  it("conserva aportes S/6, base comisionable S/69 y comisión S/34.50", () => {
    const summary = buildSettlementFinancialSummary(detail, services, []);
    expect(summary.productionContribution).toBe(6);
    expect(summary.productionBase).toBe(69);
    expect(summary.incomes.find((line) => line.label === "Comisión porcentual")?.amount).toBe(34.5);
  });

  it("calcula el obligatorio sobre S/110 reconocido, nunca sobre base comisionable", () => {
    const summary = buildSettlementFinancialSummary(detail, services, []);
    expect(summary.expenses.find((line) => line.label === "Descuento obligatorio")?.amount).toBe(1.1);
    expect(summary.productionBase).not.toBe(Number(detail.mandatory_discount_base_amount));
  });

  it("expone el detalle de línea con origen, reconocido, aporte, base y ambas comisiones", () => {
    const summary = buildSettlementFinancialSummary(detail, services, []);
    expect(summary.serviceLines[1]).toMatchObject({ origin: "Reward", recognized: 20, contribution: 2, commissionBase: 18, commissionRate: 50, commission: 9, fixedCommission: 0 });
  });

  it("agrupa deudas con concepto, fecha y saldos de auditoría", () => {
    const summary = buildSettlementFinancialSummary(detail, services, [{ amount: 17, balance_before: 20, balance_after: 3, debt_type_snapshot: "internal_credit", debt_description_snapshot: "Venta VTA-001", debt_created_at_snapshot: "2026-09-22T12:00:00Z" }]);
    expect(summary.expenses[0]).toMatchObject({ label: "Consumo POS", amount: 17 });
    expect(summary.expenses[0].detail).toContain("Venta VTA-001");
    expect(summary.expenses[0].detail).toContain("2026-09-22");
  });

  it("ordena la configuración Reward antes del snapshot reconocido", async () => {
    const source = await readFile(migrationPath, "utf8");
    const block = productionReconciliationBlock(source);
    expect(block).toContain("employee_service_production_010_reward_commission_configuration_v180");
    expect(block).toContain("new.recognized_production_amount := greatest(coalesce(new.reward_commission_basis_amount, 0), 0)");
  });

  it("limita el backfill a sesión cerrada, periodo abierto y producción sin liquidar", async () => {
    const source = await readFile(migrationPath, "utf8");
    const block = productionReconciliationBlock(source);
    expect(block).toContain("session.status = 'closed'");
    expect(block).toContain("period.status not in ('closed', 'cancelled')");
    expect(block).toContain("settlement.status <> 'cancelled'");
  });

  it("asigna porcentaje a línea normal y Reward porcentual", async () => {
    const source = await readFile(migrationPath, "utf8");
    const block = productionReconciliationBlock(source);
    expect(block).toContain("production.production_source in ('normal', 'commercial_discount') then v_rate");
    expect(block).toContain("production.reward_commission_mode = 'percentage' then v_rate");
  });

  it("preserva Rewards fijos sin comisión porcentual", async () => {
    expect(productionReconciliationBlock(await readFile(migrationPath, "utf8"))).toContain("production.production_source = 'reward' and production.reward_commission_mode = 'fixed'");
  });

  it("traduce motivos de anulación y no escribe una columna updated_at inexistente", async () => {
    const source = await readFile(migrationPath, "utf8");
    const block = productionReconciliationBlock(source);
    for (const code of ["CALCULATION_ERROR", "WRONG_EMPLOYEE", "WRONG_PERIOD", "WRONG_PRODUCTION", "DUPLICATE", "ADMINISTRATIVE_CORRECTION", "OTHER"]) expect(block).toContain(`'${code}'`);
    expect(block).toContain("p_reason_code = 'OTHER' and v_note is null");
    expect(block).toContain("public.transition_employee_settlement(p_settlement_id, 'cancel', v_reason)");
    expect(block).not.toContain("updated_at = now()");
  });
});

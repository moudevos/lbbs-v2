import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const sqlPath = path.resolve(root, "src/sql/170_release_pre_treasury.sql");

async function readSql() {
  return readFile(sqlPath, "utf8");
}

describe("Fase 0: motor financiero canónico", () => {
  it("mantiene las clasificaciones, fuente canónica y reversas trazables", async () => {
    const sql = await readSql();
    for (const group of [
      "operating_income", "cost_of_sales", "personnel_cost", "operating_expense",
      "asset_movement", "receivable", "payable", "financing", "cash_adjustment",
    ]) expect(sql).toContain(`'${group}'`);
    expect(sql).toContain("financial_postings_active_source_idx");
    expect(sql).toContain("financial_postings_one_reversal_idx");
    expect(sql).toContain("reversal_of_id");
    expect(sql).toContain("reverse_financial_posting");
  });

  it("separa P&L, aporte, cortesía comercial y costo real", async () => {
    const sql = await readSql();
    expect(sql).toContain("operational_contribution_amount");
    expect(sql).toContain("courtesy_retail_value");
    expect(sql).toContain("courtesy_actual_cost");
    expect(sql).toContain("product_cost_of_sales");
    expect(sql).toContain("courtesy_actual_cost");
    expect(sql).toContain("business_line in ('barbershop_products','cafeteria_products','other')");
  });

  it("formaliza compras, costo promedio, cuentas por pagar y pagos sin doble gasto", async () => {
    const sql = await readSql();
    expect(sql).toContain("inventory_receipts");
    expect(sql).toContain("inventory_receipt_lines");
    expect(sql).toContain("product_branch_inventory_costs");
    expect(sql).toContain("accounts_payable");
    expect(sql).toContain("receive_inventory_receipt");
    expect(sql).toContain("pay_accounts_payable");
    expect(sql).toContain("'inventory_purchase_payment'");
    expect(sql).toContain("'accounts_payable_payment'");
    expect(sql).toContain("'payable',false,true,31");
  });

  it("requiere recepción para transferencias y lleva las mermas al costo", async () => {
    const sql = await readSql();
    expect(sql).toContain("status='in_transit'");
    expect(sql).toContain("receive_inventory_transfer");
    expect(sql).toContain("inventory_losses");
    expect(sql).toContain("INVENTORY_ERROR");
    expect(sql).toContain("record_inventory_loss");
    expect(sql).toContain("'inventory_loss'");
  });

  it("resuelve el precio de empleado en servidor y trata el crédito como cuenta por cobrar", async () => {
    const sql = await readSql();
    expect(sql).toContain("employee_supply_catalog_items");
    expect(sql).toContain("visibility_scope in('internal','both')");
    expect(sql).toContain("checkout_pos_sale_phase0_core");
    expect(sql).toContain("employee_credit_receivable");
    expect(sql).toContain("employee_credit_collection");
    expect(sql).toContain("'receivable','asset_increase'");
    expect(sql).toContain("'receivable','asset_decrease'");
  });

  it("devenga personal solo al aprobar, conserva el periodo y bloquea fechas cerradas", async () => {
    const sql = await readSql();
    expect(sql).toContain("sync_settlement_personnel_cost");
    expect(sql).toContain("new.status='approved'");
    expect(sql).toContain("v_period.end_date");
    expect(sql).toContain("approved_settlement_personnel_cost");
    expect(sql).toContain("assert_financial_date_open");
    expect(sql).toContain("La fecha contable pertenece");
  });
});

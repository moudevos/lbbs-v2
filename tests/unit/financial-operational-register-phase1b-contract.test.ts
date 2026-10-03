import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = path.resolve(root, "src/sql/170_release_pre_treasury.sql");

async function sql() { return readFile(migration, "utf8"); }

describe("Fase 1B: registro financiero operativo", () => {
  it("mantiene una fuente única para asiento y caja", async () => {
    const source = await sql();
    expect(source).toContain("create_operational_finance_entry");
    expect(source).toContain("'finance_manual_entry',v_entry.id");
    expect(source).toContain("cash_movements_active_source_idx");
    expect(source).toContain("on conflict(source_type,source_id) where status='active' do nothing");
  });

  it("separa gasto pagado, digital y pendiente", async () => {
    const source = await sql();
    expect(source).toContain("p_payment_status='pending'");
    expect(source).toContain("v_category.financial_group='asset_movement'");
    expect(source).toContain("v_category.affects_profit");
    expect(source).toContain("El pago en efectivo requiere una sesión POS abierta en la sede.");
    expect(source).toContain("'payable','liability_increase'");
  });

  it("permite pagos parciales sin crear un segundo gasto", async () => {
    const source = await sql();
    expect(source).toContain("pay_operational_accounts_payable");
    expect(source).toContain("outstanding_amount=round(outstanding_amount-v_payment.amount,2)");
    expect(source).toContain("'accounts_payable_payment'");
    expect(source).toContain("'liability_decrease'");
    expect(source).not.toContain("'operating_expense','expense','accounts_payable_payment'");
  });

  it("reversa documentos de origen y protege movimientos automáticos", async () => {
    const source = await sql();
    expect(source).toContain("cancel_operational_finance_entry");
    expect(source).toContain("No se puede anular una obligación con pagos");
    expect(source).toContain("reverse_financial_posting(v_payable_posting");
    expect(source).toContain("v_movement.is_system_generated");
    expect(source).toContain("Los gastos operativos se registran desde Registro de Costos y Gastos.");
  });

  it("calcula caja con apertura efectiva y ajustes con dirección", async () => {
    const source = await sql();
    expect(source).toContain("pos_session_opening_corrections");
    expect(source).toContain("adjustment_direction in ('increase','decrease')");
    expect(source).toContain("v_opening_increase-v_opening_decrease+v_total_cash");
    expect(source).toContain("v_adjustment_decrease+v_adjustment_increase");
    expect(source).toContain("Solo owner o admin puede corregir la apertura.");
    expect(source).toContain("v_session.status<>'open'");
  });
});

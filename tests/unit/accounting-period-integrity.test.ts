import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("fecha contable y periodos", () => {
  it("deriva la fecha de la jornada POS y no del cast UTC", async () => {
    const sql = await readFile(path.resolve(root, "src/sql/132_accounting_dates_and_period_integrity.sql"), "utf8");

    expect(sql).toContain("session.business_date");
    expect(sql).toContain("new.accounting_date := v_session.business_date");
    expect(sql).toContain("v_period := public.get_or_create_payroll_period(v_sale.accounting_date)");
    expect(sql).toContain("where accounting_date between v_period.start_date and v_period.end_date");
    expect(sql).not.toContain("get_or_create_payroll_period(coalesce(v_sale.closed_at");
  });

  it("no reescribe limites existentes y protege periodos cerrados", async () => {
    const sql = await readFile(path.resolve(root, "src/sql/132_accounting_dates_and_period_integrity.sql"), "utf8");
    const periodFunction = sql.slice(
      sql.indexOf("create or replace function public.get_or_create_payroll_period"),
      sql.indexOf("-- Asegura que existan los periodos"),
    );

    expect(periodFunction).toContain("on conflict (period_year, period_month, period_half) do nothing");
    expect(periodFunction).not.toContain("do update");
    expect(sql).toContain("if v_period.status in ('closed', 'cancelled')");
  });

  it("repara solo snapshots que no pertenecen a liquidaciones vigentes", async () => {
    const sql = await readFile(path.resolve(root, "src/sql/132_accounting_dates_and_period_integrity.sql"), "utf8");

    expect(sql).toContain("employee_settlement_service_lines");
    expect(sql).toContain("employee_settlement_bonus_lines");
    expect(sql.match(/settlement\.status <> 'cancelled'/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("accounting_date_snapshot");
    expect(sql).toContain("get_accounting_period_integrity_report");
  });

  it("las rutas financieras consultan la fecha operativa de PostgreSQL", async () => {
    const files = [
      "src/app/api/admin/production/route.ts",
      "src/app/api/admin/payroll-periods/route.ts",
      "src/app/api/admin/settlements/route.ts",
      "src/app/api/admin/finance/route.ts",
      "src/app/api/admin/contacts/route.ts",
      "src/app/api/admin/compensation-rules/[kind]/route.ts",
    ];
    const sources = await Promise.all(files.map((file) => readFile(path.resolve(root, file), "utf8")));

    for (const source of sources) {
      expect(source).toContain('rpc("pos_business_date")');
      expect(source).not.toContain("new Date().toISOString().slice(0, 10)");
    }
  });

  it("el historial de ventas filtra por la fecha contable de la sesión, no por un límite UTC", async () => {
    const route = await readFile(path.resolve(root, "src/app/api/admin/sales/route.ts"), "utf8");

    expect(route).toContain('gte("accounting_date", dateFrom)');
    expect(route).toContain('lte("accounting_date", dateTo)');
    expect(route).toContain('order("accounting_date", { ascending: false })');
    expect(route).not.toContain('gte("created_at", startOfDay');
    expect(route).not.toContain('lte("created_at", endOfDay');
  });

  it("producción y liquidaciones permanecen vinculadas al período y fecha operativa contables", async () => {
    const [production, settlements] = await Promise.all([
      readFile(path.resolve(root, "src/app/api/admin/production/route.ts"), "utf8"),
      readFile(path.resolve(root, "src/app/api/admin/settlements/route.ts"), "utf8"),
    ]);

    expect(production).toContain('.eq("payroll_period_id", periodId)');
    expect(production).toContain('.eq("sale.pos_session.status", "closed")');
    expect(settlements).toContain('rpc("pos_business_date")');
    expect(settlements).toContain('rpc("get_or_create_payroll_period"');
  });

  it("calcula el aporte operativo normal por unidad de servicio aunque el carrito consolide cantidades", async () => {
    const sql = await readFile(path.resolve(root, "src/sql/152_operational_contribution_per_service_unit.sql"), "utf8");

    expect(sql).toContain("v_unit_collected := case when v_item.quantity > 0 then round(v_collected / v_item.quantity, 2) else 0 end");
    expect(sql).toContain("v_item.quantity * public.calculate_operational_contribution(v_unit_collected, v_sale.accounting_date)");
    expect(sql).not.toContain("public.calculate_operational_contribution(v_collected, v_sale.accounting_date)");
    expect(sql).toContain("when v_source in ('reward', 'courtesy') then 0");
  });
});

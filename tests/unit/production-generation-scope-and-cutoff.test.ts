import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = resolve(
  root,
  "supabase/migrations/20261008121500_fix_production_generation_scope_and_cutoff.sql",
);
const sourcePath = resolve(
  root,
  "src/sql/20261008121500_fix_production_generation_scope_and_cutoff.sql",
);
const routePath = resolve(root, "src/app/api/admin/production/route.ts");
const uiPath = resolve(root, "src/features/production/ProductionPageClient.tsx");

const migration = readFileSync(migrationPath, "utf8");
const source = readFileSync(sourcePath, "utf8");
const route = readFileSync(routePath, "utf8");
const ui = readFileSync(uiPath, "utf8");

describe("generación acumulada de producción", () => {
  it("mantiene el SQL fuente y la migración byte-identical", () => {
    expect(source).toBe(migration);
  });

  it("limita la reasignación de bonos exclusivamente a la venta procesada", () => {
    expect(migration).toContain("bonus.sale_id = p_sale_id");
    expect(migration).toContain("item.sale_id = p_sale_id");
    expect(migration).toContain("bonus.sale_item_id = item.id");
  });

  it("no reactiva producción de ventas canceladas", () => {
    expect(migration).toContain("v_result := public.generate_employee_production_for_sale_v175(p_sale_id)");
    expect(migration).toContain("if v_sale_status <> 'completed' then");
    expect(migration).toContain("return v_result;");
  });

  it("omite ventas completed cuya sesión POS todavía no está cerrada", () => {
    expect(migration).toContain("v_sale_status = 'completed'");
    expect(migration).toContain("coalesce(v_session_status, '') <> 'closed'");
    expect(migration).toContain("'reason', 'open_pos_session'");
  });

  it("consolida el período solo hasta el día anterior en America/Lima", () => {
    expect(migration).toContain("v_business_date date := public.pos_business_date()");
    expect(migration).toContain("v_cutoff := least(v_period.end_date, v_business_date - 1)");
    expect(migration).toContain("sale.accounting_date between v_period.start_date and v_cutoff");
    expect(migration).toContain("sale.status = 'completed'");
    expect(migration).toContain("session.status = 'closed'");
  });

  it("la tabla existente también excluye el día operativo actual", () => {
    expect(route.match(/\.lt\("accounting_date", businessDate\)/g)?.length).toBe(2);
    expect(route).toContain('.eq("sale.pos_session.status", "closed")');
  });

  it("explica al usuario que la generación tiene corte hasta ayer", () => {
    expect(ui).toContain("hasta ayer");
    expect(ui).toContain("sesiones POS cerradas");
    expect(ui).toContain("cutoff_date");
  });
});

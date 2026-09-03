import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "src/sql/157_defer_sale_production_until_pos_closure.sql"),
  "utf8",
);

describe("producción diferida al cierre de sesión POS", () => {
  it("no genera producción cuando una venta acaba de completarse", () => {
    expect(sql).not.toContain("new.status = 'completed' and new.status is distinct from old.status then\n    perform");
    expect(sql).toContain("Nunca generar producción al pasar la venta a completed");
  });

  it("mantiene la reversión inmediata para una venta anulada", () => {
    expect(sql).toContain("new.status = 'cancelled' and new.status is distinct from old.status");
    expect(sql).toContain("perform public.generate_employee_production_for_sale(new.id);");
  });

  it("recrea el trigger histórico para que apunte al flujo corregido", () => {
    expect(sql).toContain("drop trigger if exists sales_production_sync on public.sales;");
    expect(sql).toContain("after update of status on public.sales");
  });
});

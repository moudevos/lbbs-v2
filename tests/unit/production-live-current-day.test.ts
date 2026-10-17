import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261017041945_production_live_preview_current_day.sql"),
  "utf8",
);
const source = readFileSync(
  resolve(process.cwd(), "src/sql/20261017041945_production_live_preview_current_day.sql"),
  "utf8",
);
const route = readFileSync(
  resolve(process.cwd(), "src/app/api/admin/production/route.ts"),
  "utf8",
);
const exportRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/admin/production/export/route.ts"),
  "utf8",
);
const ui = readFileSync(
  resolve(process.cwd(), "src/features/production/ProductionPageClient.tsx"),
  "utf8",
);

describe("producción en vivo del período", () => {
  it("mantiene migración y espejo SQL idénticos", () => {
    expect(source).toBe(migration);
  });

  it("incluye ventas completed del período sin exigir cierre de POS", () => {
    expect(migration).toContain("sale.status = 'completed'");
    expect(migration).toContain("sale.accounting_date between v_period.start_date and v_period.end_date");
    expect(migration).not.toContain("session.status = 'closed'");
    expect(migration).toContain("'is_live_preview', true");
  });

  it("no duplica líneas ya consolidadas", () => {
    expect(migration).toContain("from public.employee_service_production production");
    expect(migration).toContain("where production.sale_item_id = v_item.id");
    expect(migration).toContain("from public.employee_product_bonus_entries bonus");
    expect(migration).toContain("where bonus.sale_item_id = v_item.id");
  });

  it("mantiene la generación oficial sin cambios y mezcla el preview solo en lectura", () => {
    expect(route).toContain('supabase.rpc("get_live_production_preview"');
    expect(route).toContain("...(livePreview.services ?? [])");
    expect(route).toContain("...(livePreview.bonuses ?? [])");
    expect(route).toContain('supabase.rpc("generate_production_for_period"');
    expect(route.match(/\.lt\("accounting_date", businessDate\)/g)?.length).toBe(2);
  });

  it("muestra claramente que la producción en vivo no entra aún a liquidaciones", () => {
    expect(ui).toContain("también las del día actual");
    expect(ui).toContain("sesiones POS todavía abiertas");
    expect(ui).toContain("no pasan a liquidaciones hasta su consolidación oficial");
    expect(ui).toContain("Ventas pendientes de consolidar");
    expect(ui).toContain("En vivo");
  });

  it("incluye el mismo preview en la exportación del módulo", () => {
    expect(exportRoute).toContain('supabase.rpc("get_live_production_preview"');
    expect(exportRoute).toContain('row.is_live_preview ? "En vivo" : row.status');
    expect(exportRoute).toContain('bonus.is_live_preview ? "En vivo" : bonus.status');
  });
});

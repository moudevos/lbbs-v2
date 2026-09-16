import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("liquidación sobre ventas brutas y bloqueos activos", () => {
  it("calcula el 1 % desde las ventas brutas de servicios y productos atribuibles, con POS cerrado", async () => {
    const sql = await readFile(path.resolve(root, "src/sql/168_settlement_mandatory_discount_all_barber_sales.sql"), "utf8");

    expect(sql).toContain("production.original_line_total");
    expect(sql).toContain("production.production_source in ('normal', 'commercial_discount', 'reward')");
    expect(sql).toContain("employee_product_bonus_entries bonus");
    expect(sql).toContain("bonus.product_id is not null");
    expect(sql).toContain("item.original_total");
    expect(sql).toContain("sale.status = 'completed'");
    expect(sql).toContain("session.status = 'closed'");
    expect(sql).toContain("mandatory_discount_base_amount");
    expect(sql).toContain("v_mandatory_base / 100");
  });

  it("limita la deuda al pago disponible y evita reutilizarla en otra liquidación activa", async () => {
    const sql = await readFile(path.resolve(root, "src/sql/167_settlement_sales_discount_and_debt_reservation.sql"), "utf8");

    expect(sql).toContain("v_available_for_debt := greatest(v_gross - v_mandatory, 0)");
    expect(sql).toContain("other_settlement.status in ('draft', 'review', 'approved')");
    expect(sql).toContain("for update");
    expect(sql).toContain("Anúlala antes de recalcular");
  });

  it("informa en interfaz y API que una liquidación activa debe anularse", async () => {
    const [route, client, production] = await Promise.all([
      readFile(path.resolve(root, "src/app/api/admin/settlements/route.ts"), "utf8"),
      readFile(path.resolve(root, "src/features/settlements/SettlementsPageClient.tsx"), "utf8"),
      readFile(path.resolve(root, "src/features/production/ProductionPageClient.tsx"), "utf8"),
    ]);

    expect(route).toContain("ACTIVE_SETTLEMENT_EXISTS");
    expect(client).toContain("Anúlala antes de volver a recalcular");
    expect(production).toContain("sesiones POS cerradas");
    expect(production).toContain("producción pendiente de liquidar");
  });
});

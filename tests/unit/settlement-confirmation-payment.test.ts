import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("flujo final de liquidaciones", () => {
  it("conserva confirmar, aprobar, pagar y el bloqueo de anulación después del pago", async () => {
    const sql = await readFile(path.resolve(root, "src/sql/143_settlement_confirmation_payment_documents.sql"), "utf8");
    expect(sql).toContain("p_action in ('confirm', 'review')");
    expect(sql).toContain("p_action = 'approve'");
    expect(sql).toContain("v_row.status in ('draft', 'review', 'approved')");
    expect(sql).toContain("v_row.status = 'paid'");
  });

  it("registra pagos por fecha operativa sin requerir una sesión POS", async () => {
    const [sql, client] = await Promise.all([
      readFile(path.resolve(root, "src/sql/143_settlement_confirmation_payment_documents.sql"), "utf8"),
      readFile(path.resolve(root, "src/features/settlements/SettlementsPageClient.tsx"), "utf8"),
    ]);
    expect(sql).toContain("v_business_date date := public.pos_business_date()");
    expect(sql).toContain("branch_id, entry_date, direction");
    expect(client).not.toContain("posSessionId");
  });

  it("ofrece documento imprimible y PDF descargable, incluso después del pago", async () => {
    const [document, route] = await Promise.all([
      readFile(path.resolve(root, "src/features/settlements/EmployeeSettlementDocument.tsx"), "utf8"),
      readFile(path.resolve(root, "src/app/api/admin/settlements/[settlementId]/document/route.ts"), "utf8"),
    ]);
    expect(document).toContain("Descargar PDF");
    expect(document).toContain("window.print()");
    expect(route).toContain("renderToBuffer");
    expect(route).toContain('"application/pdf"');
  });

  it("alerta y bloquea el recálculo si el empleado tiene una liquidación activa", async () => {
    const [client, route] = await Promise.all([
      readFile(path.resolve(root, "src/features/settlements/SettlementsPageClient.tsx"), "utf8"),
      readFile(path.resolve(root, "src/app/api/admin/settlements/route.ts"), "utf8"),
    ]);
    expect(route).toContain("activeSettlements");
    expect(route).toContain("ACTIVE_SETTLEMENT_EXISTS");
    expect(client).toContain("availableEmployees");
    expect(client).toContain("Anúlala antes de volver a recalcular");
  });

  it("solo hace liquidable la producción de sesiones POS cerradas", async () => {
    const [sql, summary] = await Promise.all([
      readFile(path.resolve(root, "src/sql/144_closed_pos_session_production.sql"), "utf8"),
      readFile(path.resolve(root, "src/features/settlements/settlement-document-summary.ts"), "utf8"),
    ]);
    expect(sql).toContain("session.status = 'closed'");
    expect(sql).toContain("employee_service_production_closed_session_guard");
    expect(summary).toContain("original_line_total");
    expect(summary).toContain("operational_contribution_amount");
  });

  it("recalcula la producción cerrada antes de preparar la liquidación", async () => {
    const route = await readFile(path.resolve(root, "src/app/api/admin/settlements/route.ts"), "utf8");
    expect(route).toContain('supabase.rpc("generate_production_for_period"');
    expect(route).toContain("No se pudo recalcular la producción cerrada antes de liquidar.");
  });

  it("delega deudas automáticas a una única transacción de PostgreSQL", async () => {
    const [route, sql] = await Promise.all([
      readFile(path.resolve(root, "src/app/api/admin/settlements/route.ts"), "utf8"),
      readFile(path.resolve(root, "src/sql/167_settlement_sales_discount_and_debt_reservation.sql"), "utf8"),
    ]);
    expect(route).toContain("p_debt_deductions: debtDeductions");
    expect(sql).toContain("v_is_automatic boolean");
    expect(sql).toContain("order by debt.created_at");
  });

  it("no bloquea el checkout mientras la sesión POS está abierta", async () => {
    const sql = await readFile(path.resolve(root, "src/sql/145_defer_sale_production_until_pos_closure.sql"), "utf8");
    expect(sql).toContain("session.status = 'closed'");
    expect(sql).toContain("new.status = 'cancelled'");
    expect(sql).toContain("sales_production_sync_trigger");
  });
});

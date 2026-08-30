import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("flujo final de liquidaciones", () => {
  it("conserva confirmar, aprobar, pagar y el bloqueo de anulacion despues del pago", async () => {
    const sql = await readFile(path.resolve(root, "src/sql/143_settlement_confirmation_payment_documents.sql"), "utf8");

    expect(sql).toContain("p_action in ('confirm', 'review')");
    expect(sql).toContain("p_action = 'approve'");
    expect(sql).toContain("v_row.status in ('draft', 'review', 'approved')");
    expect(sql).toContain("v_row.status = 'paid'");
  });

  it("registra pagos por fecha operativa sin requerir una sesion POS", async () => {
    const sql = await readFile(path.resolve(root, "src/sql/143_settlement_confirmation_payment_documents.sql"), "utf8");
    const client = await readFile(path.resolve(root, "src/features/settlements/SettlementsPageClient.tsx"), "utf8");

    expect(sql).toContain("v_business_date date := public.pos_business_date()");
    expect(sql).toContain("branch_id, entry_date, direction");
    expect(sql).not.toContain("No existe una sesion POS activa");
    expect(client).not.toContain("posSessionId");
    expect(client).toContain("La fecha se registra automáticamente con la fecha operativa");
  });

  it("ofrece documento imprimible y PDF descargable, incluso despues del pago", async () => {
    const document = await readFile(path.resolve(root, "src/features/settlements/EmployeeSettlementDocument.tsx"), "utf8");
    const route = await readFile(path.resolve(root, "src/app/api/admin/settlements/[settlementId]/document/route.ts"), "utf8");

    expect(document).toContain("Descargar PDF");
    expect(document).toContain("window.print()");
    expect(route).toContain("renderToBuffer");
    expect(route).toContain('"application/pdf"');
  });

  it("no vuelve a ofrecer un empleado con liquidacion activa para el mismo periodo", async () => {
    const client = await readFile(path.resolve(root, "src/features/settlements/SettlementsPageClient.tsx"), "utf8");
    const route = await readFile(path.resolve(root, "src/app/api/admin/settlements/route.ts"), "utf8");

    expect(route).toContain("activeSettlementKeys");
    expect(route).toContain("currentPeriodIds");
    expect(client).toContain("availableEmployees");
    expect(client).toContain("debtLabels");
  });

  it("solo hace liquidable la producción de sesiones POS cerradas y resume sus importes reales", async () => {
    const sql = await readFile(path.resolve(root, "src/sql/144_closed_pos_session_production.sql"), "utf8");
    const summary = await readFile(path.resolve(root, "src/features/settlements/settlement-document-summary.ts"), "utf8");

    expect(sql).toContain("session.status = 'closed'");
    expect(sql).toContain("employee_service_production_closed_session_guard");
    expect(summary).toContain("original_line_total");
    expect(summary).toContain("operational_contribution_amount");
  });

  it("recalcula la producción cerrada automáticamente antes de preparar una liquidación", async () => {
    const route = await readFile(path.resolve(root, "src/app/api/admin/settlements/route.ts"), "utf8");

    expect(route).toContain('supabase.rpc("generate_production_for_period"');
    expect(route).toContain("No se pudo recalcular la producción cerrada antes de liquidar.");
  });

  it("aplica automáticamente deudas vigentes cuando no se indica un descuento manual", async () => {
    const route = await readFile(path.resolve(root, "src/app/api/admin/settlements/route.ts"), "utf8");

    expect(route).toContain("manualDebtDeductions");
    expect(route).toContain("availableForDebt");
    expect(route).toContain("deudas vigentes más antiguas");
  });

  it("no bloquea el checkout mientras la sesión POS esté abierta", async () => {
    const sql = await readFile(path.resolve(root, "src/sql/145_defer_sale_production_until_pos_closure.sql"), "utf8");

    expect(sql).toContain("session.status = 'closed'");
    expect(sql).toContain("new.status = 'cancelled'");
    expect(sql).toContain("sales_production_sync_trigger");
  });
});

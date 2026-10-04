import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(resolve(root, file), "utf8");
const draftConfirmationBlock = (sql: string) => sql.slice(
  sql.indexOf("-- BLOQUE: Settlement draft and atomic confirmation"),
  sql.indexOf("-- BLOQUE: Settlement payment cash guard"),
);

describe("193 settlement draft UX contract", () => {
  it("keeps the initial modal limited to period, employee and commission rate", () => {
    const form = read("src/features/settlements/SettlementDraftForm.tsx");
    expect(form).toContain("Periodo");
    expect(form).toContain("Empleado");
    expect(form).toContain("Porcentaje de comisión");
    expect(form).not.toContain("SettlementDebtSelection");
    expect(form).toContain("debtDeductions: []");
  });

  it("uses settlement snapshots for detail and groups the visible production by VTA reference", () => {
    const [route, summary, detail] = [
      read("src/app/api/admin/settlements/[settlementId]/route.ts"),
      read("src/features/settlements/settlement-document-summary.ts"),
      read("src/features/settlements/SettlementDetailPageClient.tsx"),
    ];
    expect(route).toContain('employee_settlement_service_lines").select("*")');
    expect(route).not.toContain("production:employee_service_production");
    expect(summary).toContain("sale_reference_snapshot");
    expect(summary).not.toContain("relation(line.production)");
    expect(detail).toContain("Detalle de producción y ventas");
    expect(detail).toContain("groupSettlementProductionBySale");
    expect(summary).toContain("saleReference");
    expect(detail.indexOf("Detalle de producción y ventas")).toBeLessThan(detail.indexOf("<SettlementDebtSelection"));
    expect(detail).toContain("No existen líneas de producción asociadas a este borrador.");
    expect(detail).toContain("groupSettlementProductionBySale");
    expect(detail).toContain("Producción reconocida detallada");
  });

  it("previews and persistently reserves draft debts without consuming outstanding", () => {
    const [detail, migration] = [
      read("src/features/settlements/SettlementDetailPageClient.tsx"),
      read("src/sql/170_release_pre_treasury.sql"),
    ];
    expect(detail).toContain("Guardando…");
    expect(detail).toContain("Guardar borrador");
    expect(detail).toContain('saveState !== "saved" && !await persistDraft()');
    expect(detail).not.toContain("scheduleDraftSave");
    expect(detail).toContain('title: "No se guardaron los cambios del borrador", text: errorText(error)');
    expect(detail).toContain("update_draft");
    expect(detail).toContain("selectedDebtTotal");
    const block = draftConfirmationBlock(migration);
    expect(block).toContain("update_employee_settlement_draft_v193");
    expect(block).toContain("delete from public.employee_settlement_deductions where settlement_id = p_settlement_id");
    expect(block).not.toContain("update public.employee_debts set outstanding_amount");
  });

  it("confirms atomically and preserves canonical payment and cancellation contracts", () => {
    const [route, migration, detail] = [
      read("src/app/api/admin/settlements/[settlementId]/route.ts"),
      read("src/sql/170_release_pre_treasury.sql"),
      read("src/features/settlements/SettlementDetailPageClient.tsx"),
    ];
    expect(route).toContain('confirm_employee_settlement_v193');
    const block = draftConfirmationBlock(migration);
    expect(block).toContain("review_employee_settlement");
    expect(block).toContain("transition_employee_settlement(p_settlement_id, 'approve', null)");
    expect(detail).toContain("paymentParts");
    expect(detail).toContain("CALCULATION_ERROR");
    expect(detail).toContain("WRONG_EMPLOYEE");
    expect(detail).toContain("ADMINISTRATIVE_CORRECTION");
  });
});

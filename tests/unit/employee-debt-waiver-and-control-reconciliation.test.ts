import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("deudas auditadas y conciliación por sede", () => {
  it("mantiene la anulación de deuda auditada y reserva penalidades para administración", async () => {
    const sql = await readFile(path.resolve(root, "supabase/migrations/20260902051446_employee_debt_waivers_and_control_reconciliation.sql"), "utf8");
    const route = await readFile(path.resolve(root, "src/app/api/admin/employee-debts/route.ts"), "utf8");

    expect(sql).toContain("'penalty'");
    expect(sql).toContain("v_waived_amount := v_debt.outstanding_amount");
    expect(sql).toContain("'write_off', v_waived_amount");
    expect(route).toContain('body?.action === "waive"');
    expect(route).toContain("canWaiveDebts");
  });

  it("concilia por fecha operativa, aportes y cobros reales", async () => {
    const route = await readFile(path.resolve(root, "src/app/api/admin/control/kpis/route.ts"), "utf8");
    const client = await readFile(path.resolve(root, "src/features/control/ControlKpis.tsx"), "utf8");

    expect(route).toContain('gte("accounting_date", dateFrom)');
    expect(route).toContain("operational_contribution_amount");
    expect(route).toContain("branchReconciliations");
    expect(client).toContain("Conciliación diaria por sede");
    expect(client).toContain("Total real de venta");
    expect(client).toContain("Total real de cobro");
    expect(client).toContain("Costo de cortesías");
    expect(route).toContain("employeeDebtCharges");
  });
});

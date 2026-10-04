import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("Fase 5: costo laboral devengado", () => {
  it("conserva condiciones históricas y evita vigencias superpuestas", async () => {
    const sql = await readFile(path.resolve(root, "src/sql/170_release_pre_treasury.sql"), "utf8");
    expect(sql).toContain("employee_compensation_terms");
    expect(sql).toContain("commission_plus_bonus");
    expect(sql).toContain("fixed_plus_bonus");
    expect(sql).toContain("daterange(other_term.effective_from");
    expect(sql).toContain("capture_employee_compensation_snapshot");
    expect(sql).not.toContain("update public.employee_service_production\nset compensation_mode_snapshot");
  });

  it("separa devengo, liquidación y pago sin duplicar el costo", async () => {
    const sql = await readFile(path.resolve(root, "src/sql/170_release_pre_treasury.sql"), "utf8");
    expect(sql).toContain("get_employee_compensation_accruals");
    expect(sql).toContain("accruedUnsettled");
    expect(sql).toContain("settledUnpaid");
    expect(sql).toContain("payment.status='posted'");
    expect(sql).toContain("UNSETTLED_PRODUCTION_WITH_KNOWN_COST");
    expect(sql).toContain("UNRESOLVED_COMPENSATION_RATE");
  });

  it("impide cerrar nómina cuando el costo sigue sin resolver", async () => {
    const sql = await readFile(path.resolve(root, "src/sql/170_release_pre_treasury.sql"), "utf8");
    expect(sql).toContain("close_payroll_period");
    expect(sql).toContain("producciones con compensación sin resolver");
    expect(sql).toContain("payroll_period_snapshots");
  });
});

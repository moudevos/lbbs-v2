import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261023012900_employee_benefit_commercial_courtesy.sql"),
  "utf8",
);

describe("POS: beneficio interno y cortesia comercial", () => {
  it("permite cortesias solo para empleados con beneficio y ventas normales", () => {
    expect(sql).toContain("if v_operation_kind not in (''customer'', ''employee_benefit'') and exists (");
    expect(sql).toContain("v_old_guard CONSTANT text");
    expect(sql).toContain("v_new_guard CONSTANT text");
  });

  it("mantiene separados credito, cortesias internas y socios", () => {
    expect(sql).toContain("employee_credit    -> sigue bloqueado.");
    expect(sql).toContain("internal_complimentary -> sigue bloqueado.");
    expect(sql).toContain("socio_benefit      -> mantiene su motor y restricciones independientes.");
  });

  it("exige un servicio con importe positivo despues de aplicar el beneficio", () => {
    expect(sql).toContain("if v_operation_kind = 'employee_benefit'");
    expect(sql).toContain("and v_courtesy_total > 0");
    expect(sql).toContain("and round(coalesce(item.total, 0), 2) > 0");
    expect(sql).toContain("item.item_type = 'service'");
  });

  it("falla ante cambios incompatibles y admite reejecucion", () => {
    expect(sql).toContain("No se encontro el guard original");
    expect(sql).toContain("El contrato del checkout atomico cambio");
    expect(sql).toContain("LBBS_EMPLOYEE_BENEFIT_COMMERCIAL_COURTESY_V1");
    expect(sql).toContain("IF position(v_marker IN v_definition) > 0 THEN");
  });

  it("no reescribe ventas ni cambia configuraciones previas", () => {
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
    expect(sql).not.toMatch(/\bdrop\s+(table|function|trigger)\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\.sales\b/i);
    expect(sql).not.toMatch(/\bcreate\s+or\s+replace\s+function\s+public\.checkout_pos_sale\s*\(/i);
  });
});

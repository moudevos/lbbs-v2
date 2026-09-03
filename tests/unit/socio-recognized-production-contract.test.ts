import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "src/sql/155_socio_recognized_production_base.sql");
const sql = readFileSync(root, "utf8");

describe("contrato de producción reconocida para socios", () => {
  it("mantiene un alcance exclusivo de socio sin alterar el predeterminado de empleados", () => {
    expect(sql).toContain("beneficiary_scope text not null default 'employee'");
    expect(sql).toContain("('employee', 'socio', 'both')");
  });

  it("guarda los valores de producción y aporte como instantánea en la operación", () => {
    expect(sql).toContain("recognized_production_amount numeric(12,2) not null default 0");
    expect(sql).toContain("recognized_production_amount,created_by");
    expect(sql).toContain("v_rule.recognized_production_amount");
  });

  it("calcula la base variable por cada servicio y no desde el cobro de S/ 0", () => {
    expect(sql).toContain("v_recognized_per_service");
    expect(sql).toContain("v_recognized_total-v_contribution_total");
    expect(sql).toContain("v_operation_kind='socio_benefit'");
  });

  it("expone reglas de socio solo al socio y no habilita crédito", () => {
    expect(sql).toContain("r.beneficiary_scope = 'socio'");
    expect(sql).toContain("'canUseCredit',case when v_kind='employee'");
  });
});

import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("contrato del módulo de deudas de empleados", () => {
  async function source() {
    return readFile(path.resolve(process.cwd(), "src/app/api/admin/employee-debts/route.ts"), "utf8");
  }

  it("protege la lectura y las mutaciones con sesión administrativa", async () => {
    const route = await source();
    expect(route.match(/requireAdminSession\(\)/g)).toHaveLength(2);
  });

  it("resuelve de forma explícita el empleado deudor y no el creador", async () => {
    const route = await source();
    expect(route).toContain("employees!employee_debts_employee_id_fkey");
  });

  it("no presenta crédito interno como método de pago manual", async () => {
    const route = await source();
    expect(route).toContain('.neq("payment_kind", "internal_credit")');
  });

  it("preserva el libro contable usando las RPC de creación y pago", async () => {
    const route = await source();
    expect(route).toContain('rpc("create_employee_debt"');
    expect(route).toContain('rpc("apply_employee_debt_payment"');
    expect(route).not.toContain('.from("employee_debts").insert');
    expect(route).not.toContain('.from("employee_debts").update');
  });
});

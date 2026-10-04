import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("188 employee debt selection contract", () => {
  const sql = read("src/sql/170_release_pre_treasury.sql");

  it("uses individual amount reservations, not a global automatic mode", () => {
    expect(sql).toContain("prepare_employee_settlement_v188");
    expect(sql).toContain("active_reserved_amount");
    expect(sql).toContain("greatest(debt.outstanding_amount - coalesce(reserved.amount, 0), 0)");
    expect(sql).toContain("employee_settlement_deductions");
    expect(sql).toContain("debtId");
  });

  it("keeps preparation as reservation and consumes only via the canonical paid flow", () => {
    expect(sql).toContain("remove its legacy automatic reservation");
    expect(sql).toContain("delete from public.employee_settlement_deductions where settlement_id = v_settlement.id");
  });

  it("limits settlement write-off controls to penalties and provides a recoverable collection", () => {
    expect(sql).toContain("waive_employee_penalty_v188");
    expect(sql).toContain("v_debt.debt_type <> 'penalty'");
    expect(sql).toContain("collect_employee_debt_v188");
    expect(sql).toContain("No existe una caja abierta en esta sede");
    expect(sql).toContain("manual_payment");
  });

  it("normalizes the client payload and routes preparation through the 193 draft wrapper", () => {
    const route = read("src/app/api/admin/settlements/route.ts");
    expect(route).toContain("item.debt_id ?? item.debtId");
    expect(route).toContain('prepare_employee_settlement_v193');
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const detail = readFileSync(resolve(process.cwd(), "src/features/settlements/SettlementDetailPageClient.tsx"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "src/sql/20261016232914_allow_zero_net_settlement_close.sql"), "utf8");

describe("zero-net settlement close", () => {
  it("allows an empty payment list only when the net is zero", () => {
    expect(migration).toContain("v_zero_net := round(coalesce(v_settlement.net_pay_amount, 0), 2) = 0");
    expect(migration).toContain("if v_zero_net then");
    expect(migration).toContain("jsonb_array_length(p_payment_parts) <> 0");
    expect(migration).toContain("Una liquidación con neto cero no requiere métodos de pago.");
    expect(migration).toContain("Registra al menos un método de pago.");
  });

  it("does not create a zero-amount settlement payment", () => {
    expect(migration).toContain("if v_amount <= 0");
    expect(migration).toContain("insert into public.employee_settlement_payments");
    expect(migration).not.toContain("values (p_settlement_id, v_settlement.employee_id, null, 0");
  });

  it("still applies reserved debts before marking the settlement paid", () => {
    const debtMovement = migration.indexOf("insert into public.employee_debt_movements");
    const paid = migration.indexOf("status = 'paid'", debtMovement);
    expect(debtMovement).toBeGreaterThan(-1);
    expect(paid).toBeGreaterThan(debtMovement);
  });

  it("uses the zero-net close UX without asking for a payment method", () => {
    expect(detail).toContain('const isZeroNet = cents(numeric(payload?.data.net_pay_amount)) === 0;');
    expect(detail).toContain('paymentParts: isZeroNet ? []');
    expect(detail).toContain('isZeroNet ? "Cerrar liquidación" : "Pagar"');
    expect(detail).toContain('"¿Cerrar la liquidación sin desembolso?"');
    expect(detail).toContain('"Sí, cerrar liquidación"');
    expect(detail).toContain("Sin desembolso.");
  });
});

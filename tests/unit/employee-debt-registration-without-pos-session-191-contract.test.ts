import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = path.join(
  root,
  "src/sql/170_release_pre_treasury.sql",
);
const debtRegistrationBlock = (sql: string) => sql.slice(
  sql.indexOf("-- BLOQUE: Debt registration without POS session"),
  sql.indexOf("-- BLOQUE: Settlement sale references"),
);

describe("191 · registro de deuda independiente de POS", () => {
  it("distingue efectivo conciliado en POS de efectivo externo pendiente", async () => {
    const migration = await readFile(migrationPath, "utf8");
    const block = debtRegistrationBlock(migration);
    expect(block).toContain("cash_context in ('pos', 'external')");
    expect(block).toContain("reconciliation_status in ('reconciled', 'pending')");
    expect(block).toContain("then 'external' else 'pos'");
    expect(block).toContain("then 'pending' else 'reconciled'");
    expect(block).not.toContain("No existe una caja abierta");
  });

  it("exige composición exacta y sin métodos repetidos solo para préstamo/adelanto", async () => {
    const migration = await readFile(migrationPath, "utf8");
    const block = debtRegistrationBlock(migration);
    expect(block).toContain("not in ('loan', 'advance', 'penalty', 'administrative_charge')");
    expect(block).toContain("v_method.id::text = any(v_method_ids)");
    expect(block).toContain("round(v_total, 2) <> round(p_amount, 2)");
    expect(block).toContain("payment_kind in ('cash', 'wallet_qr', 'bank_transfer')");
    expect(block).toContain("La referencia es obligatoria para desembolsos digitales.");
  });

  it("solo crea movimiento de caja cuando la salida corresponde a una sesión abierta", async () => {
    const migration = await readFile(migrationPath, "utf8");
    const block = debtRegistrationBlock(migration);
    expect(block).toContain("v_session := null;");
    expect(block).toContain("v_method.payment_kind = 'cash' and v_session.id is not null");
    expect(block).toContain("perform public.sync_pos_session_totals(v_session.id)");
  });

  it("no bloquea en la interfaz por una sesión POS ni por un método de pago inexistente en el formulario", async () => {
    const component = await readFile(
      path.join(root, "src/features/employees/EmployeeDebtsPageClient.tsx"),
      "utf8",
    );
    expect(component).toContain("disabled={!canSubmitDebt}");
    expect(component).toContain("Fuera de caja POS");
    expect(component).toContain("Pendiente de conciliación");
    expect(component).not.toContain("disabled={!form.paymentMethodId || Number(form.amount) <= 0}");
  });
});

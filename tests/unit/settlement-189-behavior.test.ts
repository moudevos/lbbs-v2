import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Debt = { outstanding: number; reservations: number[]; ledger: number[] };

function available(debt: Debt) {
  return debt.outstanding - debt.reservations.reduce((total, value) => total + value, 0);
}

function consumeCurrentOutstanding(debt: Debt, deduction: number, settlementKey: string, consumed: Set<string>) {
  if (consumed.has(settlementKey)) return debt.outstanding;
  if (deduction > debt.outstanding) throw new Error("insufficient outstanding");
  debt.outstanding -= deduction;
  debt.ledger.push(-deduction);
  consumed.add(settlementKey);
  return debt.outstanding;
}

describe("189 settlement debt behavior", () => {
  it("keeps products out of the percentage base while mandatory discount uses all recognized production", () => {
    const recognizedServicesAndRewards = 185;
    const products = 105;
    const contribution = 14;
    const commission = (recognizedServicesAndRewards - contribution) * 0.6;
    const bonus = 6;
    const gross = commission + bonus;
    const mandatory = (recognizedServicesAndRewards + products) * 0.01;
    expect(commission).toBe(102.6);
    expect(gross).toBe(108.6);
    expect(mandatory).toBe(2.9);
    expect(gross - mandatory - 60).toBeCloseTo(45.7, 8);
  });

  it("requires a full, non-duplicated payment split", () => {
    const due = 45.7;
    const valid = [{ method: "cash", amount: 20 }, { method: "wallet", amount: 25.7 }];
    expect(valid.reduce((sum, part) => sum + part.amount, 0)).toBeCloseTo(due, 8);
    expect(new Set(valid.map((part) => part.method)).size).toBe(valid.length);
    const duplicated = [...valid, { method: "cash", amount: 0.01 }];
    expect(new Set(duplicated.map((part) => part.method)).size).not.toBe(duplicated.length);
  });
  it("uses current outstanding for two concurrent partial reservations", () => {
    const debt: Debt = { outstanding: 100, reservations: [30, 20], ledger: [] };
    expect(available(debt)).toBe(50);
    const consumed = new Set<string>();
    expect(consumeCurrentOutstanding(debt, 30, "A", consumed)).toBe(70);
    expect(consumeCurrentOutstanding(debt, 20, "B", consumed)).toBe(50);
    expect(debt.ledger).toEqual([-30, -20]);
  });

  it("does not consume the same settlement deduction twice", () => {
    const debt: Debt = { outstanding: 100, reservations: [30], ledger: [] };
    const consumed = new Set<string>();
    expect(consumeCurrentOutstanding(debt, 30, "A", consumed)).toBe(70);
    expect(consumeCurrentOutstanding(debt, 30, "A", consumed)).toBe(70);
    expect(debt.ledger).toEqual([-30]);
  });

  it("keeps cancellation as a reservation release, not a debt consumption", () => {
    const debt: Debt = { outstanding: 100, reservations: [30], ledger: [] };
    debt.reservations = [];
    expect(debt.outstanding).toBe(100);
    expect(available(debt)).toBe(100);
    expect(debt.ledger).toEqual([]);
  });

  it("contains the current-outstanding lock and cash disbursement guard in the migration", () => {
    const sql = readFileSync(resolve(process.cwd(), "src/sql/170_release_pre_treasury.sql"), "utf8");
    expect(sql).toContain("where id = v_deduction.employee_debt_id for update");
    expect(sql).toContain("v_debt.outstanding_amount - v_deduction.amount");
    expect(sql).toContain("employee_debt_movements_settlement_deduction_once");
    expect(sql).toContain("No existe una caja abierta en esta sede para registrar el desembolso en efectivo.");
    expect(sql).toContain("employee_debt_disbursement");
    expect(sql).toContain("create table if not exists public.employee_settlement_payments");
    expect(sql).toContain("pay_employee_settlement_v189");
    expect(sql).toContain("La suma de las partes debe coincidir exactamente con el neto de la liquidación.");
    expect(sql).toContain("create or replace view public.vw_employee_debt_profiles");
  });
});
